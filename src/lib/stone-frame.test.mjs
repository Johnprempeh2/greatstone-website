import test from 'node:test';
import assert from 'node:assert/strict';
import { createStoneFrameScheduler } from './stone-frame.mjs';
import { stoneProgress, stoneSlabOffset, stoneExitOpacity, stoneExitVisible, stoneExitRoom, stoneViewport } from './stone-motion.mjs';

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

test('hero scissor extends below its box during the sink, then stops off screen', () => {
  const box = { left: 786, right: 1276, top: -379, bottom: 141, width: 490, height: 520 };
  const room = stoneExitRoom(box, 900, stoneProgress(box.top, box.height));
  assert.equal(room, 759);
  const clipped = stoneViewport(box, 1440, 900, room);
  assert.deepEqual(clipped.viewport, [786, 0, 490, 1279]);
  assert.deepEqual(clipped.scissor, [786, 0, 490, 900]);
  assert.ok(clipped.scissor[1] < stoneViewport(box, 1440, 900, 0).scissor[1]);
  const distant = { ...box, top: -1200, bottom: -680 };
  assert.equal(stoneExitVisible(distant, 900, 1), false);
  assert.equal(stoneExitRoom(distant, 900, 1), 0);
  assert.equal(stoneViewport(distant, 1440, 900, 0), null);
});

test('sinking stone fades away before the next cards are in reading position', () => {
  assert.equal(stoneExitOpacity(0), 1);
  assert.ok(stoneExitOpacity(.45) < 1);
  assert.ok(stoneExitOpacity(.6) < .27 && stoneExitOpacity(.6) > .25);
  assert.equal(stoneExitOpacity(.7), 0);
  assert.equal(stoneExitOpacity(.75), 0);
  assert.equal(stoneExitOpacity(1), 0);
});
