// One class name, one meaning.
//
// The journey strip and the offering board both defined `.dd-stage`. The later rule won, turned the
// board's stage into a flex row, and crushed the offering heading to one character per line. No
// error, and the contrast and target sweeps all passed, because none of them asks "is this element
// the display it was meant to be".
//
// This does not try to be a linter, and a first attempt at a broader "is every class defined"
// check was deleted rather than left to be ignored: it broke on @media blocks and reported a dozen
// classes that are defined perfectly well. It catches the ONE shape that actually bit: a base class
// (no modifier, no descendant) given `display` in two separate places in the stylesheet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, 'deepdive.css'), 'utf8');

/** Every rule as {selector, body, media, at}, comments stripped.
 *
 *  `media` says whether the rule sits inside an @media block and `at` is its position in the file,
 *  because both halves of the question below turn on those two facts. The body scan assumes
 *  declaration blocks do not nest, which is true of this stylesheet: there is no CSS nesting in it.
 */
function rules(text) {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const stack = [];
  const re = /([^{}]*)\{|\}/g;
  let m;
  while ((m = re.exec(clean))) {
    if (m[0] === '}') { stack.pop(); continue; }
    const head = (m[1] || '').trim();
    if (head.startsWith('@')) { stack.push(head); continue; }
    const start = re.lastIndex;
    const end = clean.indexOf('}', start);
    if (end < 0) break;
    out.push({ sel: head, body: clean.slice(start, end), at: start,
      media: stack.some((s) => /^@media/.test(s)) });
    re.lastIndex = end + 1;
  }
  return out;
}

/** Every bare-class rule that sets a display, keyed by class, in source order. */
function displaysByClass(text) {
  const seen = new Map();
  for (const r of rules(text)) {
    for (const one of r.sel.split(',').map((x) => x.trim())) {
      // a bare single class: .dd-thing and nothing else
      if (!/^\.[\w-]+$/.test(one)) continue;
      if (!/(^|;)\s*display\s*:/.test(r.body)) continue;
      if (!seen.has(one)) seen.set(one, []);
      seen.get(one).push(r);
    }
  }
  return seen;
}

test('no base class sets display in two places', () => {
  // ⚠ A RESPONSIVE OVERRIDE IS NOT THE BUG THIS IS FOR. The shape that bit was two unconditional
  // rules, where the later one wins everywhere and the author of the earlier one never finds out.
  // A rule inside an @media block is conditional and deliberate, and counting it as a clash pushed
  // the next author towards writing `.dd-top-in > .dd-thing` purely to slip past this test, which
  // would leave the real collision uncaught behind a selector nobody can grep for.
  const clashes = [...displaysByClass(css).entries()]
    .filter(([, rs]) => rs.filter((r) => !r.media).length > 1)
    .map(([sel]) => sel);
  assert.deepEqual(clashes, [],
    'these classes are given a display in more than one unconditional rule, which is how one component silently restyles another');
});

test('a responsive display override is written below the rule it overrides', () => {
  // ⚠ THE OTHER HALF, AND THE ONE THAT ACTUALLY HAPPENED. A media query carries no extra
  // specificity, so `@media (max-width: 700px) { .dd-top-client { display: none } }` written above
  // `.dd-top-client { display: inline-flex }` loses the tie and does nothing at all. It is invisible
  // in review, invisible in the file, and only a screenshot at the right width shows it.
  const bad = [];
  let checked = 0;
  for (const [sel, rs] of displaysByClass(css)) {
    const base = rs.filter((r) => !r.media);
    const over = rs.filter((r) => r.media);
    if (!base.length || !over.length) continue;
    checked += 1;
    const last = Math.max(...base.map((r) => r.at));
    for (const o of over) if (o.at < last) bad.push(sel);
  }
  // ⚠ Without this the test reports clean the moment the parser stops finding pairs at all.
  assert.ok(checked >= 1,
    'no class has both an unconditional display and a responsive one, so this test measured nothing');
  assert.deepEqual([...new Set(bad)], [],
    'these responsive display overrides sit above the rule they override and therefore never apply');
});

