import 'dotenv/config';
import { App } from '@slack/bolt';
import { randomBytes, randomInt } from 'node:crypto';
import { openWebsite } from './website.mjs';

const site = process.env.ALIEN_SITE_BASE;
const website = await openWebsite(site);
const schema = await website.request({ op: 'schema' });
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});
const seed = () => randomBytes(8).readBigUInt64BE().toString();
const code = () => randomBytes(16).toString('hex');
const generate = value => website.request({
  op: 'generate', seed: value, options: { generatorVersion: 2, compact: true },
});
const help = '/nullo random · /nullo raw · /nullo 42 · /nullo-duel 42 · /nullo-pick pizza | noodles';

async function ordinary(exclude = '') {
  for (let i = 0; i < 24; i++) {
    const alien = await generate(seed());
    if (alien.kind === 'alien' && alien.identity.seed !== exclude) return alien;
  }
  throw new Error('Could not find a new ordinary alien.');
}

function register(name, handler) {
  app.command(name, async args => {
    await args.ack();
    try { await handler(args); }
    catch (error) {
      args.logger.error(error.message);
      await args.respond({
        response_type: 'ephemeral',
        text: 'That request could not be completed. Check the command and try again.',
      });
    }
  });
}

register('/nullo', async ({ command, client, respond }) => {
  const input = command.text.trim();
  if (!input || input === 'help') {
    await respond({ response_type: 'ephemeral', text: help });
    return;
  }
  const alien = input === 'random' ? await ordinary() : await generate(input === 'raw' ? seed() : input);
  const png = await website.portrait(alien.identity.seed, alien.generatorVersion);
  const url = new URL(site);
  url.search = new URLSearchParams({ seed: alien.identity.seed, v: '2' }).toString();
  const names = alien.combat.abilities.map(id => schema.combat.abilities[id].name).join(', ');
  const message = await client.chat.postMessage({
    channel: command.channel_id,
    text: `Alien ${alien.identity.seed}\n${names || 'Special form'}\n<${url.href}|Open on site>`,
    unfurl_links: false, unfurl_media: false,
  });
  await client.files.uploadV2({
    channel_id: command.channel_id, thread_ts: message.ts,
    file: png, filename: 'alien.png', title: `Alien ${alien.identity.seed}`,
  });
});

register('/nullo-duel', async ({ command, respond }) => {
  const args = command.text.trim().split(/\s+/).filter(Boolean);
  if (args.length > 2) throw new Error('Use up to two seeds.');
  const left = args[0] ? await generate(args[0]) : await ordinary();
  const right = args[1] ? await generate(args[1]) : await ordinary(left.identity.seed);
  const battleSeed = code();
  const result = await website.request({
    op: 'duel', left: left.identity.seed, right: right.identity.seed,
    options: { battleSeed, terrain: 'random', time: 'random' },
  });
  const outcome = result.winner === null
    ? 'Draw'
    : `Seed ${[left, right][result.winner].identity.seed} wins`;
  await respond({
    response_type: 'in_channel',
    text: `${left.identity.seed} vs ${right.identity.seed}\n${outcome} after ${result.round} rounds.\n${result.environment.terrain} · ${result.environment.time}\nEncounter: ${battleSeed}`,
  });
});

register('/nullo-pick', async ({ command, client }) => {
  const options = command.text.split('|').map(s => s.trim());
  const unique = new Set(options.map(s => s.normalize('NFKC').toLowerCase()));
  if (options.length < 2 || options.length > 10 || options.some(s => !s || s.length > 80) || unique.size !== options.length) {
    throw new Error('Use 2–10 distinct options, each 1–80 characters long.');
  }
  const winner = options[randomInt(options.length)];
  await client.chat.postMessage({
    channel: command.channel_id,
    text: 'Nullo picked an option.',
    blocks: [{ type: 'section', text: {
      type: 'plain_text', text: `Picked: ${winner}\n${options.join(' | ')}\nEach option had a 1 in ${options.length} chance.`,
    } }],
  });
});

app.error(error => console.error(error.message));
await app.start();
console.log('Nullo is connected.');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await app.stop();
    await website.close();
    process.exit(0);
  });
}