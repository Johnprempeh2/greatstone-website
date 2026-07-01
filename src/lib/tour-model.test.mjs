import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOURS, filterSteps, clampIndex, nextIndex, prevIndex, isFirst, isLast, progressLabel,
  placeCard, seenKey, hasSeen, markSeen, resetGuide, autoStartTour,
} from './tour-model.mjs';

test('filterSteps drops role-gated steps and renumbers "n of m" for the user', () => {
  const steps = TOURS.hub.steps;
  const manager = filterSteps(steps, { edit: true, manage: true });
  const viewer = filterSteps(steps, { edit: false, manage: false });
  assert.equal(manager.length, steps.length);          // manager sees all
  assert.ok(viewer.length < steps.length);             // viewer loses the manage-only "gettingstarted" step
  assert.ok(!viewer.some((s) => s.requires === 'manage'));
  // editor guide is all edit-gated → a viewer sees zero steps
  assert.equal(filterSteps(TOURS.editor.steps, { edit: false }).length, 0);
  assert.equal(filterSteps(TOURS.editor.steps, { edit: true }).length, TOURS.editor.steps.length);
});

test('index progression clamps at both ends', () => {
  assert.equal(clampIndex(-3, 5), 0);
  assert.equal(clampIndex(9, 5), 4);
  assert.equal(clampIndex(NaN, 5), 0);
  assert.equal(nextIndex(4, 5), 4);   // cannot go past the last
  assert.equal(prevIndex(0, 5), 0);   // cannot go before the first
  assert.equal(isFirst(0), true);
  assert.equal(isLast(4, 5), true);
  assert.equal(isLast(3, 5), false);
  assert.equal(progressLabel(1, 5), '2 of 5');
  assert.equal(progressLabel(0, 0), '');
});

test('seen-state is per user+tour; first-login gating and single-guide replay', () => {
  let seen = {};
  assert.equal(hasSeen(seen, 'a@x.co', 'hub'), false);
  assert.equal(autoStartTour(seen, 'a@x.co', 'hub'), 'hub');   // never seen → auto-start
  seen = markSeen(seen, 'a@x.co', 'hub');
  assert.equal(hasSeen(seen, 'a@x.co', 'hub'), true);
  assert.equal(autoStartTour(seen, 'a@x.co', 'hub'), null);    // seen → do not auto-start again
  assert.equal(hasSeen(seen, 'b@x.co', 'hub'), false);         // a colleague on the same machine still gets it
  assert.equal(autoStartTour(seen, 'b@x.co', 'hub'), 'hub');
  // replaying clears ONLY that one guide's flag
  seen = markSeen(seen, 'a@x.co', 'editor');
  seen = resetGuide(seen, 'a@x.co', 'hub');
  assert.equal(hasSeen(seen, 'a@x.co', 'hub'), false);
  assert.equal(hasSeen(seen, 'a@x.co', 'editor'), true);       // editor flag untouched
  assert.equal(seenKey('a@x.co', 'hub'), 'a@x.co::hub');
  assert.equal(autoStartTour(seen, 'a@x.co', 'nope'), null);   // unknown tour → null
});

test('placeCard prefers below, flips above when clipped, clamps horizontally', () => {
  const vp = { width: 1000, height: 700 };
  const card = { width: 320, height: 160 };
  // target near the top → card goes below
  const below = placeCard({ top: 40, bottom: 80, left: 400, width: 120 }, card, vp);
  assert.equal(below.placement, 'below');
  assert.ok(below.top >= 80);
  // target near the bottom → card flips above
  const above = placeCard({ top: 640, bottom: 680, left: 400, width: 120 }, card, vp);
  assert.equal(above.placement, 'above');
  assert.ok(above.top < 640);
  // target hard against the left edge → card clamps to the gutter, never negative
  const clamped = placeCard({ top: 40, bottom: 80, left: 0, width: 60 }, card, vp);
  assert.ok(clamped.left >= 0);
  // and against the right edge → stays on screen
  const right = placeCard({ top: 40, bottom: 80, left: 980, width: 60 }, card, vp);
  assert.ok(right.left + card.width <= vp.width);
});

test('every guide body is British-voice with no em-dash or en-dash (house rule)', () => {
  for (const tour of Object.values(TOURS)) {
    for (const s of tour.steps) {
      assert.equal(s.body.includes('—'), false, tour.id + '/' + s.id + ' has an em-dash');
      assert.equal(s.body.includes('–'), false, tour.id + '/' + s.id + ' has an en-dash');
      assert.ok(s.title && s.body, tour.id + '/' + s.id + ' needs a title + body');
    }
  }
});

test('every step is anchorable: it names a data-tour target or a CSS selector', () => {
  for (const tour of Object.values(TOURS)) {
    for (const s of tour.steps) {
      assert.ok(s.target || s.selector, tour.id + '/' + s.id + ' has neither target nor selector (unreachable)');
    }
  }
});