// ── one control, one costume ───────────────────────────────────────────────────────────────────
// The question's facts row mixes values nobody can change (Answer, Asked in, Sits on) with values
// they can (Certainty, Status, How it gets answered). Two of the editable three are `.dd-isel-s`
// selects with a filled background; the third is `.dd-isel-b`, which opens a pane rather than a
// list because certainty and its note are one decision. That is a good reason for a different
// ELEMENT and no reason at all for a different look: it rendered as bare text, so the one field
// that decides how much effort a question gets was the one field that did not look clickable.
// They are the same control and have to read as one, which means the fill above all: on that row
// the fill IS the signal that separates an editable value from a fixed one.
test('the two halves of the inline-select control look like one control', () => {
  const decls = (sel) => {
    const r = rules(css).filter((x) => x.sel.trim() === sel && !x.media);
    assert.equal(r.length, 1, `expected exactly one unconditional rule for ${sel}, found ${r.length}`);
    const out = new Map();
    for (const d of r[0].body.split(';')) {
      const i = d.indexOf(':');
      if (i > 0) out.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
    }
    return out;
  };
  const b = decls('.dd-isel-b');
  const s = decls('.dd-isel-s');

  // ⚠ The floor. Without it, deleting `background` from BOTH rules passes this test while the
  // control loses the very signal it exists to carry.
  for (const prop of ['background', 'font-size', 'font-weight', 'padding']) {
    assert.ok(b.has(prop) && s.has(prop),
      `${prop} is no longer declared on both .dd-isel-b and .dd-isel-s, so this test is not comparing it`);
    assert.equal(b.get(prop), s.get(prop),
      `.dd-isel-b and .dd-isel-s disagree on ${prop} (${b.get(prop)} vs ${s.get(prop)}): they are the `
      + 'same control and sit on the same row, so one of them is teaching the reader the wrong rule');
  }
  // The button inherits the body's line-height where a select computes `normal`, which stood them
  // 4px apart on identical padding. Matching padding is cosmetic unless this is pinned too.
  assert.ok(b.has('line-height'),
    '.dd-isel-b no longer pins its line-height, so it inherits the body 1.6 and stands taller than the select beside it');
});

// ── the two glass fallbacks must land on the same place ────────────────────────────────────────
// The portal's surfaces are translucent over a blur. That has two separate fallbacks: a browser
// with no backdrop-filter (@supports not), and a reader who has asked their system for less
// transparency (prefers-reduced-transparency). The stylesheet already states the rule in its own
// comment: two fallbacks for one surface should agree, or the surface has two different
// appearances depending on WHY the blur is off.
//
// They did not agree. Three surfaces differed, in the block whose comment states the rule: the
// modal scrim was .72 in one and .82 in the other, and the drawer scrim and the sticky modal head
// had no @supports fallback at all, so a browser without backdrop-filter left the page readable
// through a .58 scrim and the form visibly scrolling under a see-through header. Neither sweep can
// see this: both conditions are things this machine's browser does not do.
// ⚠ AND THIS TEST WAS ITSELF TOO NARROW WHEN FIRST WRITTEN. It compared ONE pair of blocks, and
// the stylesheet has more than one pair (.dd-step carries its own). Worse, agreeing tells you
// nothing about a surface neither block mentions: eleven of the portal's glass surfaces, the
// popovers, the live session bar, the user menu, notices, the rail and its cards, build cards and
// the modal foot, had no fallback in either block and so agreed perfectly by being absent from
// both. So the check now starts from the glass itself and asks what covers it.
const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/** Every {start,end} of the fallback blocks matching `needle`, as index pairs into `text`. */
function blockRanges(text, needle) {
  const out = [];
  let i = 0;
  while ((i = text.indexOf(needle, i)) >= 0) {
    let depth = 0;
    const open = text.indexOf('{', i);
    let k = open;
    for (; k < text.length; k += 1) {
      if (text[k] === '{') depth += 1;
      else if (text[k] === '}') { depth -= 1; if (!depth) break; }
    }
    out.push([open, k]);
    i = k;
  }
  return out;
}

const SUPPORTS = '@supports not ((backdrop-filter';
const REDUCED = '@media (prefers-reduced-transparency: reduce)';

