import test from 'node:test';
import assert from 'node:assert/strict';
import { tailStrength, TAIL_FLOOR } from './tide-tail.mjs';

test('the tail tide is full at its start and eases to the floor at the footer', () => {
  assert.equal(tailStrength(0, 900, 1000, 4000), 1);
  assert.equal(tailStrength(550, 900, 1000, 4000), 1);
  assert.equal(tailStrength(2050, 900, 1000, 4000), 1 - (1 - TAIL_FLOOR) / 2);
  assert.equal(tailStrength(3550, 900, 1000, 4000), TAIL_FLOOR);
  assert.equal(tailStrength(9000, 900, 1000, 4000), TAIL_FLOOR);
});

test('a tail with no length does not divide by zero', () => {
  assert.ok(Number.isFinite(tailStrength(0, 900, 500, 500)));
});
