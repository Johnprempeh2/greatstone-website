// The drawer is the only editor for schema fields, and it holds ONE form state object shared by
// every kind. A field a kind owns that has no key in that object is dropped on ADD: the caller
// seeds it, `ownFields` asks for it, the form does not have it, and `strList(undefined)` quietly
// yields [].
//
// That is not hypothetical. `process.offerings` was missing, so "Walk this offering" — the one
// action whose entire purpose is to put a process on an offering's board — created a process
// belonging to no offering, with no error and nothing on screen to notice.
//
// On EDIT the same gap is harmless, because ownFields merges over the stored item. So this only
// ever breaks the create path, which is the half nobody re-reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { readFileSync } from 'node:fs';
import path from 'node:path';
import { FIELDS, KINDS, buildItem, ID_PREFIX } from '../data/deepdive-schema.mjs';

const src = readFileSync(new URL('./RecordDrawer.jsx', import.meta.url), 'utf8');

// The initial form state: the object literal in the useState that is not the North Star or details
// branch. Bounded by markers rather than by brace counting, which JSX defeats.
const START = 'num: seed.num ||';
const END = '});';
const from = src.indexOf(START);
assert.ok(from > 0, 'could not find the drawer form state — this test needs re-pointing');
const block = src.slice(from, src.indexOf(END, from));