/** Selectors named anywhere inside the given ranges. */
function selectorsIn(text, ranges) {
  const out = new Set();
  for (const [a, b] of ranges) {
    for (const m of text.slice(a + 1, b).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const sel of m[1].split(',').map((s) => s.trim()).filter(Boolean)) out.add(sel);
    }
  }
  return out;
}

// Two surfaces are deliberately absent, and the reason is written down rather than assumed:
//   .dd-dash .org-stat  the fallback names `.dd-wrap .org-stat`, equal specificity and later in the
//                       file, and the element matches both (checked in the browser, not reasoned).
//   .dd-tabfig figcaption  its ground is a photograph, so it is bounded by OPACITY, not by blur:
//                       its own comment computes the worst case any photo can produce at 7.97:1,
//                       and turning the blur off does not change a composite.
const GLASS_WITHOUT_A_FALLBACK = new Set(['.dd-dash .org-stat', '.dd-tabfig figcaption']);

test('every glass surface has a solid to land on when the blur is off', () => {
  const text = stripCss(css);
  const sups = blockRanges(text, SUPPORTS);
  const reds = blockRanges(text, REDUCED);
  assert.ok(sups.length && reds.length, 'the glass fallback blocks are gone entirely');

  const inAny = (i, rs) => rs.some(([a, b]) => i > a && i < b);
  const glass = new Map();
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (inAny(m.index, sups) || inAny(m.index, reds)) continue;
    if (!/(^|[;\s])(-webkit-)?backdrop-filter\s*:\s*(?!none)/.test(m[2])) continue;
    for (const sel of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      if (!sel.startsWith('@')) glass.set(sel, true);
    }
  }
  // ⚠ The floor. If the glass is renamed or the scan breaks, an empty set passes everything.
  assert.ok(glass.size >= 20,
    `only ${glass.size} glass surfaces found: the scan has gone blind, so "all covered" means nothing`);

  const S = selectorsIn(text, sups);
  const R = selectorsIn(text, reds);
  const bare = [...glass.keys()]
    .filter((sel) => !GLASS_WITHOUT_A_FALLBACK.has(sel))
    .filter((sel) => !(S.has(sel) && R.has(sel)))
    .map((sel) => `${sel}  (no-blur: ${S.has(sel) ? 'yes' : 'MISSING'}, reduced: ${R.has(sel) ? 'yes' : 'MISSING'})`);
  assert.deepEqual(bare, [],
    'these surfaces are translucent over a blur with no solid to fall back on, so with the blur off '
    + 'the page behind them shows through: either give them the solid their --dd-g token composites '
    + 'to, or add them to GLASS_WITHOUT_A_FALLBACK with the reason');
});

function blockBackgrounds(startRe) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const at = clean.search(startRe);
  assert.ok(at >= 0, `the fallback block matching ${startRe} is gone: this test can no longer find it`);
  let depth = 0;
  const open = clean.indexOf('{', at);
  let i = open;
  for (; i < clean.length; i += 1) {
    if (clean[i] === '{') depth += 1;
    else if (clean[i] === '}') { depth -= 1; if (!depth) break; }
  }
  const out = new Map();
  for (const m of clean.slice(open + 1, i).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const bg = (m[2].match(/(?:^|;)\s*background\s*:\s*([^;]+)/) || [])[1];
    if (!bg) continue;
    for (const sel of m[1].split(',').map((s) => s.trim()).filter(Boolean)) out.set(sel, bg.trim());
  }
  return out;
}

