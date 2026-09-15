// An ARIA pattern that is announced and not implemented is a lie to assistive technology: a screen
// reader says "tab, 2 of 6" and the arrow keys that announcement promises do nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
const here = path.dirname(url.fileURLToPath(import.meta.url));

// ⚠ SCOPED TO THE DEEP DIVE. The same faults exist in CatalogueAdmin, ClientsManager, InquiryUI and
// StoreCart, which are other features and not this loop's to change. A test that fails on code its
// owner is not touching is a test that gets ignored, and then it stops protecting the code it IS
// for. Those are worth their own pass; they are not silently forgiven here, they are out of scope.
const FILES = ['DeepDivePortal.jsx', 'ProcessPage.jsx', 'QuestionPage.jsx', 'EvidencePage.jsx',
  'SessionPage.jsx', 'SourcePage.jsx', 'PersonPage.jsx', 'OfferingBoard.jsx', 'ProcessCanvas.jsx',
  'RecordDrawer.jsx', 'Attachments.jsx', 'ChangeLog.jsx', 'InlineText.jsx', 'RecordSearch.jsx'];

// ⚠ STRIP COMMENTS FIRST. This one bit twice in one session: the CSS class check counted a class
// named in a comment as styled, and this file's own note — "no aria-controls, no tabpanel" — made
// the tablist check pass with the real attribute deleted. The sentence explaining the bug satisfies
// the check written for it. Never scan raw source.
const strip = (t) => t
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')     // JSX comments
  .replace(/\/\*[\s\S]*?\*\//g, ' ')           // block comments
  .replace(/^\s*\/\/.*$/gm, ' ');                // line comments

/** The full text of a JSX opening tag, brace-aware — `onClick={(e) => f(e)}` contains a `>`, so a
 *  lazy regex to the first `>` stops inside the arrow function and never sees the attributes after
 *  it. That is why the mouse-only div check passed on a mouse-only div. */
function openingTags(src, name) {
  const out = [];
  const re = new RegExp(`<${name}\\b`, 'g');
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length, depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
      i++;
    }
    out.push(src.slice(m.index, i));
  }
  return out;
}

test('every tablist carries the whole pattern', () => {
  let seen = 0;
  for (const f of FILES) {
    const src = strip(fs.readFileSync(path.join(here, f), 'utf8'));
    if (!/role="tablist"/.test(src)) continue;
    seen++;
    for (const need of ['role="tab"', 'aria-selected', 'aria-controls', 'role="tabpanel"',
                        'tabIndex=', 'ArrowRight']) {
      assert.ok(src.includes(need),
        `${f} declares a tablist without ${need} — the pattern is announced and not delivered`);
    }
  }
  assert.ok(seen >= 1, 'found no tablist at all — the scanner has gone blind');
});

test('no div is a control by onClick alone', () => {
  const bad = [];
  let checked = 0;
  for (const f of FILES) {
    const src = strip(fs.readFileSync(path.join(here, f), 'utf8'));
    for (const tag of openingTags(src, 'div')) {
      checked++;
      if (!/onClick=/.test(tag)) continue;
      // ⚠ THIS ONCE ACCEPTED onKeyDown ON ITS OWN, which passes a div that no keyboard can reach:
      // without a tabIndex nothing can focus it, so the handler never fires. A control needs BOTH a
      // way in (tabIndex) and something to do when you get there (a key handler or a role that
      // implies one). Verified by planting a div with onClick + onKeyDown and no tabIndex.
      const reachable = /tabIndex/.test(tag);
      const operable = /onKeyDown|role:\s*'button'|role="button"/.test(tag);
      if (reachable && operable) continue;
      bad.push(`${f}: a div is a control by onClick alone`
        + (operable ? ' (has a key handler but no tabIndex, so nothing can focus it)' : ''));
    }
  }
  assert.ok(checked > 100, `only parsed ${checked} divs — the scanner has gone blind`);
  assert.deepEqual([...new Set(bad)], [], 'these are reachable only by mouse');
});

