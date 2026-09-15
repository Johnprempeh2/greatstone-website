// The spacing scale is 6 / 10 / 14 / 20 / 30, and the comment introducing it says the old file
// "used 5, 6, 7, 8, 9, 10, 12 and 14 almost interchangeably, which is why small elements read as
// crowded: there was no consistent difference between 'these two things are related' and 'these two
// are not'."
//
// It still does, in about two hundred places. This test does NOT pretend otherwise and does not
// force a sweep — changing two hundred paddings blind would be a bigger visual change than anyone
// has looked at. It is a RATCHET: the number may go down, never up. New work lands on the scale,
// and the backlog gets paid off deliberately, with eyes on it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('./deepdive.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');           // comments quote values too

// The steps, plus the micro-adjustments that are optical rather than rhythm (a 3px gap under a
// heading, a 2px pad that buys a 24px target) and the sizes that are not spacing at all.
const ON_SCALE = new Set(['6px', '10px', '14px', '20px', '30px']);
const NOT_RHYTHM = new Set(['1px', '2px', '3px', '4px', '5px']);

function offScale() {
  const found = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const sel = m[1].split('\n').pop().trim();
    for (const d of m[2].matchAll(/\b(padding|gap|margin)(-\w+)?:\s*([^;]+);/g)) {
      const v = d[3];
      if (/var\(|auto|%|calc|inherit|initial/.test(v)) continue;
      for (const one of v.trim().split(/\s+/)) {
        if (!/^\d+px$/.test(one)) continue;
        if (ON_SCALE.has(one) || NOT_RHYTHM.has(one)) continue;
        found.push(`${sel}: ${d[1]}${d[2] || ''} ${one}`);
      }
    }
  }
  return found;
}

// Measured 7 September 2026, immediately after the four *-foot rules were collapsed into one.
// LOWER THIS as the backlog is paid off. Never raise it: a new off-scale value is a number somebody
// typed once, and the scale exists so that spacing carries meaning rather than mood.
// ⚠ THIS MUST EQUAL THE ACTUAL COUNT, NOT A ROUND NUMBER ABOVE IT. Set to 172 first, against a real
// count of 148: three freshly planted off-scale values sailed under the slack and the test passed.
// A ratchet with give in it is not a ratchet.
const CEILING = 148;

test('off-scale spacing does not grow', () => {
  const found = offScale();
  assert.ok(found.length <= CEILING,
    `off-scale spacing rose from ${CEILING} to ${found.length}. New rules must use --dd-1..--dd-5. `
    + `Newest offenders include: ${found.slice(-6).join('; ')}`);
});

test('the scanner can still see spacing declarations', () => {
  // Without this, a change to how the stylesheet is written makes the ratchet report zero and the
  // ceiling looks brilliantly beaten.
  assert.ok(offScale().length > 20 || /padding:\s*var\(--dd-/.test(css),
    'found almost no spacing at all — the scanner has gone blind');
});
