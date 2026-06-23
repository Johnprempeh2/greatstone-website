import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveGap } from './next-move-gap.mjs';

test('moveGap: target present and above current → headroom to target', () => {
  assert.deepEqual(moveGap(4, { target: 7, benchmark: 5 }), { kind: 'target', value: 4, ref: 7, delta: 3 });
});

test('moveGap: target absent or not above current → falls back to industry benchmark', () => {
  assert.deepEqual(moveGap(6, { benchmark: 5 }), { kind: 'benchmark', value: 6, ref: 5, delta: 1 }); // ahead
  assert.deepEqual(moveGap(4, { benchmark: 6 }), { kind: 'benchmark', value: 4, ref: 6, delta: -2 }); // behind
  // target equal to current is not "above", so it is ignored in favour of the benchmark
  assert.deepEqual(moveGap(5, { target: 5, benchmark: 4 }), { kind: 'benchmark', value: 5, ref: 4, delta: 1 });
});

test('moveGap: rounds to one decimal', () => {
  assert.deepEqual(moveGap(4.46, { target: 7 }), { kind: 'target', value: 4.5, ref: 7, delta: 2.5 });
});

test('moveGap: returns null when there is nothing honest to show', () => {
  assert.equal(moveGap(0, { target: 7 }), null); // no real current score
  assert.equal(moveGap(5, {}), null); // no references at all
  assert.equal(moveGap(5, { target: 3, benchmark: 0 }), null); // target below current, benchmark not positive
  assert.equal(moveGap('x', { target: 7 }), null); // garbage current
});
