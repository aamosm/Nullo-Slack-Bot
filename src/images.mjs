import { setTimeout as sleep } from 'node:timers/promises';

export function safeError(error) {
  return String(error?.data?.error || error?.code || error?.message || 'Unknown error')
    .replace(/xox[baprs]-[A-Za-z0-9-]+|xapp-[A-Za-z0-9-]+/g, '[redacted]')
    .replace(/https:\/\/hooks\.slack\.com\/\S+/g, '[response URL]');
}

export function imageAdvice(stage, error) {
  const code = safeError(error);
  if (code === 'missing_scope') return 'Add files:write under Bot Token Scopes, then reinstall the Slack app.';
  if (code === 'not_in_channel' || code === 'channel_not_found') return 'Invite Nullo to this channel with /invite @Nullo.';
  if (['invalid_auth', 'token_revoked', 'not_authed'].includes(code)) return 'Check SLACK_BOT_TOKEN and restart Nullo.';
  if (stage === 'render') return 'Run npm run probe in the bot folder. If Chromium is missing, run npm run setup.';
  if (stage === 'embed') return 'The PNG was uploaded to this message’s thread, but Slack rejected the inline image.';
  return `Slack could not upload the PNG (${code.slice(0, 120)}). Check the terminal for details.`;
}

export async function deliverPortraits({ website, client, channel, ts, view, portraits, logger = console, wait = sleep }) {
  const images = [], errors = [];
  let rendered = 0, uploaded = 0;
  for (const portrait of portraits) {
    let stage = 'render';
    try {
      const png = await website.portrait(portrait.seed);
      rendered++;
      stage = 'upload';
      const result = await client.files.uploadV2({
        channel_id: channel, thread_ts: ts, file: png,
        filename: `alien-${portrait.seed.slice(0, 32)}.png`,
        title: portrait.label, alt_txt: portrait.label,
      });
      const file = result.files?.flatMap(item => item.files || [item]).find(item => item.id);
      if (!file) throw new Error('upload_returned_no_file_id');
      uploaded++;
      images.push({ type: 'image', slack_file: { id: file.id }, alt_text: portrait.label });
    } catch (error) {
      errors.push({ stage, code: safeError(error), advice: imageAdvice(stage, error) });
      logger.warn(`Image ${stage} failed for seed ${portrait.seed}: ${safeError(error)}`);
    }
  }
  const blocks = [...view.blocks];
  blocks.splice(1, 0, ...images);
  if (errors.length) blocks.push({ type: 'context', elements: [{ type: 'plain_text', text: `Image unavailable: ${[...new Set(errors.map(e => e.advice))].join(' ')}` }] });
  let embedded = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await client.chat.update({ channel, ts, ...view, blocks });
      embedded = images.length;
      break;
    } catch (error) {
      const retryable = ['invalid_blocks', 'file_not_found', 'file_not_available'].includes(error?.data?.error);
      if (images.length && retryable && attempt < 3) {
        await wait(1000 * 2 ** attempt);
        continue;
      }
      errors.push({ stage: 'embed', code: safeError(error), advice: images.length ? imageAdvice('embed', error) : 'Slack also rejected the card status update.' });
      logger.warn(`Image embed failed: ${safeError(error)}`);
      break;
    }
  }
  return { ok: !errors.length, rendered, uploaded, embedded, errors };
}

export function imageReport(result) {
  return `Image check: ${result.rendered} rendered, ${result.uploaded} uploaded, ${result.embedded} embedded in chat.${result.errors.length ? '\n' + result.errors.map(e => `${e.stage}: ${e.code.slice(0, 400)}\n${e.advice}`).join('\n') : ''}`;
}
