// A class name in the JSX with no rule in the stylesheet renders with browser defaults, and it looks
// like an oversight rather than a bug: no error, no warning, just an element that never got the
// design. It has happened three times in this build alone — the read-only step list rendered as a
// bare <ol>, `.dd-either` ran two link lists together on one line, and a whole batch more were
// sitting there unnoticed.
//
// This is the cheap standing check for it: every dd- class the portal renders must exist somewhere
// in the stylesheets, and every dd- rule must be rendered by something. Both directions, because
// dead CSS is how a stylesheet grows a layer nobody dares touch.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const JSX = fs.readdirSync(here).filter((f) => f.endsWith('.jsx'));
const CSS = ['deepdive.css', 'admin.css', 'store.css', '../site.css', '../index.css']
  .map((f) => path.join(here, f)).filter((f) => fs.existsSync(f));

// ⚠ COMMENTS FIRST. This file is heavily commented and the comments NAME CLASSES — including
// sentences like "`.dd-either` had no rule". Scanning the raw text made a class look styled because
// it was mentioned in the note explaining that it was not. The check passed on the exact bug it was
// written to catch, which is the worst outcome a check has.
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ');
const css = CSS.map((f) => stripComments(fs.readFileSync(f, 'utf8'))).join('\n');
/** Class names that some rule actually selects. */
const styled = new Set([...css.matchAll(/\.(dd-[\w-]+)/g)].map((m) => m[1]));

/** Class names the JSX renders. Template halves like `dd-cst-${x}` become a prefix, and anything
 *  matching a prefix is treated as covered — the alternative is enumerating every status value. */
