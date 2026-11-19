const test = require('node:test');
const assert = require('node:assert');

// Minimal stand-in for the extension APIs the worker uses.
const store = {};
let listener;
globalThis.chrome = {
  storage: {
    session: {
      get: async (key) => (key in store ? { [key]: store[key] } : {}),
      set: async (values) => {
        await new Promise((resolve) => setTimeout(resolve, 5)); // slow write, to expose races
        Object.assign(store, values);
      },
    },
  },
  runtime: { onMessage: { addListener: (fn) => (listener = fn) } },
};

const { whenIdle } = require('../src/background.js');

test('counts each video once across overlapping reports', async () => {
  listener({ type: 'gsd:hidden', ids: ['aaa111', 'bbb222'] }); // tab 1
  listener({ type: 'gsd:hidden', ids: ['bbb222', 'ccc333'] }); // tab 2, sent before tab 1 is saved
  listener({ type: 'gsd:hidden', ids: ['aaa111'] }); // same video seen again
  await whenIdle();
  assert.strictEqual(store.hiddenCount, 3);
  assert.deepStrictEqual([...store.hiddenIds].sort(), ['aaa111', 'bbb222', 'ccc333']);
});

test('ignores unrelated or malformed messages', async () => {
  listener({ type: 'something-else', ids: ['zzz999'] });
  listener({ type: 'gsd:hidden' });
  listener(null);
  await whenIdle();
  assert.strictEqual(store.hiddenCount, 3);
});
