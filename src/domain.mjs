import { randomBytes, randomInt } from 'node:crypto';

export class UserError extends Error {}
export const randomSeed = () => randomBytes(8).readBigUInt64BE().toString();
export const encounterCode = () => randomBytes(16).toString('hex');
export const coin = () => randomInt(2);

export function seedOf(value) {
  if (!/^\d{1,1000}$/.test(value || '')) throw new UserError('Use a decimal seed of 1–1000 digits. Example: /nullo 42');
  return value.replace(/^0+(?=\d)/, '');
}

export function optionsOf(text, exactlyTwo = false) {
  const choices = text.split('|').map(s => s.trim());
  if (choices.length < 2 || choices.length > (exactlyTwo ? 2 : 10) || choices.some(s => !s || s.length > 80)) {
    throw new UserError(exactlyTwo ? 'Give exactly two options, each 1–80 characters: /nullo-decide pizza | noodles' : 'Give 2–10 options, each 1–80 characters: /nullo-pick pizza | noodles | tacos');
  }
  const normalized = choices.map(s => s.normalize('NFKC').replace(/\s+/g, ' ').toLowerCase());
  if (new Set(normalized).size !== choices.length) throw new UserError('Use distinct options; duplicate labels do not get extra chances.');
  return choices;
}

export function pick(choices) { return randomInt(choices.length); }
export const escapeSlack = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export const shortSeed = seed => seed.length > 32 ? `${seed.slice(0, 20)}…${seed.slice(-8)}` : seed;

export function alienURL(base, seed) {
  const url = new URL(base);
  url.search = new URLSearchParams({ v: '2', seed }).toString();
  return url.href;
}

export function battleURL(base, battle) {
  const url = new URL('duel.html', base);
  url.search = new URLSearchParams({
    r: String(battle.ruleset), left: battle.fighters[0].identity.seed,
    right: battle.fighters[1].identity.seed, lv: '2', rv: '2',
    battle: battle.environment.battleSeed,
    terrain: battle.environment.terrain, time: battle.environment.time,
  }).toString();
  return url.href;
}

export function decisionResult(battle, tieIndex) {
  if (!battle.finished || ![null, 0, 1].includes(battle.winner)) throw new Error('The website returned an incomplete battle.');
  return { index: battle.winner === null ? tieIndex : battle.winner, tied: battle.winner === null };
}

export class JobQueue {
  constructor(limit) { this.limit = limit; this.pending = 0; this.tail = Promise.resolve(); }
  run(work) {
    if (this.pending >= this.limit) return Promise.reject(new UserError('Nullo has a full queue. Try again in a moment.'));
    this.pending++;
    const task = this.tail.then(work);
    this.tail = task.catch(() => {}).finally(() => { this.pending--; });
    return task;
  }
  async drain() { await this.tail; }
}