const used = new Map();       // class -> where
const prefixes = new Set();
for (const f of JSX) {
  const text = fs.readFileSync(path.join(here, f), 'utf8');
  for (const m of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const body = m[1] ?? m[2];
    for (const piece of body.split(/[\s]+/)) {
      if (piece.includes('${')) {                      // `dd-cst-${st.status}` → prefix dd-cst-
        const stem = piece.slice(0, piece.indexOf('${'));
        if (stem.startsWith('dd-') && stem.length > 3) prefixes.add(stem);
        continue;
      }
      const c = piece.replace(/[`{}'"]/g, '').trim();
      if (c.startsWith('dd-') && !used.has(c)) used.set(c, f);
    }
  }
}

test('every dd- class the portal renders has a rule in the stylesheets', () => {
  const naked = [...used.entries()]
    .filter(([c]) => !styled.has(c))
    .filter(([c]) => ![...prefixes].some((p) => c.startsWith(p)))
    .map(([c, f]) => `${c} (${f})`);
  assert.deepEqual(naked, [],
    'these render with browser defaults because nothing styles them — give them a rule or drop the class');
});

test('the scanner can still see the classes it is meant to check', () => {
  // A guard on the guard. If a refactor changes how className is written, the regexes above quietly
  // match nothing and this file starts reporting a clean sweep of an empty set.
  assert.ok(used.size > 80, `only found ${used.size} dd- classes in the JSX — the scanner has gone blind`);
  assert.ok(styled.size > 80, `only found ${styled.size} dd- rules in the CSS — the scanner has gone blind`);
});

test('a value marked as a gap actually renders as one', () => {
  // ⚠ `.dd-covgap` IS 0,1,0 AND `.dd-meta dd` IS 0,1,1, so the class lost the cascade and every
  // value marked as a gap rendered in the ordinary colour. The marking did nothing, which is worse
  // than not marking at all: it reads as "nothing here needs attention". Found by measuring the
  // computed colour in a browser, not by reading the stylesheet.
  assert.match(css, /\.dd-meta\s+dd\.dd-covgap\s*\{/,
    'the gap modifier has no rule specific enough to beat `.dd-meta dd`, so it will not apply');
});

// ⚠ THERE IS NO TEST HERE FOR THE CLASS COLLISION THAT PROMPTED THIS NOTE, and that is deliberate.
//
// The nav bar was called `.dd-bar` and `.dd-bar` was already the progress bar. Both rules applied to
// both components: the progress bar silently became sticky glass, and the nav bar inherited the
// progress bar's `display: flex`, which made its inner element shrink-wrap so the chrome ran
// narrower than the page beneath it. Nothing errored, and no scan for UNSTYLED classes could see it
// because both classes were styled.
//
// I wrote a guard for it and removed it. Two attempts, both wrong:
//   • "one bare class carrying a structural property in two rules" flags `.dd-preview`, which is a
//     single component deliberately styled in three places: a false positive on correct code.
//   • "the same property declared twice with different values" misses the real bug, because the two
//     `.dd-bar` rules set entirely different properties and still fought.
//
// What separates a collision from a split rule is whether two DIFFERENT COMPONENTS own the name,
// which is semantic and is not in the stylesheet. A guard that cries wolf on `.dd-preview` would be
// muted within a week and would then catch nothing, so this is written down rather than
// half-automated. Check a class name is free before taking it.

test('there is exactly one pane deciding where a proposal stands', () => {
  // ⚠ THREE SCREENS SHOW THIS CHIP: the proposal's own page, the process it would change, and the
  // innovation board where proposals are weighed against each other. The rule it enforces lives in
  // the schema and has already moved once: BUILD_STATES_NEEDING_WHY is FOUR states, not just
  // "cancelled". A private copy of a build constant has gone silently wrong in this codebase before
  // and BUILD_STATE_WORD carries a comment saying so.
  //
  // So no screen may build the pane itself. They import the one component, or a state moves in one
  // place and the reason stops being demanded in another.
  const here2 = path.dirname(url.fileURLToPath(import.meta.url));
  const owners = ['BuildPage.jsx', 'ProcessPage.jsx', 'InnovationBoard.jsx'];
  for (const f of owners) {
    const src = stripComments(fs.readFileSync(path.join(here2, f), 'utf8'));
    assert.match(src, /BuildStatePopover/, `${f} shows a proposal's state and does not use the shared pane`);
    // ⚠ THE FIRST VERSION OF THIS BANNED THE CONSTANT OUTRIGHT AND WAS WRONG. BuildPage reads
    // BUILD_STATES_NEEDING_WHY to decide whether to SHOW the reason at the top of the page, which
    // is a legitimate read of the vocabulary, not a second copy of the form's rule. What must not
    // be duplicated is the CONTROL: a screen offering its own list of states is a screen that can
    // offer one without demanding its reason.
    assert.doesNotMatch(src, /BUILD_STATES\s*\.\s*map/,
      `${f} builds its own state picker, so it can offer a state without demanding the reason`);
  }
  // and the shared one is the only thing that knows the rule
  const pane = fs.readFileSync(path.join(here2, 'BuildStatePopover.jsx'), 'utf8');
  assert.match(pane, /BUILD_STATES_NEEDING_WHY/, 'the shared pane no longer enforces the reason');
});

test('the record panel paint outranks the drawer glass, and the fallbacks outrank both', () => {
  // ⚠ SPECIFICITY TIES, SO ORDER IS THE WHOLE MECHANISM. `.ca-drawer-scrim:has(.rd-modal)` and
  // `.ca-drawer-scrim:has(.rd-drawer)` are both 0,2,0, and the modal IS a .rd-drawer, so whichever
  // rule comes later wins. The first version of the panel lost this fight silently: glow, cast and
  // rim all dead while the panel wore the side drawer's background and its leftward shadow, and
  // nothing errored. Raising specificity instead would break the other end of the contract, because
  // the reduced-transparency fallbacks win the same way. This pins the order: drawer glass, then
  // modal paint, then fallbacks.
  const css = fs.readFileSync(path.join(here, 'deepdive.css'), 'utf8');
  const drawerGlass = css.indexOf('.ca-drawer-scrim:has(.rd-drawer) { background:');
  const modalPaint = css.indexOf('.ca-drawer-scrim:has(.rd-modal) {');
  const fallbacks = css.indexOf('@supports not ((backdrop-filter');
  assert.ok(drawerGlass > 0 && modalPaint > 0 && fallbacks > 0, 'an anchor rule has been renamed');
  assert.ok(modalPaint > drawerGlass,
    'the modal paint sits before the drawer glass, so the drawer glass wins the tie and the panel loses its glow, cast and rim');
  assert.ok(fallbacks > modalPaint,
    'the modal paint sits after the fallbacks, so reduced-transparency users get the glass they asked to turn off');
});

test('every themable token the dark set defines, the light set redefines', () => {
  // ⚠ THE CLASSIC LIGHT-MODE FAILURE IS A TOKEN DEFINED ONLY IN DARK: nothing errors, the light
  // page simply renders that one colour from the dark palette — dark text on a dark surface, or a
  // wash that never changed. The geometry tokens (spacing, radii, widths, blurs, the bullet
  // indent) are theme-independent on purpose and are the only allowed absences.
  const css = stripComments(fs.readFileSync(path.join(here, 'deepdive.css'), 'utf8'));
  const rootBlock = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  const lightBlock = css.match(/:root\[data-dd-theme="light"\]\s*\{([\s\S]*?)\n\}/);
  assert.ok(rootBlock && lightBlock, 'a token block has moved or been renamed');
  const names = (b) => new Set([...b[1].matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const dark = names(rootBlock); const light = names(lightBlock);
  const GEOMETRY = new Set(['--dd-maxw', '--dd-1', '--dd-2', '--dd-3', '--dd-4', '--dd-5', '--dd-6',
    '--dd-bullet', '--dd-r-sm', '--dd-r', '--dd-r-lg', '--dd-g-blur', '--dd-g-blur-lg',
    '--dd-ink-dark', '--dd-grad-lime']); // dark ink on lime and the lime fill are the same in both modes
  const missing = [...dark].filter((n) => !GEOMETRY.has(n) && !light.has(n));
  assert.deepEqual(missing, [],
    'these tokens keep their DARK value in light mode, which is how dark-on-dark text ships');
  assert.ok(light.size > 20, `only ${light.size} tokens in the light block — the regex has gone blind`);
});
