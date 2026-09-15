// The glass layer rests on ONE claim: every translucent tint is mixed so that WITHOUT the blur it
// composites to the solid colour it stands in for. That is what lets the portal wear glass without
// betting its legibility on backdrop-filter rendering — no support, reduced-transparency, a
// screenshot tool, a print, and the surface lands back on the same colour it always was.
//
// It is an arithmetic claim about the stylesheet, so it is testable without a browser, and it is
// exactly the kind of claim that silently stops being true when somebody nudges an alpha.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./deepdive.css', import.meta.url), 'utf8');

const hex = (h) => { const v = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)); };
const token = (name) => {
  const m = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  assert.ok(m, `token ${name} is not defined`);
  return m[1].trim();
};
const rgba = (v) => {
  const m = v.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/);
  assert.ok(m, `not an rgba value: ${v}`);
  return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] };
};
const over = (fg, ground) => fg.rgb.map((c, i) => Math.round(c * fg.a + ground[i] * (1 - fg.a)));

const VOID = hex('#121212');   // --gs-bg, the page ground

// glass token, the solid it stands in for, and the ground it is composited over
const PAIRS = [
  ['--dd-g-1', '--dd-s-1', VOID],
  ['--dd-g-2', '--dd-s-2', VOID],
  ['--dd-g-3', '--dd-s-3', VOID],
  ['--dd-g-recess', '--dd-recess', VOID],
  // the canvas cards sit on the recess, not on the page, so they are mixed against that instead
  ['--dd-g-node', '--dd-s-2', hex(token('--dd-recess'))],
];

test('every glass tint composites to the solid surface it replaces', () => {
  for (const [glass, solid, ground] of PAIRS) {
    const got = over(rgba(token(glass)), ground);
    const want = hex(token(solid));
    const drift = got.map((c, i) => Math.abs(c - want[i]));
    assert.ok(Math.max(...drift) <= 1,
      `${glass} composites to rgb(${got}) over rgb(${ground}), but ${solid} is rgb(${want}). ` +
      `Off by ${drift}. Re-mix the tint: channel = (solid - (1-alpha) * ground) / alpha.`);
  }
});

// A blurred surface with no fallback is the failure mode this whole design avoids, so the guards
// have to exist. Both are cheap to delete by accident and invisible when missing.
test('the no-backdrop-filter and reduced-transparency fallbacks are both present', () => {
  assert.ok(/@supports not \(\(backdrop-filter/.test(css), 'the @supports fallback is gone');
  assert.ok(/@media \(prefers-reduced-transparency: reduce\)/.test(css),
    'the reduced-transparency fallback is gone');
});

// Every glassed surface must appear in BOTH guards. A surface that gets a blur but no fallback is
// the one that goes translucent-and-unreadable on the machine that cannot render it.
test('every glassed surface has a solid fallback in both guards', () => {
  const supportsBlock = css.slice(css.indexOf('@supports not ((backdrop-filter'));
  const reducedBlock = css.slice(css.indexOf('@media (prefers-reduced-transparency'));
  // the surfaces that carry a backdrop-filter, by the selector each is declared under
  const GLASSED = ['.dd-ns', '.dd-journey', '.dd-access', '.dd-tabs', '.dd-tile', '.dd-canvas-bar',
    '.dd-cnode', '.rd-drawer'];
  for (const sel of GLASSED) {
    assert.ok(supportsBlock.includes(sel), `${sel} wears glass but has no @supports fallback`);
    assert.ok(reducedBlock.includes(sel), `${sel} wears glass but is not turned off for reduced transparency`);
  }
});