test('the no-blur fallback and the reduced-transparency fallback agree on every surface', () => {
  const sup = blockBackgrounds(/@supports not \(\(backdrop-filter/);
  const red = blockBackgrounds(/@media \(prefers-reduced-transparency: reduce\)/);
  // ⚠ The floor: two empty maps agree perfectly. The blocks exist to name solid grounds, so if
  // they stop naming any, this test is comparing nothing.
  assert.ok(sup.size >= 8 && red.size >= 8,
    `only ${sup.size} and ${red.size} surfaces carry a background fallback: the blocks have been gutted`);

  const bad = [];
  for (const sel of new Set([...sup.keys(), ...red.keys()])) {
    if (sup.get(sel) !== red.get(sel)) {
      bad.push(`${sel}\n     no-blur: ${sup.get(sel) || '(absent)'}\n     reduced: ${red.get(sel) || '(absent)'}`);
    }
  }
  assert.deepEqual(bad, [],
    'these surfaces fall back to different grounds depending on WHY the blur is off, so the portal '
    + 'has two different appearances that nothing on this machine can see');
});

// ── nothing moves for a reader who asked for stillness ─────────────────────────────────────────
// The portal turns motion off in eight separate blocks, and all seven keyframe animations were
// covered. One transition was not, and it was the only one that actually moves anything: the site
// button lifts by translateY(-1px) on hover and presses to scale(.96) on active, and the portal
// itself adds the transition that animates them. Everything around it is stricter (a pure
// border-and-background transition on .dd-pick a is killed), so the transform was an oversight
// rather than a decision.
//
// Like the glass fallbacks, no sweep on this machine can see it: the browser here reports no
// motion preference, so the blocks never apply and the page measures identically either way.
test('every animation and every moving transition is turned off under reduced motion', () => {
  const text = stripCss(css);
  const blocks = [];
  let i = 0;
  while ((i = text.indexOf('@media (prefers-reduced-motion', i)) >= 0) {
    const cond = text.slice(i, text.indexOf('{', i));
    let depth = 0;
    const open = text.indexOf('{', i);
    let k = open;
    for (; k < text.length; k += 1) {
      if (text[k] === '{') depth += 1;
      else if (text[k] === '}') { depth -= 1; if (!depth) break; }
    }
    blocks.push({ reduce: /reduce/.test(cond), a: open, b: k });
    i = k;
  }
  // ⚠ `no-preference` blocks are the opposite rule (motion added only when it is welcome), so they
  // are excluded from what counts as "turned off" while still counting as "inside a block".
  const reduce = blocks.filter((b) => b.reduce);
  assert.ok(reduce.length >= 4, `only ${reduce.length} reduced-motion blocks found: the scan has gone blind`);

  const off = new Set();
  for (const b of reduce) {
    for (const m of text.slice(b.a + 1, b.b).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/(transition|animation)\s*:\s*none/.test(m[2])) continue;
      for (const sel of m[1].split(',').map((s) => s.trim())) off.add(sel);
    }
  }
  assert.ok(off.size >= 5, `only ${off.size} selectors are actually stilled: this test is measuring nothing`);

  const inAny = (at) => blocks.some((b) => at > b.a && at < b.b);
  const moving = [];
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (inAny(m.index)) continue;
    const t = (m[2].match(/(?:^|[;\s])transition\s*:\s*([^;]+)/) || [])[1];
    const animates = /(^|[;\s])animation\s*:\s*(?!none)/.test(m[2]);
    const moves = t && /transform|translate|scale|height|width|top|left|right|bottom|all\b/.test(t);
    if (!moves && !animates) continue;
    const sels = m[1].split(',').map((s) => s.trim());
    if (sels.every((s) => off.has(s))) continue;
    moving.push(`${m[1].trim().slice(0, 60)}  =>  ${(t || 'animation').replace(/\s+/g, ' ').slice(0, 50)}`);
  }
  assert.deepEqual(moving, [],
    'these rules move or animate something and are not stilled for a reader who has asked their '
    + 'system for reduced motion');
});

