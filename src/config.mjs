import dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config({ quiet: true });

export function readConfig(env = process.env, requireTokens = true) {
  const raw = env.ALIEN_SITE_BASE || 'https://thisaliendoesnotexist.app/';
  if (raw.includes('\\')) throw new Error('ALIEN_SITE_BASE must be a plain URL without backslashes. See .env.example.');
  const base = new URL(raw);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw new Error('ALIEN_SITE_BASE must be a clean HTTPS website URL.');
  }
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const botToken = env.SLACK_BOT_TOKEN?.trim();
  const appToken = env.SLACK_APP_TOKEN?.trim();
  if (requireTokens && (!/^xoxb-[A-Za-z0-9-]+$/.test(botToken || '') || !/^xapp-[A-Za-z0-9-]+$/.test(appToken || ''))) {
    throw new Error('Set SLACK_BOT_TOKEN and SLACK_APP_TOKEN in .env using fresh tokens, one line each, without trailing backslashes.');
  }
  function integer(name, fallback, max) {
    const n = Number(env[name] ?? fallback);
    if (!Number.isInteger(n) || n < 1 || n > max) throw new Error(`${name} must be an integer from 1 to ${max}.`);
    return n;
  }
  return {
    baseURL: base.href, botToken, appToken,
    dataDir: resolve(env.DATA_DIR || './data'),
    maxPending: integer('MAX_PENDING_JOBS', 8, 25),
    cooldownMs: integer('USER_COOLDOWN_SECONDS', 5, 120) * 1000,
  };
}

