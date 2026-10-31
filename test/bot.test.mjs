import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { installHandlers, safeError } from '../src/bot.mjs';
import { decisionResult, optionsOf, seedOf, JobQueue } from '../src/domain.mjs';
import { readConfig } from '../src/config.mjs';

function database(t) {
  const dir = mkdtempSync(join(tmpdir(), 'nullo-test-'));
  const store = new Store(dir);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  return store;
}

function harness(t, options = {}) {
  const store = database(t);
  const commands = new Map(), actions = [], messages = [], replies = [], updates = [], requests = [];
  let acked = false, sequence = 0;
  const app = { command: (name, fn) => commands.set(name, fn), action: (pattern, fn) => actions.push([pattern, fn]) };
  const client = {
    chat: { postMessage: async value => { assert.ok(acked, 'Slack must be acknowledged before work'); messages.push(value); return { ts: String(messages.length) }; }, update: async value => { updates.push(value); } },
    files: { uploadV2: async () => ({ files: [{ ok: true, files: [{ id: 'F123' }] }] }) },
  };
  const website = {
    request: async payload => {
      assert.ok(acked, 'Slack must be acknowledged before browser work');
      requests.push(payload);
      if (options.offline) throw new Error('Website offline');
      if (payload.op === 'schema') return { combat: { stats: { vitality: 'Vitality' }, abilities: { renewal: { name: 'Returning Pulse' } } } };
      if (payload.op === 'generate') return { identity: { seed: payload.seed }, kind: 'alien', phenotype: 'Long stride', combat: { stats: { vitality: 98 }, abilities: ['renewal'] } };
      return { finished: true, winner: options.winner ?? 0, ruleset: 2, round: 12, reason: 'knockout', environment: { ...payload.options, terrain: 'forest', time: 'day' }, fighters: [{ identity: { seed: payload.left } }, { identity: { seed: payload.right } }] };
    },
    portrait: async () => { if (options.imageFail) throw new Error('Render failed'); return Buffer.from('png'); },
  };
  installHandlers(app, { config: { baseURL: 'https://example.com/', maxPending: 3, cooldownMs: 1 }, store, website, logger: { warn() {}, error() {} } });
  return { store, messages, replies, updates, requests,
    async command(name, text = '', extra = {}) {
      acked = false;
      await commands.get(name)({ ack: async () => { acked = true; }, command: { text, team_id: 'T1', channel_id: 'C1', user_id: 'U1', trigger_id: String(++sequence), ...extra }, client, respond: async value => { replies.push(value); } });
    },
    async action(name, value, user = 'U1') {
      acked = false;
      const handler = actions.find(([re]) => re.test(name))[1];
      await handler({ ack: async () => { acked = true; }, body: { team: { id: 'T1' }, user: { id: user }, channel: { id: 'C1' }, message: { ts: '1' } }, action: { action_id: name, action_ts: String(++sequence), value }, client, respond: async v => { replies.push(v); } });
    },
  };
}

test('seed precision, zero normalization, and duplicate options', () => {
  assert.equal(seedOf('00090071992547409931234'), '90071992547409931234');
  assert.equal(seedOf('000'), '0');
  assert.throws(() => seedOf('https://evil.test'));
  assert.throws(() => optionsOf('Pizza | Ｐｉｚｚａ'));
  assert.throws(() => optionsOf('a | b | c', true));
  assert.deepEqual(optionsOf('a | b'), ['a', 'b']);
});

test('left winner is not mistaken for a draw, and ties use saved index', () => {
  assert.deepEqual(decisionResult({ finished: true, winner: 0 }, 1), { index: 0, tied: false });
  assert.deepEqual(decisionResult({ finished: true, winner: null }, 1), { index: 1, tied: true });
  assert.throws(() => decisionResult({ finished: false, winner: null }, 0));
});

test('malformed pasted environment fails without leaking tokens', () => {
  assert.throws(() => readConfig({ ALIEN_SITE_BASE: 'https\\://example.com/\\' }, false), /backslashes/);
  assert.throws(() => readConfig({ SLACK_BOT_TOKEN: 'bad-private-value' }), error => !error.message.includes('bad-private-value'));
  assert.equal(safeError(new Error('xoxb-test-secret https://hooks.slack.com/commands/private')), '[redacted] [response URL]');
});

