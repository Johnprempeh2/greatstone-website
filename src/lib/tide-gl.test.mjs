import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepBandRows, NO_BAND as X } from './tide-gl.js';

test('stepBandRows puts one band level with each Method step, counted from the canvas bottom', () => {
  assert.deepEqual(stepBandRows([500, 600, 700, 800], 900, 2), [800, 600, 400, 200]);
});

test('stepBandRows drops steps that are off screen or missing', () => {
  assert.deepEqual(stepBandRows([-300, 450, 2000], 900, 1), [X, 450, X, X]);
  assert.deepEqual(stepBandRows(null, 900, 1), [X, X, X, X]);
  assert.deepEqual(stepBandRows([NaN, 100, 200, 300, 400], 900, 1), [X, 800, 700, 600]);
});

test('stepBandRows keeps a step just below the fold, so its band does not pop', () => {
  assert.deepEqual(stepBandRows([903.5], 900, 1), [-3.5, X, X, X]);
});