// ── one class, one owner ───────────────────────────────────────────────────────────────────────
// SessionRun and SessionPage both used `.dd-run-q` and `.dd-run-t` for different things. The CSS
// rules are unconditional, so each component silently wore the other's: SessionPage's question TEXT
// picked up `display: flex` from SessionRun's title row, and SessionRun's question QUEUE picked up
// the card's 46px left padding and its ::before counter, which put a stray digit at the top of the
// live session queue. The existing display test could not see either: it only fires when the same
// class is given `display` TWICE, and here each property was declared exactly once, by a rule that
// belonged to somebody else.
//
// This is narrower than a general checker on purpose. The generalised version was tried and the
// candidate list was mostly noise (`:where()` ancestors, @supports blocks read as unconditional),
// and a gate that cries wolf gets ignored. This asserts the specific separation that was restored.
test('the live session and the session page do not share class names', () => {
  const run = fs.readFileSync(path.join(here, 'SessionRun.jsx'), 'utf8');
  const page = fs.readFileSync(path.join(here, 'SessionPage.jsx'), 'utf8');
  const classesIn = (src) => {
    const out = new Set();
    for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      for (const c of `${m[1] || ''} ${m[2] || ''}`.split(/[\s${}]+/)) if (/^dd-run-/.test(c)) out.add(c);
    }
    return out;
  };
  const a = classesIn(run);
  const b = classesIn(page);
  // ⚠ The floor: if the scan stops finding classes, an empty intersection is not a clean sheet.
  assert.ok(a.size >= 4 && b.size >= 2,
    `found ${a.size} dd-run-* classes in SessionRun and ${b.size} in SessionPage: the scan has gone blind`);

  // ⚠ SHARING IS NOT ALWAYS A COLLISION. `.dd-run-nothere` is one alert paragraph styled by one
  // rule and used for the same purpose in both files, which is reuse. The failure is two components
  // meaning DIFFERENT things by the same name, so a class that is deliberately common is named here
  // rather than the test being loosened.
  const SHARED_ON_PURPOSE = new Set(['dd-run-nothere']);
  const shared = [...a].filter((c) => b.has(c) && !SHARED_ON_PURPOSE.has(c));
  assert.deepEqual(shared, [],
    'these dd-run-* classes are used by BOTH the live session and the session page, so each '
    + 'component silently wears the other\'s rules: that is how a counter meant for a question card '
    + 'ended up printing a digit on the session queue');
});

// ── a rule written twice is a rule nobody can edit ─────────────────────────────────────────────
// `.dd-crumb` was defined twice, about a hundred lines apart, with its two `a` rules byte for byte
// identical and a base rule that disagreed on font-weight (600 against 700) and margin-bottom
// (18px against 14px). The later block won on all ten pages that render a breadcrumb, so the first
// one was dead: editing the values there changed nothing, which is the worst kind of duplicate
// because it looks exactly like the place to make the change.
//
// ⚠ NARROWER THAN "the same property twice" ON PURPOSE. This stylesheet deliberately layers a later
// tap-target pass that re-declares padding on several link and button classes, and flagging that
// would be crying wolf. An identical selector with an identical body is never deliberate.
test('no rule is written twice with the same body', () => {
  const text = stripCss(css);
  // @-blocks are skipped: the same rule inside @supports and inside @media is the agreement the
  // glass fallbacks are REQUIRED to have, and is checked by its own test above.
  const atRanges = [];
  let i = 0;
  while ((i = text.indexOf('@', i)) >= 0) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    let depth = 0;
    let k = open;
    for (; k < text.length; k += 1) {
      if (text[k] === '{') depth += 1;
      else if (text[k] === '}') { depth -= 1; if (!depth) break; }
    }
    atRanges.push([open, k]);
    i = k;
  }
  const inAt = (at) => atRanges.some(([a, b]) => at > a && at < b);

  const seen = new Map();
  let counted = 0;
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (inAt(m.index)) continue;
    const sel = m[1].replace(/\s+/g, ' ').trim();
    if (!sel || sel.startsWith('@')) continue;
    const body = m[2].replace(/\s+/g, ' ').trim().replace(/;$/, '');
    if (!body) continue;
    counted += 1;
    const key = `${sel} {${body}}`;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(text.slice(0, m.index).split('\n').length);
  }
  // ⚠ The floor: a parser that stops matching reports no duplicates at all.
  assert.ok(counted > 300, `only ${counted} unconditional rules parsed: the scan has gone blind`);

  const dupes = [...seen.entries()]
    .filter(([, lines]) => lines.length > 1)
    .map(([key, lines]) => `lines ${lines.join(', ')}: ${key.slice(0, 90)}`);
  assert.deepEqual(dupes, [],
    'these rules are written more than once, so one copy is dead and editing it does nothing');
});