// keys are `word:` at a token boundary inside that literal
const keys = new Set([...block.matchAll(/(?:^|[\s{,])([A-Za-z_$][\w$]*)\s*:/gm)].map((m) => m[1]));

test('the drawer form state has a key for every field every kind owns', () => {
  const missing = [];
  for (const kind of KINDS) {
    for (const field of FIELDS[kind]) {
      // x and y are geometry written by dragging the canvas, never typed into the drawer, and
      // ownFields keeps them on edit. They are the one deliberate exception.
      if (kind === 'process' && (field === 'x' || field === 'y')) continue;
      if (!keys.has(field)) missing.push(`${kind}.${field}`);
    }
  }
  assert.deepEqual(missing, [],
    `these fields are owned by a kind but have no key in the drawer's form state, so a seeded value `
    + `is dropped on add: ${missing.join(', ')}`);
});

// ⚠ THE ADD PATH DIES SILENTLY WHEN A KIND'S DEFAULT `state` IS THE WRONG VOCABULARY.
// `state` is shared by three kinds with three different vocabularies, and the drawer seeds it from
// KIND_STATE. A kind missing from that table gets another kind's default: the select renders BLANK
// because nothing matches, and the first save throws `state must be one of…`. The item cannot be
// created at all unless the user happens to touch a dropdown that looks untouched.
// It has now happened to `offering` and to `build`. The comment above KIND_STATE describes it; a
// comment is not a check.
const kindState = (() => {
  const m = src.match(/const KIND_STATE = \{([^}]*)\}/);
  assert.ok(m, 'KIND_STATE is gone — this test needs re-pointing');
  return Object.fromEntries([...m[1].matchAll(/(\w+):\s*'([^']+)'/g)].map((x) => [x[1], x[2]]));
})();

test("every kind's seeded state is one its own schema accepts", () => {
  // The minimum a kind needs to be built at all, so the only thing under test is `state`.
  const MIN = {
    process: { name: 'N', howToday: 'H' }, question: { pillar: 'Data', q: 'Q?' },
    evidence: { item: 'I' }, session: { person: 'P' }, source: { name: 'N', sourceType: 'person' },
    kpi: { name: 'N' }, hypothesis: { claim: 'C' }, competitor: { name: 'N' },
    offering: { name: 'N' }, unit: { name: 'N' }, person: { name: 'N' },
    task: { what: 'W' }, build: { name: 'N' },
    opportunity: { name: 'N', desiredOutcome: 'D' }, complexity: { buildId: 'b:aaa' },
  };
  const bad = [];
  for (const kind of KINDS) {
    if (!FIELDS[kind].includes('state')) continue;      // only kinds that carry one
    assert.ok(MIN[kind], `no minimal fields for "${kind}" — add one when adding a kind`);
    // exactly what the drawer seeds: `seed.state || KIND_STATE[kind] || 'missing'`
    const seeded = kindState[kind] || 'missing';
    try { buildItem(kind, { ...MIN[kind], state: seeded }, `${ID_PREFIX[kind]}:aaaaaaa1`); }
    catch (e) { bad.push(`${kind} seeds state="${seeded}" — ${e.message}`); }
  }
  assert.deepEqual(bad, [],
    'the drawer would seed a state this kind refuses, so its Add path throws on the first save');
});

// ⚠ A KEY IN THE FORM STATE IS NOT A CONTROL.
// The test above checks a field has somewhere to live, so a seeded value is not dropped. It says
// nothing about whether a practitioner can SET it. Three fields sat in the form state with no input
// anywhere — `question.subset`, `question.from` and `session.notHere` — so they could only ever be
// written by an MCP session, and `notHere` is the one thing the plan uses to stop the same question
// being put to four people.
const NO_CONTROL = {
  'process.steps': 'its own editor on the process page, not the drawer',
  'process.x': 'set by dragging the card on the canvas',
  'process.y': 'set by dragging the card on the canvas',
  'question.mergedFrom': 'provenance of a merge, written by the merge itself',
  'session.output': 'edited in place on the session page, where it is read',
};

// ⚠ THE FIRST VERSION WAS KIND-BLIND AND REPORTED ZERO WHILE TWO DOCUMENTED BUGS WERE LIVE.
// `bound` was a flat set of field NAMES, so `ref` having a control on the hypothesis, build, unit
// and offering branches made `question.ref` and `session.ref` look bound. Neither has one — and
// deepdive-schema.mjs names those exact two as the fields whose loss motivated `ownFields`:
// "it took `ref` (Q34, S3)". The drawer is one big switch, so each kind's branch is its own scope.
function branchFor(kind) {
  const at = src.indexOf(`kind === '${kind}' && (`);
  if (at < 0) return '';
  const next = src.indexOf("kind === '", at + 20);
  return src.slice(at, next < 0 ? src.length : next);
}

test('every field a kind owns has a control somewhere', () => {
  // fields edited in place on a page rather than in the drawer
  const here2 = path.dirname(new URL(import.meta.url).pathname);
  const pages = fs.readdirSync(here2).filter((f) => f.endsWith('Page.jsx'))
    .map((f) => fs.readFileSync(path.join(here2, f), 'utf8')).join('\n');
  const inPlace = new Set([...pages.matchAll(/onSaveField\([^,]+,\s*\{\s*([A-Za-z]+):/g)].map((m) => m[1]));

  let checked = 0;
  const gaps = [];
  for (const kind of KINDS) {
    const branch = branchFor(kind);
    assert.ok(branch.length > 40, `no drawer branch found for "${kind}" — this test needs re-pointing`);
    const bound = new Set(inPlace);
    for (const m of branch.matchAll(/value=\{f\.([A-Za-z]+)/g)) bound.add(m[1]);
    for (const m of branch.matchAll(/\bon\('([A-Za-z]+)'\)/g)) bound.add(m[1]);
    for (const m of branch.matchAll(/\bset\('([A-Za-z]+)'\)/g)) bound.add(m[1]);
    for (const m of branch.matchAll(/togglePillar\('([A-Za-z]+)'\)/g)) bound.add(m[1]);
    // ⚠ A CHECKBOX IS A CONTROL AND THIS DID NOT SEE ONE. It looked only for \, so a
    // boolean bound with \ read as an unbound field. The test was narrow, not the form wrong.
    for (const m of branch.matchAll(/checked=\{!!f\.([A-Za-z]+)/g)) bound.add(m[1]);
    // the pickers take the field as a named prop rather than a bound value
    for (const m of branch.matchAll(/value=\{f\.([A-Za-z]+)\s*\|\|/g)) bound.add(m[1]);
    for (const field of FIELDS[kind]) {
      if (NO_CONTROL[`${kind}.${field}`]) continue;
      checked++;
      if (!bound.has(field)) gaps.push(`${kind}.${field}`);
    }
  }
  assert.ok(checked > 80, `only checked ${checked} fields — the scanner has gone blind`);
  assert.deepEqual(gaps, [],
    'these can be stored but a practitioner cannot set them — add a control, or list them in '
    + 'NO_CONTROL with where they are actually set');
});

// ── a picker that cannot show the current kind is not a picker ─────────────────────────────────
// Two kinds are deliberately absent from KIND_GROUPS because neither is ever started from the
// generic Add flow: a complexity is assessed against an initiative, an opportunity is raised from
// one. The drawer rendered the picker anyway, so opening "Add complexity" showed thirteen buttons
// with NONE of them selected, above a form for a fourteenth thing. A control that cannot represent
// the state it is in, offering only ways to leave it.
test('the kind picker is only shown for kinds it can actually offer', () => {
  const dir = path.dirname(new URL(import.meta.url).pathname);
  const src = fs.readFileSync(path.join(dir, 'RecordDrawer.jsx'), 'utf8');

  const groups = src.slice(src.indexOf('const KIND_GROUPS'), src.indexOf('const PICKABLE'));
  const offered = [...groups.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  assert.ok(offered.length >= 10,
    `only ${offered.length} kinds read out of KIND_GROUPS: this test can no longer see the picker`);

  // Every kind the schema knows, minus the ones the picker offers, must be the ones it hides.
  const hidden = KINDS.filter((k) => !offered.includes(k));
  assert.ok(hidden.length >= 1,
    'every kind is offered, so there is nothing for the guard to protect and this test is stale');

  assert.match(src, /\{isNew && PICKABLE\.has\(kind\) && \(/,
    'the picker renders without checking whether it can show the current kind, so a drawer for '
    + `${hidden.join(' or ')} shows a picker with nothing selected`);
  // and the sentence that says what is being added must NOT be behind the same guard
  const blurbAt = src.indexOf('rd-kindsay');
  const guardAt = src.indexOf('PICKABLE.has(kind)');
  assert.ok(blurbAt > guardAt,
    'the blurb explaining the kind must stay outside the picker guard: hiding the picker must not '
    + 'also remove the only sentence saying what this drawer is for');
});

// ── a group and its own field must not share a name ────────────────────────────────────────────
// Four groups in the record drawer were titled exactly what one of their own fields was labelled:
// "What we still have to find out" over six fields, the second of which was also "What we still
// have to find out"; "What has been said about it"; "How it gets answered"; "What becomes of it".
// On screen the heading and the label then read as the same question asked twice, and nothing says
// which one the box under the cursor is for. Found by scanning all 28 drawers, not by eye: the
// first two were spotted by reading and the scan turned up two more.
//
// The rule applied when fixing them: the FIELD keeps the name the record page uses for it, and the
// GROUP takes the name of the set. That way a practitioner meets the same word for the same thing
// whether they are on the page or in the form.
test('no drawer group is titled the same as a field inside it', () => {
  // ⚠ Uses the module-level `src` this file already reads, rather than re-deriving a path: an
  // earlier version referenced a `here` that does not exist here and failed for that reason, which
  // is a red test proving nothing.
  // Comments carry these phrases while explaining the rule, so they go first.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const groups = [...code.matchAll(/<Grp\s+title="([^"]+)"/g)];
  // ⚠ The floor: if <Grp> is renamed or the props change shape, an empty list passes everything.
  assert.ok(groups.length >= 20,
    `only ${groups.length} drawer groups found: the scan has gone blind, so "no collisions" means nothing`);

  const bad = [];
  for (let i = 0; i < groups.length; i += 1) {
    const title = groups[i][1];
    const from = groups[i].index;
    const to = i + 1 < groups.length ? groups[i + 1].index : code.length;
    const block = code.slice(from, to);
    // Both shapes the drawer uses for a field: <Lines label="..."> and a bare <label>Text
    const labels = [
      ...[...block.matchAll(/label="([^"]+)"/g)].map((m) => m[1]),
      ...[...block.matchAll(/<label>\s*([^<{]+)/g)].map((m) => m[1].trim()),
    ].filter(Boolean);
    for (const l of labels) {
      if (l.toLowerCase() === title.toLowerCase()) bad.push(`"${title}" is both the group and a field in it`);
    }
  }
  assert.deepEqual(bad, [],
    'these drawer groups are titled exactly what one of their own fields is labelled, so the form '
    + 'asks the same question twice and answers neither');
});
