import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTransitionAt, scrollContext } from './stage-presets.js';

test('scene position uses the canvas document and its window', () => {
  const block = { getBoundingClientRect: () => ({ top: 150, height: 100 }) };
  const doc = {
    defaultView: { scrollY: 400, innerHeight: 500 },
    documentElement: { scrollHeight: 1500 }, body: { scrollHeight: 1500 },
    querySelector: () => null,
    getElementById: (id) => id === 'gs-blk-section' ? block : null,
  };
  const context = scrollContext(doc);
  assert.equal(context.top, 400);
  assert.equal(context.max, 1000);
  assert.equal(resolveTransitionAt({ at: 0.2, anchor: { type: 'block', blockId: 'section', edge: 'center' } }, context), 0.35);
});
