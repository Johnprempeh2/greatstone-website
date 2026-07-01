import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RT_COLORS, RT_HIGHLIGHTS, RT_SPAN_CLASSES, RT_BG_PAIRS, RT_HEX, RT_PAGE_BG, contrastRatio } from './richtext-marks.mjs';

test('the span-class allowlist is exactly the toolbar swatch classes (closed set, no drift)', () => {
  const fromToolbar = [...RT_COLORS, ...RT_HIGHLIGHTS].map((x) => x.className).filter(Boolean).sort();
  assert.deepEqual([...RT_SPAN_CLASSES].sort(), fromToolbar);
  assert.deepEqual([...RT_SPAN_CLASSES].sort(), ['gs-rt-bg-accent', 'gs-rt-bg-accent-pill', 'gs-rt-bg-teal', 'gs-rt-bg-teal-pill', 'gs-rt-c-accent', 'gs-rt-c-teal', 'gs-rt-c-muted'].sort());
});

test('swatches expose CLASSES only, never a raw colour string (brand-constrained by construction)', () => {
  for (const sw of [...RT_COLORS, ...RT_HIGHLIGHTS]) {
    assert.doesNotMatch(sw.className, /#|rgb|hsl/i, sw.id + ' className must not contain a raw colour');
  }
});

test('every highlight box passes WCAG AA (>=4.5:1) for its baked ink', () => {
  for (const [cls, pair] of Object.entries(RT_BG_PAIRS)) {
    const ratio = contrastRatio(pair.bg, pair.ink);
    assert.ok(ratio >= 4.5, cls + ' contrast ' + ratio.toFixed(2) + ' must be >= 4.5');
  }
});

test('foreground colour runs pass AA on the dark page background', () => {
  for (const key of ['accent', 'teal', 'muted']) {
    const ratio = contrastRatio(RT_HEX[key], RT_PAGE_BG);
    assert.ok(ratio >= 4.5, key + ' on page bg contrast ' + ratio.toFixed(2) + ' must be >= 4.5');
  }
});

test('contrastRatio maths: black/white is 21, identical is 1', () => {
  assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 0.01);
  assert.ok(Math.abs(contrastRatio('#777777', '#777777') - 1) < 0.01);
});
