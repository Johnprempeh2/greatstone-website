import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { BACKGROUNDS, effectFrame, effectPalette } from './contained-effects.mjs';

function canvasSpy() {
  const operations = [];
  const gradient = { addColorStop: (at, value) => operations.push(['stop', at, value]) };
  const ctx = new Proxy({}, { set(target, key, value) { operations.push([key, value]); target[key] = value; return true; },
    get(target, key) { return target[key] ?? ((...args) => { operations.push([key, ...args]); return key === 'createRadialGradient' ? gradient : undefined; }); } });
  return { ctx, operations };
}

test('all six ports draw a bounded contained frame and Off leaves the canvas alone', () => {
  assert.equal(Object.keys(BACKGROUNDS).length, 6);
  for (const id of Object.keys(BACKGROUNDS)) {
    const { ctx, operations } = canvasSpy();
    assert.equal(effectFrame(ctx, id, 390, 300, 24), true, id);
    assert.deepEqual(operations[0], ['clearRect', 0, 0, 390, 300]);
    assert.ok(operations.some(([name]) => ['stroke', 'fill', 'fillRect'].includes(name)), id);
    assert.ok(operations.every((op) => !op.includes('fillRect') || op.slice(1).every((v) => typeof v !== 'number' || Number.isFinite(v))), id);
    const count = operations.length;
    assert.equal(effectFrame(ctx, id, 390, 300, 24, { intensity: 'off' }), false);
    assert.equal(operations.length, count);
  }
});

test('light palette uses dark ink instead of lime', () => {
  assert.deepEqual(effectPalette(true).accent, [14, 49, 34]);
  assert.deepEqual(effectPalette(false).accent, [200, 255, 0]);
});

test('each selectable background has both first-paint stills and a short preview', () => {
  for (const effect of Object.keys(BACKGROUNDS)) {
    const name = effect.slice(3);
    for (const theme of ['dark', 'light']) {
      const still = readFileSync(new URL(`../../public/motion/${name}-${theme}.webp`, import.meta.url));
      assert.equal(still.toString('ascii', 0, 4), 'RIFF', `${name} ${theme} still`);
      assert.ok(still.length > 1000, `${name} ${theme} still is not empty`);
    }
    const preview = readFileSync(new URL(`../../public/motion/previews/${name}.webm`, import.meta.url));
    assert.equal(preview.toString('hex', 0, 4), '1a45dfa3', `${name} preview`);
  }
});
