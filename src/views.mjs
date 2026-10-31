import { alienURL, battleURL, escapeSlack, shortSeed } from './domain.mjs';

export const help = [
  '*Nullo · This Alien Does Not Exist*',
  '`/nullo random` — discover an ordinary alien',
  '`/nullo raw` — unfiltered random 64-bit seed',
  '`/nullo 42` — generate an exact seed',
  '`/nullo mine` — your collection; add a page number for more',
  '`/nullo active 42` — use a kept alien in your next duel',
  '`/nullo-duel` — active alien vs random, or two random aliens',
  '`/nullo-duel 42` — seed 42 vs random',
  '`/nullo-duel 42 98765` — two exact seeds',
  '`/nullo-pick pizza | noodles | tacos` — equal-chance choice',
  '`/nullo-decide pizza | noodles` — let a real alien fight decide',
  '`/nullo receipt ID` — recover your saved result',
  '`/nullo-ping` — status; add `site` for the API or `image` for a portrait upload test',
].join('\n');

export function alienView(record, schema, base, jobID, mode) {
  const seed = record.identity.seed;
  const stats = Object.entries(record.combat.stats || {}).map(([k, n]) => `${schema.combat.stats[k] || k}: ${n}`).join(' · ');
  const abilities = record.combat.abilities.map(id => schema.combat.abilities[id]?.name || id).join(' · ');
  const text = `Alien ${shortSeed(seed)} · ${record.phenotype}`;
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `Alien ${shortSeed(seed)}` } },
    { type: 'section', text: { type: 'plain_text', text: record.phenotype || record.kind } },
    { type: 'section', text: { type: 'plain_text', text: stats || 'Special form: ordinary combat ratings do not apply.' } },
    { type: 'section', text: { type: 'plain_text', text: `Passives: ${abilities || 'Special form'}` } },
    { type: 'context', elements: [{ type: 'plain_text', text: `${mode} · generator v2 · receipt ${jobID}` }] },
    { type: 'actions', elements: [
      { type: 'button', text: { type: 'plain_text', text: 'Keep + make active' }, action_id: 'nullo_keep', value: jobID, style: 'primary' },
      { type: 'button', text: { type: 'plain_text', text: 'Fight random' }, action_id: 'nullo_fight', value: jobID },
      { type: 'button', text: { type: 'plain_text', text: 'Another alien' }, action_id: 'nullo_another', value: jobID },
      { type: 'button', text: { type: 'plain_text', text: 'Open website' }, action_id: 'nullo_open', url: alienURL(base, seed) },
    ] },
  ];
  return { text, blocks };
}

export function battleView(battle, base, jobID, labels, decision) {
  const seeds = battle.fighters.map(f => f.identity.seed);
  const winner = battle.winner === null ? 'Draw' : `Seed ${shortSeed(seeds[battle.winner])} wins`;
  const environment = `${battle.environment.terrain} · ${battle.environment.time}`;
  const details = `${shortSeed(seeds[0])} vs ${shortSeed(seeds[1])}\n${battle.round} rounds · ${environment} · ${battle.reason}`;
  const text = labels ? `Decision: ${labels[decision.index]}${decision.tied ? ' (draw; random tiebreak)' : ''}` : winner;
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: labels ? 'The aliens have decided' : 'Alien duel' } },
    { type: 'section', text: { type: 'plain_text', text } },
    { type: 'section', text: { type: 'plain_text', text: details } },
  ];
  if (labels) blocks.push({ type: 'section', text: { type: 'plain_text', text: labels.map((label, i) => `${label} → seed ${shortSeed(seeds[i])}`).join('\n') } });
  blocks.push(
    { type: 'context', elements: [{ type: 'plain_text', text: `Encounter ${battle.environment.battleSeed} · receipt ${jobID}${labels ? '\nBattle outcome, not a guaranteed 50/50 choice. /nullo-pick gives equal chances.' : ''}` }] },
    { type: 'actions', elements: [
      ...seeds.map((seed, i) => ({ type: 'button', text: { type: 'plain_text', text: `View alien ${i + 1}` }, action_id: `nullo_view_${i}`, url: alienURL(base, seed) })),
      ...(battleURL(base, battle).length <= 3000 ? [{ type: 'button', text: { type: 'plain_text', text: 'Open encounter' }, action_id: 'nullo_encounter', url: battleURL(base, battle) }] : []),
    ] },
  );
  return { text: escapeSlack(text), blocks };
}

