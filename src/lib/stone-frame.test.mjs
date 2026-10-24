import test from 'node:test';
import assert from 'node:assert/strict';
import { createStoneFrameScheduler } from './stone-frame.mjs';
import { stoneProgress, stoneSlabOffset } from './stone-motion.mjs';

test('stone draws once for a burst of view changes, then schedules zero idle frames', () => {
  const callbacks = new Map();
  let next = 0;
  let draws = 0;
  let visible = true;
  const scheduler = createStoneFrameScheduler({
    request: (fn) => { callbacks.set(++next, fn); return next; },
    cancel: (id) => callbacks.delete(id),
    draw: () => { draws++; },
    canDraw: () => visible,
  });
  scheduler.schedule(); scheduler.schedule(); scheduler.schedule();
  assert.equal(callbacks.size, 1);
  callbacks.get(1)(1000); callbacks.delete(1);
  assert.equal(draws, 1);
  assert.equal(scheduler.pending(), false);
  assert.equal(callbacks.size, 0);
  scheduler.schedule();
  visible = false;
  scheduler.stop();
  assert.equal(callbacks.size, 0);
  scheduler.schedule();
  assert.equal(callbacks.size, 0);
});

test('scroll fractures five slabs and sinks them as the hero leaves view', () => {
  assert.equal(stoneProgress(10, 500), 0);
  assert.equal(stoneProgress(-200, 500), .5);
  assert.equal(stoneProgress(-500, 500), 1);
  const positions = Array.from({ length: 5 }, (_, index) => stoneSlabOffset(index, 1));
  assert.equal(new Set(positions.map((p) => p.y)).size, 5);
  assert.ok(positions.every((p) => p.y < 0));
  assert.deepEqual(stoneSlabOffset(2, 0), { x: 0, y: -0, z: 0 });
});
