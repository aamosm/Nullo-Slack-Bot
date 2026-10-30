import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { openWebsite } from './website.mjs';

let website;

try {
  website = await openWebsite(process.env.ALIEN_SITE_BASE);

  console.log('Checking website schema...');
  const schema = await website.request({ op: 'schema' });
  console.log('Schema request: OK');
  console.log('Schema keys:', Object.keys(schema ?? {}).join(', ') || '(none)');

  console.log('Generating seed 42...');
  const alien = await website.request({
    op: 'generate',
    seed: '42',
    options: { generatorVersion: 2, compact: true }
  });

  if (!alien?.identity?.seed) {
    throw new Error(`Unexpected generate response: ${JSON.stringify(alien).slice(0, 1200)}`);
  }

  console.log('Rendering portrait...');
  const png = await website.portrait(alien.identity.seed, alien.generatorVersion ?? 2);
  await writeFile('alien-42.png', png);

  console.log('SUCCESS');
  console.log('Seed:', alien.identity.seed);
  console.log('PNG: alien-42.png');
  console.log('Stats:', alien.combat?.stats ?? '(not returned)');
} catch (error) {
  console.error('\nPROBE FAILED');
  console.error(error?.stack ?? error);
  process.exitCode = 1;
} finally {
  await website?.close().catch(error => {
    console.error('Browser shutdown error:', error?.stack ?? error);
  });
}
