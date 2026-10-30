import 'dotenv/config';
import { App } from '@slack/bolt';
import { randomBytes, randomInt } from 'node:crypto';
import { openWebsite } from './website.mjs';

const required = ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'ALIEN_SITE_BASE'];
for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Missing ${name}. Add it to your local .env file.`);
  }
}

const site = new URL(process.env.ALIEN_SITE_BASE);
if (site.protocol !== 'https:') {
  throw new Error('ALIEN_SITE_BASE must be an HTTPS URL.');
}

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true
});

let website;
let schema;
let shuttingDown = false;

const randomSeed = () => randomBytes(8).readBigUInt64BE().toString();
const encounterCode = () => randomBytes(16).toString('hex');

const generate = seed => website.request({
  op: 'generate',
  seed: String(seed),
  options: { generatorVersion: 2, compact: true }
});

async function ordinary(exclude = '') {
  for (let attempt = 0; attempt < 24; attempt++) {
    const alien = await generate(randomSeed());
    if (alien?.kind === 'alien' && alien?.identity?.seed !== exclude) return alien;
  }
  throw new Error('Could not find an ordinary alien after 24 attempts.');
}

function register(commandName, handler) {
  app.command(commandName, async args => {
    await args.ack();

    try {
      await handler(args);
    } catch (error) {
      const incident = randomBytes(3).toString('hex');
      args.logger.error(`[${incident}] ${error?.stack ?? error}`);

      try {
        await args.respond({
          response_type: 'ephemeral',
          text: `Nullo couldn't complete that request. Error ID: ${incident}. Check the bot logs.`
        });
      } catch (responseError) {
        args.logger.error(`Could not send Slack error response: ${responseError?.stack ?? responseError}`);
      }
    }
  });
}

register('/nullo-ping', async ({ client, respond }) => {
  const started = Date.now();
  const auth = await client.auth.test();
  const slackMs = Date.now() - started;

  let websiteStatus;
  try {
    const check = await website.request({ op: 'schema' });
    websiteStatus = check ? 'online' : 'returned an empty schema';
  } catch (error) {
    websiteStatus = `error: ${error.message}`;
  }

  await respond({
    response_type: 'ephemeral',
    text: [
      '*Nullo status*',
      `• Slack connection: online (${slackMs} ms)`,
      `• Bot identity: ${auth.user ?? 'authenticated'}`,
      `• Alien website API: ${websiteStatus}`,
      `• Chromium: ${website ? 'running' : 'not initialized'}`
    ].join('\n')
  });
});

register('/nullo', async ({ command, client, respond }) => {
  const input = command.text.trim();

  if (!input || input.toLowerCase() === 'help') {
    await respond({
      response_type: 'ephemeral',
      text: [
        '*Nullo commands*',
        '`/nullo 42` — generate a specific alien',
        '`/nullo random` — discover an ordinary alien',
        '`/nullo raw` — generate from one unfiltered random 64-bit seed',
        '`/nullo-ping` — check bot and website connectivity',
        '`/nullo-duel 42 98765` — run a duel',
        '`/nullo-pick pizza | noodles | tacos` — choose between options'
      ].join('\n')
    });
    return;
  }

  const alien = input.toLowerCase() === 'random'
    ? await ordinary()
    : await generate(input.toLowerCase() === 'raw' ? randomSeed() : input);

  if (!alien?.identity?.seed) {
    throw new Error(`Unexpected alien response: ${JSON.stringify(alien).slice(0, 1000)}`);
  }

  const seed = String(alien.identity.seed);
  const png = await website.portrait(seed, alien.generatorVersion ?? 2);
  const url = new URL(site);
  url.search = new URLSearchParams({ seed, v: '2' }).toString();

  const abilityNames = (alien.combat?.abilities ?? [])
    .map(id => schema?.combat?.abilities?.[id]?.name ?? id)
    .join(', ');

  const message = await client.chat.postMessage({
    channel: command.channel_id,
    text: `Alien ${seed}\n${abilityNames || 'Special form'}\n<${url.href}|Open on site>`,
    unfurl_links: false,
    unfurl_media: false
  });

  await client.files.uploadV2({
    channel_id: command.channel_id,
    thread_ts: message.ts,
    file: png,
    filename: `alien-${seed}.png`,
    title: `Alien ${seed}`
  });
});

register('/nullo-duel', async ({ command, respond }) => {
  const args = command.text.trim().split(/\s+/).filter(Boolean);
  if (args.length > 2) {
    throw new Error('Usage: /nullo-duel [left-seed] [right-seed]');
  }

  const left = args[0] ? await generate(args[0]) : await ordinary();
  const right = args[1] ? await generate(args[1]) : await ordinary(left.identity.seed);

  const battleSeed = encounterCode();
  const result = await website.request({
    op: 'duel',
    left: left.identity.seed,
    right: right.identity.seed,
    options: { battleSeed, terrain: 'random', time: 'random' }
  });

  const winner = result.winner === null
    ? 'Draw'
    : `Seed ${[left, right][result.winner].identity.seed} wins`;

  await respond({
    response_type: 'in_channel',
    text: [
      `*${left.identity.seed} vs ${right.identity.seed}*`,
      `${winner} after ${result.round} rounds.`,
      `${result.environment?.terrain ?? 'Unknown terrain'} · ${result.environment?.time ?? 'Unknown time'}`,
      `Encounter: \`${battleSeed}\``
    ].join('\n')
  });
});

register('/nullo-pick', async ({ command, client }) => {
  const options = command.text.split('|').map(value => value.trim());
  const unique = new Set(options.map(value => value.normalize('NFKC').toLowerCase()));

  if (
    options.length < 2 ||
    options.length > 10 ||
    options.some(value => !value || value.length > 80) ||
    unique.size !== options.length
  ) {
    throw new Error('Usage: /nullo-pick option 1 | option 2 [| option 3 ...]. Use 2–10 distinct options.');
  }

  const winner = options[randomInt(options.length)];
  await client.chat.postMessage({
    channel: command.channel_id,
    text: `Nullo picked: ${winner}`,
    blocks: [{
      type: 'section',
      text: {
        type: 'plain_text',
        text: `Picked: ${winner}\nOptions: ${options.join(' | ')}\nEach option had a 1 in ${options.length} chance.`
      }
    }]
  });
});

app.error(error => {
  console.error('Slack Bolt error:', error?.stack ?? error);
});

try {
  console.log('Starting Chromium and checking the alien website...');
  website = await openWebsite(process.env.ALIEN_SITE_BASE);
  schema = await website.request({ op: 'schema' });

  if (!schema) throw new Error('The website schema request returned no data.');

  await app.start();
  console.log('Nullo is connected to Slack.');
  console.log('Registered handlers: /nullo-ping, /nullo, /nullo-duel, /nullo-pick');
} catch (error) {
  console.error('Nullo failed to start:', error?.stack ?? error);
  await website?.close().catch(() => {});
  process.exitCode = 1;
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down...`);

  try {
    await app.stop();
    await website?.close();
  } catch (error) {
    console.error('Shutdown error:', error?.stack ?? error);
  } finally {
    process.exit(0);
  }
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
