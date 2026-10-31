import bolt from '@slack/bolt';
import { readConfig } from './src/config.mjs';
import { Store } from './src/store.mjs';
import { Website } from './src/website.mjs';
import { installHandlers, safeError } from './src/bot.mjs';

const { App, LogLevel } = bolt;
let app, store, website, handlers;
let stopping = false;

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  const timer = setTimeout(() => process.exit(code || 1), 40000);
  timer.unref();
  await app?.stop().catch(() => {});
  await handlers?.drain();
  await website?.close().catch(() => {});
  store?.close();
  process.exit(code);
}

try {
  const config = readConfig();
  store = new Store(config.dataDir);
  website = new Website(config.baseURL);
  app = new App({ token: config.botToken, appToken: config.appToken, socketMode: true, logLevel: LogLevel.WARN });
  app.error(async error => { console.error(`Slack: ${safeError(error)}`); });
  handlers = installHandlers(app, { config, store, website });
  process.on('SIGINT', () => shutdown());
  process.on('SIGTERM', () => shutdown());
  await app.start();
  console.log('Nullo is connected. Invite it to your channel and run /nullo-ping.');
} catch (error) {
  console.error(`Nullo could not start: ${safeError(error)}`);
  await shutdown(1);
}