// ── a section whose only content is "nothing" ──────────────────────────────────────────────────
// Every item page can show a History. Three of them hid the section when the log was empty and five
// rendered a heading over the words "Nothing yet.", which is a section telling the reader something
// they could already see. The inconsistency is the tell: the same decision was made twice, both
// ways, by whoever wrote each page.
test('no item page renders a History section that is empty', () => {
  const dir = path.dirname(new URL(import.meta.url).pathname);
  const pages = fs.readdirSync(dir).filter((f) => /Page\.jsx$/.test(f));
  assert.ok(pages.length >= 6, `only ${pages.length} item pages found: this test is looking in the wrong place`);

  const bad = [];
  let withHistory = 0;
  for (const f of pages) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const at = src.indexOf('<ChangeLog');
    if (at < 0) continue;
    withHistory += 1;
    // the guard has to be within sight of the render, on the entries it is about
    const before = src.slice(Math.max(0, at - 400), at);
    if (!/(entries\.length > 0|\.some\(\(e\) =>)/.test(before)) bad.push(f);
  }
  assert.ok(withHistory >= 5,
    `only ${withHistory} pages render a ChangeLog: the scan has stopped finding them`);
  assert.deepEqual(bad, [],
    'these render a History heading even when there is no history, so the section says only "Nothing yet."');
});