test('SQLite survives restart and separates workspace collections', t => {
  const dir = mkdtempSync(join(tmpdir(), 'nullo-persist-'));
  let store = new Store(dir);
  store.keep('T1', 'U1', '42');
  const id = store.claim('delivery', 'T1', 'U1', 'decide');
  store.save(id, { encounter: 'locked' }, 'pending');
  store.close();
  store = new Store(dir);
  assert.equal(store.active('T1', 'U1'), '42');
  assert.equal(store.active('T2', 'U1'), undefined);
  assert.equal(store.get(id, 'T1').state, 'interrupted');
  assert.equal(store.get(id, 'T1').payload.encounter, 'locked');
  assert.equal(store.claim('delivery', 'T1', 'U1', 'decide'), null);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test('fair picker works with website offline and deduplicates retries', async t => {
  const h = harness(t, { offline: true });
  await h.command('/nullo-pick', 'pizza | noodles', { trigger_id: 'same' });
  await h.command('/nullo-pick', 'pizza | noodles', { trigger_id: 'same' });
  assert.equal(h.messages.length, 1);
  assert.equal(h.requests.length, 0);
  assert.match(h.messages[0].text, /equal chance/);
});

test('generation uploads actual portrait, anyone can keep, owner controls fight', async t => {
  const h = harness(t);
  await h.command('/nullo', '42');
  assert.equal(h.messages.length, 1);
  assert.equal(h.updates[0].blocks[1].slack_file.id, 'F123');
  const id = h.messages[0].blocks.find(b => b.type === 'actions').elements[0].value;
  await h.action('nullo_keep', id, 'U2');
  assert.equal(h.store.active('T1', 'U2'), '42');
  await h.action('nullo_fight', id, 'U2');
  assert.equal(h.messages.length, 1);
  assert.match(h.replies.at(-1).text, /your own card/);
});

test('failed image retains alien card and saved seed', async t => {
  const h = harness(t, { imageFail: true });
  await h.command('/nullo', '42');
  assert.match(h.updates[0].blocks.at(-1).elements[0].text, /Image unavailable/);
  const id = h.messages[0].blocks.find(b => b.type === 'actions').elements[0].value;
  assert.equal(h.store.get(id, 'T1').payload.seed, '42');
});

test('decision uses returned website winner and records setup before combat', async t => {
  const h = harness(t, { winner: 0 });
  await h.command('/nullo-decide', 'pizza | noodles');
  assert.equal(h.messages.length, 2);
  assert.match(h.messages[0].blocks[0].text.text, /Choices locked/);
  assert.equal(h.messages[1].text, 'Decision: pizza');
  assert.equal(h.updates.at(-1).blocks.filter(b => b.type === 'image').length, 2);
  const duel = h.requests.find(r => r.op === 'duel');
  assert.notEqual(duel.left, duel.right);
  const id = h.messages[0].blocks[0].text.text.split('Receipt: ')[1];
  const saved = h.store.get(id, 'T1');
  assert.equal(saved.payload.encounter, duel.options.battleSeed);
  assert.equal(saved.payload.battle.winner, 0);
  await h.command('/nullo', `receipt ${id}`, { user_id: 'U2' });
  assert.match(h.replies.at(-1).text, /No receipt found/);
});

test('image diagnostic exercises generation, upload and inline display', async t => {
  const h = harness(t);
  await h.command('/nullo-ping', 'image');
  assert.match(h.replies.at(-1).text, /1 rendered, 1 uploaded, 1 embedded/);
  assert.equal(h.messages.length, 1);
});

test('queue is bounded and recovers after rejection', async () => {
  const queue = new JobQueue(1);
  let release;
  const first = queue.run(() => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  await assert.rejects(queue.run(() => {}), /full queue/);
  release();
  await first;
  await queue.drain();
  await assert.rejects(queue.run(() => { throw new Error('failed'); }), /failed/);
  await queue.drain();
  assert.equal(await queue.run(() => 42), 42);
});
