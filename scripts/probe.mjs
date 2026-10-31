import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readConfig } from '../src/config.mjs';
import { Website } from '../src/website.mjs';
import { safeError } from '../src/bot.mjs';

const config = readConfig(process.env, false);
const website = new Website(config.baseURL);
try {
  const schema = await website.request({ op: 'schema' });
  const alien = await website.request({ op: 'generate', seed: '42', options: { generatorVersion: 2 } });
  if (alien.identity.seed !== '42' || !alien.combat?.stats) throw new Error('Unexpected generation result.');
  const battle = await website.request({ op: 'duel', left: '42', right: '98765', options: { leftVersion: 2, rightVersion: 2, battleSeed: 'nullo-live-check', terrain: 'random', time: 'random' } });
  if (!battle.finished || ![0, 1, null].includes(battle.winner)) throw new Error('The battle did not finish.');
  const png = await website.portrait('42');
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Portrait is not a PNG.');
  await mkdir(config.dataDir, { recursive: true });
  const path = join(config.dataDir, 'alien-42.png');
  await writeFile(path, png);
  console.log(`Website API: OK · combat ruleset ${schema.combat.ruleset}`);
  console.log(`Seed 42: ${alien.phenotype}`);
  console.log(`Duel: ${battle.winner === null ? 'draw' : `seed ${battle.fighters[battle.winner].identity.seed} won`} · ${battle.round} rounds`);
  console.log(`Portrait: ${path}`);
  console.log('Probe passed. No Slack tokens were used.');
} catch (error) {
  console.error(`Probe failed: ${safeError(error)}`);
  process.exitCode = 1;
} finally { await website.close(); }

