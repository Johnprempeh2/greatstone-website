// John's style rule, enforced rather than remembered.
//
// NEVER an em or en dash in anything a reader sees: commas, colons, periods and parentheses instead,
// and "to" for a range. It is a standing rule on every Greatstone deliverable, and the portal is a
// deliverable. It had drifted into fifteen places in the drawer alone, including every "one per
// line" hint on the form somebody fills in most often.
//
// ⚠ COMMENTS ARE STRIPPED FIRST. Two earlier tests in this suite passed on their own bug because a
// comment naming the thing being checked satisfied the scan. Here the risk runs the other way: a
// comment is not something a reader sees, so counting one would drown the real hits and the list
// would stop being read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/* ⚠ THIS USED TO BE A HAND-KEPT LIST OF TWELVE, AND THE PORTAL RENDERS THIRTY EIGHT. A gate that
   names its own scope drifts the moment somebody adds a component, and this one had: ChangeLog.jsx
   printed an em dash for a timestamp nobody could read, in the History tab, and the scan reported a
   clean portal for months because it never opened the file. So the scope is DERIVED: walk the
   imports out from DeepDivePortal.jsx and scan whatever the portal actually pulls in. */
const walk = (entry) => {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    const abs = path.join(here, f);
    if (!fs.existsSync(abs)) continue;
    seen.add(f);
    const src = fs.readFileSync(abs, 'utf8');
    // static `from './X'` and lazy `import('./X')` alike
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.\/[^'"]+)['"]/g)) {
      let p = m[1].slice(2);
      if (!/\.(jsx|mjs|js)$/.test(p)) {
        if (fs.existsSync(path.join(here, `${p}.jsx`))) p += '.jsx';
        else if (fs.existsSync(path.join(here, `${p}.mjs`))) p += '.mjs';
        else continue;
      }
      stack.push(p);
    }
  }
  return [...seen].filter((f) => f.endsWith('.jsx')).sort();
};

/* The account area is reachable from the portal's own chrome but its copy is not the deep dive's,
   and it is worked on from other sessions. Both files hold reader-visible dashes today. They are
   NAMED here rather than quietly missing, so the exception is something John can see and rule on,
   which is the opposite of the blind spot above. */
const NOT_OURS = new Set(['AccountDashboard.jsx', 'LicenceKeys.jsx']);
const FILES = walk('DeepDivePortal.jsx').filter((f) => !NOT_OURS.has(f));
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('no em or en dash reaches a reader of the Deep Dive Portal', () => {
  const bad = [];
  let scanned = 0;
  for (const f of FILES) {
    const raw = fs.readFileSync(path.join(here, f), 'utf8');
    scanned += raw.length;
    strip(raw).split('\n').forEach((line, i) => {
      if (/[—–]/.test(line)) bad.push(`${f}:${i + 1}  ${line.trim().slice(0, 90)}`);
    });
  }
  // ⚠ A scanner reading nothing reports nothing wrong. Every file has to have been opened and be
  // substantial, or a rename turns this green by accident.
  assert.equal(scanned > 200000, true, `only read ${scanned} characters, the file list has gone stale`);
  // ⚠ And the derived scope has to have actually resolved. A walk that breaks returns the entry
  // file alone, which still reads 200k characters and still reports a clean portal.
  assert.ok(FILES.length >= 30,
    `the import walk resolved only ${FILES.length} portal components, so most of the portal is unscanned again`);
  for (const f of ['RecordDrawer.jsx', 'QuestionPage.jsx', 'ChangeLog.jsx', 'OpportunityRail.jsx']) {
    assert.ok(FILES.includes(f), `${f} is rendered by the portal but the walk did not reach it`);
  }
  assert.deepEqual(bad, [], 'em and en dashes are not used in Greatstone deliverables');
});

test('the scan can actually see a dash', () => {
  // The plant, inline: a scanner proven only by its own silence is not proven at all.
  const line = '        <p>one per line — what they told us</p>';
  assert.equal(/[—–]/.test(strip(line)), true, 'the scan misses an em dash in JSX text');
  assert.equal(/[—–]/.test(strip('  // a comment with — in it')), false, 'the scan counts comments');
  assert.equal(/[—–]/.test(strip('/* a block\n   with — in it */')), false, 'the scan counts block comments');
});

// ── one list, one name ─────────────────────────────────────────────────────────────────────────
// The proposed builds are rendered in two places (the Processes tab and the Innovation board) and
// reached from two more (the drawer's group label, the build page's crumb). Three of the four said
// "What we proposed" and the fourth said "What the GITA proposed", so opening a build from the
// Processes tab renamed the thing you were looking at mid click. A reader cannot tell a rename from
// a different feature, which is the whole cost of it.
test('the proposed builds are called the same thing everywhere a reader meets them', () => {
  const NAME = 'What we proposed';
  const WHERE = ['DeepDivePortal.jsx', 'InnovationBoard.jsx', 'RecordDrawer.jsx', 'BuildPage.jsx'];
  const seen = [];
  for (const f of WHERE) {
    const text = strip(fs.readFileSync(path.join(here, f), 'utf8'));
    // ⚠ Comments are stripped first: an earlier test in this suite passed on its own bug because a
    // comment naming the checked string satisfied the scan, and the comment above says this name.
    assert.ok(text.includes(NAME), `${f} no longer calls the proposed builds "${NAME}"`);
    for (const m of text.matchAll(/(?:What|Nothing from)[^<>{}'"]*?proposed[^<>{}'"]*/g)) seen.push(`${f}: ${m[0].trim()}`);
  }
  const strays = seen.filter((s) => /\bGITA proposed\b/.test(s));
  assert.deepEqual(strays, [],
    'the proposed builds are given a second name in these places, so one list reads as two features');
});

test('the name scan can actually see a second name', () => {
  // The plant, inline: proven by its own silence is not proven.
  const line = '<h2><Labelled icon="link">What the GITA proposed</Labelled></h2>';
  assert.equal(/\bGITA proposed\b/.test(strip(line)), true, 'the scan misses a second name in JSX text');
  assert.equal(/\bGITA proposed\b/.test(strip('  // What the GITA proposed, historically')), false,
    'the scan counts comments, which is how it would fail on the note explaining the rule');
});

// ── a level is not a link to a team ────────────────────────────────────────────────────────────
// KPI scopes are org chart LEVELS (company, division, department, team, individual), so grouping by
// scope headed a group "TEAM" while the stat bar directly above it read "Tied to a team", which is
// about the unit that owns the number and read 0 of 1 on the very same screen. Two meanings of the
// word on one page. The portal's own empty state already says "Company numbers and a team's own
// numbers", so the heading says numbers too.
test('the KPI scope heading names what it is counting', () => {
  const src = strip(fs.readFileSync(path.join(here, 'DeepDivePortal.jsx'), 'utf8'));
  const m = src.match(/<h2 className="dd-pgroup-h">\{g\.scope\}([^<]*)</);
  assert.ok(m, 'the KPI scope grouping heading is gone or rewritten: this test can no longer find it');
  assert.equal(m[1].trim(), 'numbers',
    'the scope heading prints the bare level again, which collides with the "Tied to a team" stat beside it');
  // ⚠ The floor: the collision only matters while that stat is on the same screen.
  assert.ok(src.includes("'Tied to a team'"),
    'the "Tied to a team" stat is gone, so the reason for this rule needs rechecking rather than assuming');
});
