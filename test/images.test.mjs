import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverPortraits, imageReport } from '../src/images.mjs';
import { Website } from '../src/website.mjs';

function fixture(options = {}) {
  const uploads = [], updates = [], waits = [];
  let attempts = 0;
  const args = {
    website: { portrait: async seed => { if (seed === options.failedSeed) throw new Error('Render timed out'); return Buffer.from('png'); } },
    client: {
      files: { uploadV2: async payload => {
        uploads.push(payload);
        if (options.uploadError) throw { data: { error: options.uploadError } };
        return { files: [{ files: [{ id: `F${uploads.length}` }] }] };
      } },
      chat: { update: async payload => {
        attempts++;
        if (attempts <= (options.failedUpdates || 0)) throw { data: { error: 'invalid_blocks' } };
        updates.push(payload);
      } },
    },
    channel: 'C1', ts: '123', view: { text: 'Alien', blocks: [{ type: 'header', text: { type: 'plain_text', text: 'Alien' } }] },
    portraits: [{ seed: '42', label: 'Alien 42' }],
    logger: { warn() {} }, wait: async ms => { waits.push(ms); },
  };
  return { args, uploads, updates, waits };
}

test('temporary inline rejection retries without uploading duplicates', async () => {
  const f = fixture({ failedUpdates: 2 });
  const result = await deliverPortraits(f.args);
  assert.equal(result.ok, true);
  assert.equal(result.embedded, 1);
  assert.equal(f.uploads.length, 1);
  assert.deepEqual(f.waits, [1000, 2000]);
});

test('missing file scope explains reinstallation and retains card', async () => {
  const f = fixture({ uploadError: 'missing_scope' });
  const result = await deliverPortraits(f.args);
  assert.equal(result.rendered, 1);
  assert.equal(result.uploaded, 0);
  assert.match(imageReport(result), /files:write.*reinstall/);
  assert.equal(f.updates.length, 1);
});

test('partial battle render still uploads and embeds the other fighter', async () => {
  const f = fixture({ failedSeed: '42' });
  f.args.portraits.push({ seed: '98765', label: 'Fighter 2' });
  const result = await deliverPortraits(f.args);
  assert.equal(result.embedded, 1);
  assert.equal(f.uploads[0].title, 'Fighter 2');
  assert.equal(f.updates[0].blocks[1].alt_text, 'Fighter 2');
  assert.equal(result.errors[0].stage, 'render');
});

test('permanent inline rejection preserves uploaded thread file and reports it', async () => {
  const f = fixture({ failedUpdates: 4 });
  const result = await deliverPortraits(f.args);
  assert.equal(result.uploaded, 1);
  assert.equal(result.embedded, 0);
  assert.equal(f.uploads[0].thread_ts, '123');
  assert.match(imageReport(result), /thread/);
  assert.equal(f.waits.length, 3);
});

test('canvas export preserves PNG bytes and closes page', async () => {
  const website = new Website('https://example.com/');
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  let closed = false;
  website.context = async () => ({ newPage: async () => ({
    goto: async () => ({ ok: () => true }),
    locator: () => ({ selectOption: async () => {}, inputValue: async () => '42', evaluate: async fn => fn({ toDataURL: () => `data:image/png;base64,${png.toString('base64')}` }) }),
    waitForFunction: async () => {}, close: async () => { closed = true; },
  }) });
  assert.deepEqual(await website.portrait('42'), png);
  assert.equal(closed, true);
});