// ── a ratio of nothing is not a statistic ──────────────────────────────────────────────────────
// A record exists for every client from first contact, so an empty tab is the ordinary first
// impression, not an edge case. Those strips opened with "Walked end to end 0 of 0", "Mapped inside
// 0 of 0", "Tied to a team 0 of 0": three measurements of a set with no members, sitting beside the
// count that had already said so. "0 of 2" is kept, because that one is a fact somebody can act on.
test('TabHead drops a stat that is a ratio of an empty set', () => {
  const dir = path.dirname(new URL(import.meta.url).pathname);
  const src = fs.readFileSync(path.join(dir, 'TabHead.jsx'), 'utf8');
  assert.match(src, /stats\.filter\(/,
    'TabHead renders every stat it is given, so an empty record shows "0 of 0" ratios');
  assert.match(src, /'0 of 0'/,
    'the filter no longer names the case it exists for');
  // and it must render the FILTERED list, not the original
  assert.ok(!/\{stats\.map\(/.test(src),
    'TabHead filters the stats and then maps the unfiltered ones, so the filter does nothing');
});

// ── and the same measurement written as a bare number ──────────────────────────────────────────
// Filtering "0 of 0" left the tabs that phrase a derived measure as a plain count: the Pillars tab
// opened a new engagement with "Questions 0, To investigate 0, To validate 0, Pillars with
// questions 0 of 8, Ratings to revisit 0", four more measurements of a set with no members beside
// the count that already said so.
//
// ⚠ IT MUST NOT KEY ON THE VALUE BEING ZERO, and this is the whole subtlety. On the Sessions tab
// "Nobody set to answer: 0" counts QUESTIONS, not sessions: a record with twenty questions and no
// sessions would show twenty, and that is the loudest thing on the page. A zero-hiding rule would
// have buried it. So the caller marks which of its stats are derived from its own set, and the set
// is empty when every stat that is NOT derived reads zero.
test('TabHead drops a derived stat only when its own set is empty', () => {
  const dir = path.dirname(new URL(import.meta.url).pathname);
  const src = fs.readFileSync(path.join(dir, 'TabHead.jsx'), 'utf8');
  assert.match(src, /x\.derived/,
    'TabHead no longer reads the `derived` marker, so a measurement of nothing is shown as a bare 0');
  assert.match(src, /every\(/,
    'the empty test no longer requires EVERY non-derived count to be zero, so one empty set among '
    + 'several would hide stats that still have something to measure');

  // The marker has to be USED, or the rule is a no-op dressed as a guard.
  const portal = fs.readFileSync(path.join(dir, 'DeepDivePortal.jsx'), 'utf8');
  const marked = [...portal.matchAll(/derived:\s*true/g)].length;
  assert.ok(marked >= 4,
    `only ${marked} stats are marked derived: the Pillars strip alone has four, so the rule is not wired up`);

  // ⚠ And the ones that are NOT derived must stay unmarked. These two count questions rather than
  // the tab's own set, and marking them would hide a real gap on a record with no sessions.
  for (const stat of ['Nobody set to answer', 'Answered without a diary']) {
    const at = portal.indexOf(stat);
    assert.ok(at > 0, `the "${stat}" stat is gone: this test can no longer check it`);
    const line = portal.slice(at, portal.indexOf('\n', at));
    assert.ok(!/derived:\s*true/.test(line),
      `"${stat}" is marked derived, but it counts questions rather than sessions: on a record with `
      + 'questions and no sessions that is the gap the tab exists to show');
  }
});

// ── and the same measurement again, as a percentage ────────────────────────────────────────────
// The pillar strip rendered `{prog.pct}%` for every pillar, so a new engagement opened this tab on
// eight boxes reading "0%", and on a live record a pillar nobody had asked anything about claimed
// no progress rather than nothing asked. A percentage of an empty set is not 0%, it is undefined.
// The certainty chips in the same header were already conditional on having something to count.
test('a pillar shows a percentage only when it has questions to measure', () => {
  const dir = path.dirname(new URL(import.meta.url).pathname);
  const portal = fs.readFileSync(path.join(dir, 'DeepDivePortal.jsx'), 'utf8');
  const at = portal.indexOf('dd-pillar-pct');
  assert.ok(at > 0, 'the pillar percentage is gone: this test can no longer find it');

  // The guard has to be on the SAME expression, not merely somewhere in the file.
  const line = portal.slice(portal.lastIndexOf('\n', at) + 1, portal.indexOf('\n', at));
  assert.match(line, /qs\.length\s*>\s*0\s*&&/,
    'the pillar percentage renders unconditionally again, so a pillar with no questions reports 0%');

  // ⚠ The floor: the chips beside it are the precedent this follows, so if they stop being
  // conditional the rule above needs rethinking rather than quietly diverging.
  assert.match(portal, /n > 0 \? <Chip/,
    'the certainty chips no longer hide themselves when there is nothing to count, so the pillar '
    + 'header now has two different rules for the same question');
});

// ── a tab must not open on a view it knows is empty ────────────────────────────────────────────
// The Enquiry tab picks which band to open on: proposed, then outstanding, then established. The
// last arm was unconditional, so a record with 24 questions, none proposed and none outstanding,
// opened on a blank Established list with the 24 one click away and nothing on screen saying so.
// The high-volume harness screen had been rendering that blank view for as long as it existed, so
// no sweep had ever laid out a dense question list either.
test('the enquiry band falls back only to a band that has something in it', () => {
  const dir = path.dirname(new URL(import.meta.url).pathname);
  const portal = fs.readFileSync(path.join(dir, 'DeepDivePortal.jsx'), 'utf8');
  const at = portal.indexOf('const shown = band');
  assert.ok(at > 0, 'the band chooser is gone: this test can no longer find it');
  const expr = portal.slice(at, portal.indexOf(';', at));

  // Every band named as a choice has to be guarded by its own count, or it can be chosen empty.
  for (const b of ['proposed', 'outstanding', 'established']) {
    const chooses = new RegExp(`counts\\.${b}\\s*\\?\\s*'${b}'`);
    assert.match(expr, chooses,
      `the "${b}" band is chosen without checking counts.${b}, so the tab can open on an empty view`);
  }
  // ⚠ And there has to be a last resort that is not another guess: questions are the raw material
  // every other band is made from, so a record with questions has something to show.
  assert.match(expr, /counts\.questions\s*\?\s*'questions'/,
    'nothing falls back to the questions band, so a record whose only content is questions opens blank');
});

// ── and the hypothesis register, which had the same fault ──────────────────────────────────────
// It defaulted to the "open" verdict whether or not any were open. Opening on the untested claims
// is right while there are any, but a deep dive ENDS with them resolved: a register holding six
// confirmed and none open opened on "Nothing here", with everything it has behind a filter chip.
test('the hypothesis register does not default to a verdict nothing has', () => {
  const dir = path.dirname(new URL(import.meta.url).pathname);
  const portal = fs.readFileSync(path.join(dir, 'DeepDivePortal.jsx'), 'utf8');
  const at = portal.indexOf('function Hypotheses(');
  assert.ok(at > 0, 'the Hypotheses register is gone: this test can no longer find it');
  const body = portal.slice(at, at + 2000);

  assert.ok(!/useState\('open'\)/.test(body),
    'the register hard-codes "open" as its default again, so a record whose hypotheses are all '
    + 'resolved opens on an empty list');
  assert.match(body, /counts\.open\s*\?\s*'open'\s*:\s*'all'/,
    'nothing falls back to showing all verdicts when none are open');

  // ⚠ AND THE CHIPS MUST REFLECT THE RESOLVED CHOICE. With the raw state still null, comparing the
  // chips against it leaves every chip unpressed while the list is filtered: the screen then says
  // no filter is on while one is. This was caught in the browser, not by reading.
  const chips = body.slice(body.indexOf('dd-filters'));
  assert.ok(!/aria-pressed=\{only === k\}/.test(chips),
    'the verdict chips compare against the raw state, so none is marked pressed until somebody clicks');
  assert.match(chips, /aria-pressed=\{pick === k\}/,
    'the verdict chips no longer mark the resolved choice as pressed');
});
