import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { openWebsite } from './website.mjs';

const website = await openWebsite(process.env.ALIEN_SITE_BASE);
try {
  const alien = await website.request({
    op: 'generate', seed: '42', options: { generatorVersion: 2, compact: true },
  });
  const battle = await website.request({
    op: 'duel', left: '42', right: '98765',
    options: { battleSeed: 'nullo-live-check', terrain: 'random', time: 'random' },
  });
  const png = await website.portrait(alien.identity.seed, alien.generatorVersion);
  await writeFile('alien-42.png', png);
  console.log({ identity: alien.identity, stats: alien.combat.stats });
  console.log({ winner: battle.winner, rounds: battle.round, environment: battle.environment });
} finally {
  await website.close();
}