import assert from 'node:assert/strict';
import test from 'node:test';
import { activeAmbient, motionBudget, motionMode } from './motion-runtime.mjs';

test('one visible ambient effect wins by viewport share and stable order', () => {
  assert.equal(activeAmbient([{ id: 'hero', ratio: .4, order: 0, intensity: 'full' }, { id: 'band', ratio: .8, order: 1, intensity: 'subtle' }]), 'band');
  assert.equal(activeAmbient([{ id: 'hero', ratio: .4, order: 0, intensity: 'full' }, { id: 'band', ratio: .4, order: 1, intensity: 'subtle' }]), 'hero');
  assert.equal(activeAmbient([{ id: 'hero', ratio: 1, order: 0, intensity: 'off' }]), null);
});

test('intensity maps to bounded frame and study budgets', () => {
  assert.deepEqual(motionBudget('off'), { maxFps: 0, alphaScale: 0, densityScale: 0 });
  assert.deepEqual(motionBudget('subtle'), { maxFps: 30, alphaScale: .7, densityScale: .7 });
  assert.deepEqual(motionBudget('full'), { maxFps: 60, alphaScale: 1, densityScale: 1 });
});

test('power, accessibility, visibility and first paint force a still or pause', () => {
  const base = { intensity: 'full', ratio: .8, winner: true, ready: true, hidden: false, reduced: false, saveData: false, mobile: false, cores: 8, memory: 8 };
  assert.equal(motionMode(base), 'animate');
  for (const change of [{ ready: false }, { reduced: true }, { saveData: true }, { mobile: true }, { cores: 4, memory: 4 }]) {
    assert.equal(motionMode({ ...base, ...change }), 'still');
  }
  assert.equal(motionMode({ ...base, winner: false }), 'still');
  for (const change of [{ intensity: 'off' }, { ratio: 0 }, { hidden: true }]) {
    assert.equal(motionMode({ ...base, ...change }), 'paused');
  }
});
