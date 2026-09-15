// A control the browser dressed itself.
//
// `.dd-links-q` (the "Find a session" filter in every InlineLinks popover) set width and margin
// and nothing else, so it rendered as a white Arial box with a native inset border in the middle
// of a dark glass popover. Every standing check passed: the class sweep asks whether a class HAS
// a rule, and it had one. A rule's existence is not its sufficiency.
//
// The fix was a base layer rather than one more component rule, so the failure mode is gone
// rather than fixed once. This guards the layer itself.
//
// ⚠ WHAT THIS CANNOT DO: measure a rendered control. Computed style needs real layout, so the
// actual sweep lives in tools/native-field-probe.mjs driven through tools/overlap-harness.html
// (window.__fields()), and is proven by planting `all: revert` on a field and watching it go red.
// This file guards the things a text scan genuinely can.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, 'deepdive.css'), 'utf8');
// comments name classes while explaining them, so strip them or a mention reads as a rule
const live = css.replace(/\/\*[\s\S]*?\*\//g, ' ');

/** The base layer, found by WHAT IT TARGETS rather than by position.
 *  ⚠ The first version took the first `:where(.dd-wrap` in the file, and the day a second
 *  zero-specificity base rule was added with the same prefix (overflow-wrap for unbreakable
 *  tokens) this test started asserting against that one instead: two failures about a field
 *  layer that had not changed at all. Locate by the selector's own content. */
const baseRule = (() => {
  for (const m of live.matchAll(/:where\(\.dd-wrap[^{]*\{[^}]*\}/g)) {
    const sel = m[0].slice(0, m[0].indexOf('{'));
    if (/\binput\b/.test(sel) && /\bselect\b/.test(sel) && /\btextarea\b/.test(sel)) return m[0];
  }
  return null;
})();

test('a base field layer exists, so a control can never arrive undressed', () => {
  assert.ok(baseRule, 'the :where(...) base field rule is gone; every control is back to dressing itself');
  for (const prop of ['font', 'color', 'background', 'border']) {
    assert.match(baseRule, new RegExp(`${prop}\\s*:`),
      `the base field layer sets no ${prop}, which is one of the four the browser will otherwise supply`);
  }
});

test('the base layer contributes zero specificity, so every component rule still wins', () => {
  // ⚠ THE CASCADE TRAP, THIRD TIME IN THIS FILE. A plain `.dd-wrap select` descendant selector is
  // 0,1,1 and would BEAT a bare `.dd-sel` at 0,1,0: the base would silently restyle the pill
  // selects, the status selects and the compact certainty picker. Both halves must be :where().
  assert.ok(baseRule.startsWith(':where('), 'the scope half is not wrapped in :where()');
  const selector = baseRule.slice(0, baseRule.indexOf('{'));
  // ⚠ A REGEX CANNOT DO THIS. `:where(input:not([type="checkbox"]):not([type="radio"])…)` nests
  // parens several deep, and a one-level pattern left the whole second half behind and called it
  // specificity: the test failed on a selector that was correct. Match the parens properly.
  const strip = (sel) => {
    let out = ''; let i = 0;
    while (i < sel.length) {
      const at = sel.indexOf(':where(', i);
      if (at < 0) { out += sel.slice(i); break; }
      out += sel.slice(i, at);
      let depth = 0; let j = at + ':where'.length;
      for (; j < sel.length; j += 1) {
        if (sel[j] === '(') depth += 1;
        else if (sel[j] === ')') { depth -= 1; if (!depth) break; }
      }
      i = j + 1;
    }
    return out.replace(/\s+/g, ' ').trim();
  };
  const bare = strip(selector);
  assert.equal(bare, '', `these parts of the base selector carry specificity: "${bare}"`);
});

test('the base layer reaches every container that holds fields, including the portalled ones', () => {
  // A drawer and a popover portal to <body>, so they are NOT inside .dd-wrap: a scope list that
  // forgets them leaves exactly the controls that float above everything undressed.
  for (const scope of ['.dd-wrap', '.ca-drawer', '.dd-pop', '.dd-links-pop']) {
    assert.ok(baseRule.includes(scope), `${scope} is outside the base field layer's scope`);
  }
});

test('checkboxes stay the browser\'s, because the portal paints its own box beside them', () => {
  assert.match(baseRule, /:not\(\[type="checkbox"\]\)/,
    'dressing the native checkbox fights the box the portal draws next to it');
});

test('the rendered sweep is still reachable, and says how to trust it', () => {
  const probe = path.join(here, '..', '..', 'tools', 'native-field-probe.mjs');
  assert.ok(fs.existsSync(probe), 'the field probe is gone; nothing measures a rendered control');
  const harness = fs.readFileSync(path.join(here, '..', '..', 'tools', 'overlap-harness.html'), 'utf8');
  assert.match(harness, /__fields/, 'the harness no longer exposes window.__fields(), so the sweep cannot be run');
  const src = fs.readFileSync(probe, 'utf8');
  // The probe composites alpha. Without that it reported a field on a 5% lime wash as sitting on
  // SOLID LIME: a finding that was never on the screen, in the place the design is most careful.
  assert.match(src, /alpha \* /, 'the probe no longer composites translucent layers, so it will invent findings');
});

// ── a painted box on an inline element ────────────────────────────────────────────────────────
//
// `.dd-nogap` carries padding, a dashed border and a wash. Seventeen of its nineteen call sites
// used a <p>; two used a <span>, and a <span> is inline, so the box existed once per LINE: the
// border drew in ragged pieces, the padding overlapped its neighbours, and the text sat outside
// its own outline (John's screenshot, 12 Sep). Valid markup, complete rule, every gate green.
//
// The rule that generalises: a class that PAINTS A BOX must DECLARE A DISPLAY. Anything but bare
// inline is safe (inline-flex and inline-block do not fragment), and declaring it means the class
// cannot be broken by whichever tag a caller reaches for.
const jsx = fs.readdirSync(here).filter((f) => f.endsWith('.jsx'))
  .map((f) => [f, fs.readFileSync(path.join(here, f), 'utf8')]);

/** Rules keyed by class, for single-class selectors only: `.x { ... }`. Multi-class and
 *  descendant selectors are somebody else's context and cannot be judged from the class alone. */
const ruleFor = (cls) => {
  const re = new RegExp(`(^|[\\s}])\\.${cls}\\s*\\{([^}]*)\\}`, 'g');
  let body = '';
  for (const m of live.matchAll(re)) body += m[2] + ';';
  return body;
};

// ⚠ CONSERVATIVE ON PURPOSE. A span inside a flex or grid container is BLOCKIFIED, so it cannot
// fragment however its rule reads, and this scan cannot see a parent. It will therefore flag some
// classes that are safe today. That is the right way round: declaring the display costs nothing,
// is inert where the parent already blockifies, and stops the class depending on where it is used.
test('a class that paints a box declares a display, so a span caller cannot fragment it', () => {
  const bad = [];
  // ⚠ COUNT THE SPANS EXAMINED. Every assertion here is that `bad` is empty, which is equally true
  // when the walk finds no files, when no <span className=...> matches, or when `ruleFor` stops
  // resolving a class to its rule body. Three separate ways to report clean having looked at
  // nothing, in a check whose whole job is to look.
  let spans = 0;
  for (const [file, text] of jsx) {
    // every class applied to a <span ... className="a b">
    for (const m of text.matchAll(/<span[^>]*className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      spans += 1;
      const classes = String(m[1] ?? m[2]).split(/\s+/)
        .filter((c) => c.startsWith('dd-') && !c.includes('${'));
      for (const cls of classes) {
        const body = ruleFor(cls);
        if (!body) continue;
        const paints = /border(-[a-z]+)?\s*:\s*(?!none)/.test(body) || /background\s*:/.test(body);
        const padsDown = /padding(-(top|bottom))?\s*:/.test(body);
        if (!paints || !padsDown) continue;
        if (/display\s*:/.test(body)) continue;          // declared: inline-flex and friends are safe
        bad.push(`${file}: <span class="${cls}"> paints a box and declares no display`);
      }
    }
  }
  assert.ok(jsx.length >= 20, `only ${jsx.length} components read: the scan is looking in the wrong place`);
  assert.ok(spans >= 30,
    `only ${spans} classed spans found across ${jsx.length} components: the className pattern has stopped matching`);
  assert.deepEqual([...new Set(bad)], [],
    'these will draw one box PER LINE as soon as their text wraps: declare a display on the class');
});

test('the fragmented-box sweep is reachable', () => {
  const probe = fs.readFileSync(path.join(here, '..', '..', 'tools', 'native-field-probe.mjs'), 'utf8');
  assert.match(probe, /probeFragmentedBoxes/, 'the fragmented-box probe is gone');
  assert.match(probe, /getClientRects\(\)\.length > 1/,
    'the probe no longer measures rects per line, which is the only thing that can see this');
  const harness = fs.readFileSync(path.join(here, '..', '..', 'tools', 'overlap-harness.html'), 'utf8');
  assert.match(harness, /__boxes/, 'the harness no longer exposes window.__boxes()');
});
