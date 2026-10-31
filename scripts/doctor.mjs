import bolt from '@slack/bolt';
import { mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { chromium } from 'playwright';
import { readConfig } from '../src/config.mjs';
import { safeError } from '../src/bot.mjs';

try {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Install Node.js 24 LTS for this package.');
  const config = readConfig();
  await mkdir(config.dataDir, { recursive: true });
  await access(config.dataDir, constants.W_OK);
  console.log('Environment format and data directory: OK');
  const browser = await chromium.launch({ headless: true });
  await browser.close();
  console.log('Chromium: OK');
  if (process.argv.includes('--slack')) {
    const app = new bolt.App({ token: config.botToken, appToken: config.appToken, socketMode: true, logLevel: bolt.LogLevel.ERROR });
    await app.start();
    await app.stop();
    console.log('Slack bot token and Socket Mode connection: OK');
  } else console.log('Run npm run doctor -- --slack to check the Slack connection. This posts no messages.');
  console.log('Run npm run probe to check generation, battle, and the actual website portrait.');
} catch (error) {
  console.error(`Doctor: ${safeError(error)}`);
  process.exitCode = 1;
}

