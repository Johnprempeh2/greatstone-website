// The effort and impact chart cannot put a dot on a label.
//
// ⚠ A CHART CAN BE COMPLETELY UNREADABLE AND PASS EVERY OTHER CHECK WE HAVE. Overflow measures the
// page, contrast measures colour, the render test measures whether anything painted at all, and not
// one of them compares text to text. The first version of this chart put the quadrant labels in the
// plot's corners, and a proposal scored 9 for effort and 9.9 for impact landed on "Worth planning".
// Measured in a real browser, then fixed by moving the labels into bands the plot cannot reach.
//
// This is the arithmetic of that fix, so changing the dot size or a margin cannot quietly undo it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GEOM } from './deepdive-chart-geom.mjs';

// Measured in the browser at the chart's own font size (11px, weight 800): a text baseline sits
// about 9 above the top of its box and 3 below the bottom. Deliberately generous.
const ASCENT = 9, DESCENT = 3;

test('no dot can reach a quadrant label, at any score', () => {
  const { T, PH, DOT, QUADRANTS } = GEOM;
  // The furthest a dot reaches vertically: impact 10 puts its top at T - DOT/2, impact 0 puts its
  // bottom at T + PH + DOT/2.
  const dotTop = T - DOT / 2;
  const dotBottom = T + PH + DOT / 2;
  for (const q of QUADRANTS) {
    const box = { top: q.y - ASCENT, bottom: q.y + DESCENT };
    const above = box.bottom <= dotTop;
    const below = box.top >= dotBottom;
    assert.ok(above || below,
      `"${q.say}" sits at y ${q.y}, box ${box.top} to ${box.bottom}, inside the band a dot can reach `
      + `(${dotTop} to ${dotBottom}). Move it into the margin or grow the margin.`);
  }
});

test('a label cannot be pushed off the canvas by the clearance that protects it', () => {
  const { H, QUADRANTS } = GEOM;
  // ⚠ FOUND BY PLANTING. CLEAR is derived from DOT, so growing the dot correctly moves the labels
  // further out and the collision test stays green — while pushing them off the top of the viewBox
  // to a negative y, where they simply do not render. A guard against one failure that walks
  // straight into another is worse than no guard, because it reports success either way.
  for (const q of QUADRANTS) {
    assert.ok(q.y - ASCENT >= 0, `"${q.say}" is at y ${q.y}, so its top is off the canvas`);
    assert.ok(q.y + DESCENT <= H, `"${q.say}" is at y ${q.y}, below the bottom of the canvas (${H})`);
  }
});

test('the plot has room for the labels it puts outside it', () => {
  const { T, B, PH, H, DOT } = GEOM;
  // ⚠ A margin smaller than half a dot means a dot scored at an extreme is clipped by the viewBox,
  // which reads as a chart that has lost an item rather than one drawn to its edge.
  assert.ok(T >= DOT / 2, `top margin ${T} is under half a dot (${DOT / 2})`);
  assert.ok(B >= DOT / 2, `bottom margin ${B} is under half a dot (${DOT / 2})`);
  assert.equal(T + PH + B, H, 'the margins and the plot do not add up to the viewBox height');
});

test('the geometry is exported, so this test measures the real numbers', () => {
  // ⚠ Without this the file could stop exporting GEOM, the import would be undefined, and the two
  // tests above would throw rather than pass — but a partial export (say, no QUADRANTS) would let
  // the loop above iterate zero times and report success over a chart nobody checked.
  assert.ok(GEOM && GEOM.QUADRANTS, 'the chart no longer exports its geometry');
  assert.equal(GEOM.QUADRANTS.length, 4, 'a quadrant label is missing from the exported geometry');
  assert.ok(GEOM.DOT > 0 && GEOM.PH > 0, 'the geometry is not real numbers');
});
