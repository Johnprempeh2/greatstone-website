// The rules that both writers share, tested where they are written.
//
// The one that matters most is fieldsAreComplete. A field that buildItem reads but FIELDS does not
// declare gets stripped by ownFields and then blanked by the edit merge, silently, on the first
// edit. It is a data-loss bug with no error message, so it needs a test that fails loudly the
// moment a field is added to buildItem and not to FIELDS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { KINDS, FIELDS, ownFields, buildItem, applyOp, stepList, link, safeLink,
  cadenceOf, provenanceKindOf, UNIT_TYPES, normalisePlan, findItem, allIds as allIdsOf,
  ID_PREFIX, identityParts, ID_FIELDS, SECTIONS, FIELDS as FIELDS_BY_KIND,
  questionCoverage } from './deepdive-schema.mjs';

// One probe per kind, with every declared field carrying a recognisable value.
const PROBE = {
  process: { num: '07', group: 'G', name: 'N', howToday: 'H', whoRuns: 'W', pains: 'a', opens: 'b', speakTo: 'c', pillars: ['Data'], offerings: [], unitId: null, feeds: [], steps: 's :: who :: tool', x: 120, y: 80 },
  question: { pillar: 'Data', q: 'Q?', certainty: 'unknown', note: '', from: null, ref: 'Q1', subset: 'S', route: 'session', why: 'Y', mergedFrom: [] },
  evidence: { item: 'I', note: 'N', state: 'held', vstate: 'reviewed', held: 'h', missing: 'm', whyItMatters: 'w', impactIfUnresolved: 'i', provenance: 'p', provenanceKind: 'told', link: 'https://example.org/doc', processes: [] },
  session: { person: 'P', only: 'O', pillars: ['Data'], objectives: 'o', covers: [], ref: 'S3', role: 'R', notHere: 'n', output: 'out', minutes: 30, materials: 'm', context: 'c', opening: 'op', unitId: null, personId: null, record: 'https://example.org/notes', recordNote: 'rn' },
  source: { name: 'N', sourceType: 'person', gives: 'g', access: 'a', owner: 'o', link: 'https://example.org/s', located: 'l', pillars: ['Data'] },
  kpi: { name: 'N', scope: 'team', owner: 'o', unitId: null, unit: '%', current: 1, target: 2, direction: 'up', cadence: 'weekly', cadenceNote: '', definition: 'd', measuredBy: 'mb', pillars: ['Data'], affectedBy: [] },
  hypothesis: { ref: 'H1', claim: 'C', group: 'G', grounds: 'g', confirms: 'cf', kills: 'k', test: 't', ifWrong: 'w', verdict: 'open', pillars: ['Data'], bearsOn: [] },
  competitor: { name: 'N', evidence: 'e', overlaps: 'o', source: 's' },
  offering: { ref: '01', name: 'N', alias: 'a', state: 'live', what: 'w', who: 'wh', note: 'n', processes: [] },
  unit: { ref: 'OPS', name: 'Operations', unitType: 'team', parent: null, lead: 'A supervisor', leadId: null, headcount: 12, does: 'd', note: 'n' },
  person: { name: 'A field supervisor', role: 'Supervisor', side: 'client', unitId: null, reportsTo: null, worksWith: [], email: 'a@example.org', accountEmail: 'a@example.org', note: 'n' },
  task: { what: 'Re-types responses by hand', personId: null, processes: [], pillars: ['Data'], cadence: 'daily', cadenceNote: '', hours: 6, fate: 'automated', why: 'w', note: 'n' },
  build: { ref: 'B1', name: 'A reconciliation view', state: 'proposed', what: 'w', forWhom: 'fw', processes: [], replaces: 'r', needs: 'n1', unknowns: 'u1', opens: 'o1', pillars: ['Data'], kpis: [], note: 'n', opportunityId: null },
  opportunity: { ref: 'Y1', name: 'Onboarding redesign', statement: 'st', rootCause: 'rc', desiredOutcome: 'do', fromFindings: [], pillars: ['Data'], potentialValue: 'pv', baselineRequired: true, kpis: [], state: 'draft', note: 'n' },
  complexity: { buildId: 'b:aaa', dimensions: [{ dimension: 'data', level: 'significant', driver: 'dr', implication: 'im' }], interactions: 'i1', preconditions: 'pc', risks: 'rk', uncertainty: 'un', state: 'initial', note: 'n' },
};

test('FIELDS declares every field buildItem reads', () => {
  for (const kind of KINDS) {
    assert.ok(PROBE[kind], `no probe for kind "${kind}" — add one when adding a kind`);
    const full = buildItem(kind, PROBE[kind], 'x:1');
    const narrowed = buildItem(kind, ownFields(kind, PROBE[kind]), 'x:1');
    assert.deepEqual(narrowed, full, `${kind}: narrowing to FIELDS changed the item, so a field is missing from FIELDS`);
  }
});

test('FIELDS declares nothing buildItem does not store', () => {
  for (const kind of KINDS) {
    const built = buildItem(kind, PROBE[kind], 'x:1');
    const stored = Object.keys(built).filter((k) => k !== 'id');
    for (const k of stored) {
      assert.ok(FIELDS[kind].includes(k), `${kind}.${k} is stored but not declared in FIELDS`);
    }
  }
});

test('an edit that sends one field keeps the rest', () => {
  let plan = applyOp({}, { type: 'add', kind: 'process', fields: PROBE.process }, 'p:aaa');
  plan = applyOp(plan, { type: 'edit', id: 'p:aaa', fields: { whoRuns: 'Somebody else' } }, 'p:aaa');
  const p = plan.PROCESSES[0];
  assert.equal(p.whoRuns, 'Somebody else');
  assert.equal(p.howToday, 'H', 'the untouched fields must survive a partial edit');
  assert.equal(p.steps.length, 1, 'steps must survive an edit that did not mention them');
});

test('both sides of the offering link are checked', () => {
  let plan = applyOp({}, { type: 'add', kind: 'process', fields: { num: '01', name: 'A', howToday: 'x' } }, 'p:a');
  assert.throws(() => applyOp(plan, { type: 'add', kind: 'offering', fields: { ref: '01', name: 'O', processes: ['99'] } }, 'o:a'), /No process numbered 99/);
  plan = applyOp(plan, { type: 'add', kind: 'offering', fields: { ref: '01', name: 'O', processes: ['01'] } }, 'o:a');
  assert.throws(() => applyOp(plan, { type: 'add', kind: 'process', fields: { num: '02', name: 'B', howToday: 'x', offerings: ['99'] } }, 'p:b'), /No offering 99/);
});

test('steps carry who and what in, and refuse a process that is really several', () => {
  const s = stepList('One\nTwo :: a person\nThree :: a person :: a tool');
  assert.deepEqual(s.map((x) => x.n), [1, 2, 3]);
  assert.equal(s[2].who, 'a person');
  assert.equal(s[2].tool, 'a tool');
  assert.throws(() => stepList(Array.from({ length: 41 }, (_, i) => `step ${i}`)), /more than 40/);
});

test('a stored link cannot be a script', () => {
  // This record is written by an MCP as well as by a person, and a stored link is opened by a
  // practitioner's click, so the scheme is checked on the way in AND on the way out.
  assert.throws(() => link('javascript:alert(1)'), /http or https/);
  assert.throws(() => link('data:text/html,<script>'), /http or https/);
  assert.throws(() => link('file:///etc/passwd'), /http or https/);
  assert.throws(() => link('not a url at all'), /not a web address/);
  assert.equal(safeLink('javascript:alert(1)'), null, 'safeLink must refuse rather than throw');
  assert.equal(link('notion.so/abc'), 'https://notion.so/abc', 'a pasted bare host gets https');
  assert.equal(link('https://example.org/x?y=1'), 'https://example.org/x?y=1');
  assert.equal(link(''), '');
  // and a refused link must not be storable through the normal write path
  assert.throws(() => applyOp({}, { type: 'add', kind: 'source', fields: { name: 'S', link: 'javascript:x' } }, 'r:a'), /http or https/);
});

test('a vocabulary keeps what somebody actually typed', () => {
  // The whole risk of closing a field is that a practitioner's own words vanish. They do not.
  assert.deepEqual(cadenceOf('daily'), ['daily', '']);
  assert.deepEqual(cadenceOf('Every Day'), ['daily', ''], 'a recognised phrase maps, and leaves no note');
  assert.deepEqual(cadenceOf('biweekly'), ['fortnightly', '']);
  assert.deepEqual(cadenceOf('every third Tuesday'), ['other', 'every third Tuesday'],
    'an unrecognised cadence is kept verbatim beside "other", never discarded');
  assert.deepEqual(cadenceOf(''), ['', '']);
  // provenance has no "other", because "how we know it" with no answer is the thing worth refusing
  assert.deepEqual(provenanceKindOf('Observed'), ['seen', '']);
  assert.throws(() => provenanceKindOf('a hunch'), /is not one of/);
});

test('a KPI records the cadence AND the words behind it', () => {
  const plan = applyOp({}, { type: 'add', kind: 'kpi', fields: { name: 'Calls', cadence: 'every third Tuesday' } }, 'k:a');
  assert.equal(plan.KPIS[0].cadence, 'other');
  assert.equal(plan.KPIS[0].cadenceNote, 'every third Tuesday');
});

test('the organisation is a chart, not a list', () => {
  let plan = applyOp({}, { type: 'add', kind: 'unit', fields: { ref: 'A', name: 'Alpha', unitType: 'division' } }, 'u:a');
  plan = applyOp(plan, { type: 'add', kind: 'unit', fields: { ref: 'B', name: 'Beta', unitType: 'team', parent: 'u:a' } }, 'u:b');
  assert.equal(plan.UNITS[1].parent, 'u:a');
  assert.throws(() => applyOp(plan, { type: 'add', kind: 'unit', fields: { name: 'G', parent: 'u:zzz' } }, 'u:c'), /No unit/);
  assert.throws(() => applyOp(plan, { type: 'edit', id: 'u:a', fields: { parent: 'u:a' } }, 'u:a'), /under itself/);
  // the one that would hang every renderer that walks the tree
  assert.throws(() => applyOp(plan, { type: 'edit', id: 'u:a', fields: { parent: 'u:b' } }, 'u:a'), /loops back/);
  assert.ok(UNIT_TYPES.includes('team'));
});

test('a number can only be assigned to a team that exists', () => {
  let plan = applyOp({}, { type: 'add', kind: 'unit', fields: { ref: 'B', name: 'Beta', unitType: 'team' } }, 'u:b');
  assert.throws(() => applyOp(plan, { type: 'add', kind: 'kpi', fields: { name: 'X', unitId: 'u:zzz' } }, 'k:x'), /No unit/);
  plan = applyOp(plan, { type: 'add', kind: 'kpi', fields: { name: 'Calls', scope: 'team', unitId: 'u:b' } }, 'k:a');
  assert.equal(plan.KPIS[0].unitId, 'u:b');
});

test('the people chart is a chart, and a person exists without an account', () => {
  let plan = applyOp({}, { type: 'add', kind: 'person', fields: { name: 'A director' } }, 'n:d');
  // The normal case: somebody we will interview who will never log in.
  assert.equal(plan.PEOPLE[0].accountEmail, '', 'a person belongs to the record with no account');
  assert.equal(plan.PEOPLE[0].side, 'client');
  plan = applyOp(plan, { type: 'add', kind: 'person', fields: { name: 'A supervisor', reportsTo: 'n:d' } }, 'n:s');
  assert.equal(plan.PEOPLE[1].reportsTo, 'n:d');
  assert.throws(() => applyOp(plan, { type: 'add', kind: 'person', fields: { name: 'X', reportsTo: 'n:zzz' } }, 'n:x'), /No person/);
  assert.throws(() => applyOp(plan, { type: 'edit', id: 'n:d', fields: { reportsTo: 'n:d' } }, 'n:d'), /report to themselves/);
  // the one that would hang every renderer that walks the reporting line
  assert.throws(() => applyOp(plan, { type: 'edit', id: 'n:d', fields: { reportsTo: 'n:s' } }, 'n:d'), /loops back/);
});

test('a session and a unit can only point at a person who exists', () => {
  let plan = applyOp({}, { type: 'add', kind: 'person', fields: { name: 'A supervisor' } }, 'n:s');
  plan = applyOp(plan, { type: 'add', kind: 'unit', fields: { name: 'Data Collection' } }, 'u:dc');
  assert.throws(() => applyOp(plan, { type: 'add', kind: 'session', fields: { person: 'X', personId: 'n:zzz' } }, 's:x'), /No person/);
  assert.throws(() => applyOp(plan, { type: 'edit', id: 'u:dc', fields: { leadId: 'n:zzz' } }, 'u:dc'), /No person/);
  plan = applyOp(plan, { type: 'add', kind: 'session', fields: { person: 'A supervisor', personId: 'n:s' } }, 's:a');
  assert.equal(plan.SESSIONS[0].personId, 'n:s');
});

test('the North Star is theirs, and the target has to beat it', () => {
  const base = { engagement: { slug: 'x', client: 'C', title: 'T', stage: 'S', access: 'A' } };
  // A target with nothing to exceed is the failure the section exists to prevent.
  assert.throws(() => applyOp(base, { type: 'set_engagement', fields: { northStar: { target: 'Better' } } }, null),
    /has to exceed something/);
  const p = applyOp(base, { type: 'set_engagement', fields: { northStar: {
    words: 'All we need is technology to make this seamless.', saidBy: 'The CEO', clarity: 'partly clear' } } }, null);
  assert.equal(p.NORTH_STAR.words, 'All we need is technology to make this seamless.');
  assert.equal(p.NORTH_STAR.ambition, 'not yet tested', 'the honest default: nobody has had that conversation');
  // It is an object, not an array: normalisePlan coerces every SECTIONS entry to [] and would wipe it.
  assert.equal(normalisePlan(p).NORTH_STAR.words, p.NORTH_STAR.words);
});

test('a task carries what becomes of it, and only for somebody who exists', () => {
  let plan = applyOp({}, { type: 'add', kind: 'process', fields: { num: '01', name: 'Collection', howToday: 'x' } }, 'p:a');
  plan = applyOp(plan, { type: 'add', kind: 'person', fields: { name: 'An interviewer' } }, 'n:a');
  assert.throws(() => applyOp(plan, { type: 'add', kind: 'task', fields: { what: 'X', personId: 'n:zzz' } }, 't:x'), /No person/);
  assert.throws(() => applyOp(plan, { type: 'add', kind: 'task', fields: { what: 'X', personId: 'n:a', processes: ['99'] } }, 't:y'), /No process/);
  plan = applyOp(plan, { type: 'add', kind: 'task', fields: { what: 'Re-types by hand', personId: 'n:a', processes: ['01'], hours: 6, fate: 'automated' } }, 't:a');
  assert.equal(plan.TASKS[0].fate, 'automated');
  assert.equal(applyOp(plan, { type: 'add', kind: 'task', fields: { what: 'Runs the interview', personId: 'n:a' } }, 't:b').TASKS[1].fate,
    'not decided', 'the honest default: nobody has decided yet');
});

test('a diagram position is layout, and is bounded', () => {
  const at = (x, y) => buildItem('process', { name: 'N', howToday: 'H', x, y }, 'p:a');
  assert.deepEqual([at(120, 80).x, at(120, 80).y], [120, 80]);
  assert.equal(at(null, null).x, null, 'no position means place it automatically');
  assert.equal(at('', '').x, null);
  assert.equal(at(-500, 0).x, 0, 'a stray drag cannot push a card off the left');
  assert.equal(at(99999, 0).x, 8000, 'nor somewhere nobody can scroll to');
  assert.equal(at('not a number', 0).x, null);
  // Moving a box does NOT create a handoff: arrows still come only from `feeds`.
  assert.deepEqual(at(500, 500).feeds, []);
});

// ⚠ A KIND IS ROUTED IN FIVE SEPARATE PLACES: allIds, findItem, and the add / edit / remove arms of
// applyOp. Adding a kind and missing one of them does not error. It half-works: the item is built
// and validated, then quietly not stored, or stored and then invisible to every id lookup. That is
// how a new kind ships looking fine and losing data. This walks every kind through the whole cycle.
test('every kind can be added, found, edited and removed', () => {
  for (const kind of KINDS) {
    const seed = { engagement: { slug: 'x', client: 'C', title: 'T', stage: 'S', access: 'A' } };
    let plan = normalisePlan(seed);
    // a process for the kinds whose guards need one to point at
    plan = applyOp(plan, { type: 'add', kind: 'process', fields: { num: '01', name: 'Intake', howToday: 'H' } }, 'p:aaaaaaa1');
    if (kind === 'process') continue;

    const id = `${kind[0]}:aaaaaaa2`;
    const fields = { ...PROBE[kind] };
    // strip cross-references the bare plan cannot satisfy
    for (const k of ['covers', 'processes', 'kpis', 'offerings', 'affectedBy', 'bearsOn', 'mergedFrom', 'feeds', 'worksWith']) {
      if (k in fields) fields[k] = [];
    }
    for (const k of ['unitId', 'parent', 'reportsTo', 'personId', 'leadId', 'from']) {
      if (k in fields) fields[k] = null;
    }
    const added = applyOp(plan, { type: 'add', kind, fields }, id);
    assert.ok(allIdsOf(added).includes(id), `${kind}: added but not in allIds — a routing arm is missing`);
    assert.equal(findItem(added, id)?.kind, kind, `${kind}: added but findItem cannot see it`);

    const edited = applyOp(added, { type: 'edit', id, kind, fields: { note: 'changed' } }, id);
    assert.ok(findItem(edited, id), `${kind}: edit lost the item`);

    const removed = applyOp(edited, { type: 'remove', id });
    assert.equal(findItem(removed, id), null, `${kind}: remove did not take it out`);
  }
});

// ⚠ applyOp MUST NOT TOUCH THE PLAN IT WAS GIVEN.
// normalisePlan is a shallow copy and the `add` arms push into whatever array they find, so for
// eight kinds a discarded applyOp mutated the caller's plan — including the object React renders,
// because applyRecordOp runs applyOp locally as a fail-fast pre-check before the round trip.
// A failed add therefore left a phantom in the live plan, and the RETRY was refused with
// "That already exists in this record": an error that was false, and that nothing but a page reload
// could clear.
const MIN_FIELDS = {
  process: { name: 'N', howToday: 'H' }, question: { pillar: 'Data', q: 'Q?' },
  evidence: { item: 'I' }, session: { person: 'P' }, source: { name: 'N', sourceType: 'person' },
  kpi: { name: 'N' }, hypothesis: { claim: 'C', kills: 'K' }, competitor: { name: 'N' },
  offering: { name: 'N' }, unit: { name: 'N' }, person: { name: 'N' }, task: { what: 'W' },
  build: { name: 'N' }, opportunity: { name: 'N', desiredOutcome: 'D' },
  complexity: { buildId: 'b:aaa' },
};

test('applyOp never mutates the plan it is given', () => {
  
  const dirty = [];
  for (const kind of KINDS) {
    assert.ok(MIN_FIELDS[kind], `no minimal fields for "${kind}" — add one when adding a kind`);
    let plan = normalisePlan({ engagement: { slug: 'x', client: 'C', title: 'T', stage: 'S', access: 'A' } });
    plan = applyOp(plan, { type: 'add', kind, fields: MIN_FIELDS[kind] }, `${ID_PREFIX[kind]}:aaaaaaa1`);
    const before = JSON.stringify(plan);
    // the result is DISCARDED, exactly as a failed pre-check discards it
    applyOp(plan, { type: 'add', kind, fields: { ...MIN_FIELDS[kind], name: 'Second', item: 'Second',
      person: 'Second', claim: 'Second', what: 'Second', q: 'Second?' } }, `${ID_PREFIX[kind]}:bbbbbbb2`);
    if (JSON.stringify(plan) !== before) dirty.push(kind);
  }
  assert.deepEqual(dirty, [],
    'adding these mutated the caller’s plan, so a failed add poisons the retry');
});

// ⚠ A REFERENCE FIELD WITH NO GUARD IS A DANGLING POINTER WAITING TO HAPPEN.
// `unit.parent` and `person.reportsTo` have had existence, self and cycle checks since they were
// added. `question.from` — the same shape, a pointer from one item to another of its own kind — had
// NONE of the three, so a write from an MCP session could create a question that followed from
// itself, or a loop with no honest reading. The drawer refusing it is not the guard: a form is a
// courtesy to the typist.
test('a self-referencing chain is refused wherever one can be written', () => {
  const seed = () => normalisePlan({ engagement: { slug: 'x', client: 'C', title: 'T', stage: 'S', access: 'A' } });
  const cases = [
    { kind: 'question', a: { pillar: 'Data', q: 'First?' }, b: { pillar: 'Data', q: 'Second?' }, ref: 'from' },
    { kind: 'unit', a: { name: 'One' }, b: { name: 'Two' }, ref: 'parent' },
    { kind: 'person', a: { name: 'Ama' }, b: { name: 'Kofi' }, ref: 'reportsTo' },
  ];
  for (const { kind, a, b, ref } of cases) {
    const pre = ID_PREFIX[kind];
    let plan = applyOp(seed(), { type: 'add', kind, fields: a }, `${pre}:aaaaaaa1`);
    plan = applyOp(plan, { type: 'add', kind, fields: { ...b, [ref]: `${pre}:aaaaaaa1` } }, `${pre}:bbbbbbb2`);

    // ⚠ This assertion cannot distinguish the explicit self check from the cycle walk: a
    // self-reference IS a one-element loop, so deleting the self check leaves this green. Verified
    // by planting. The self check earns its place on the MESSAGE — "a question cannot have followed
    // from itself" says what to do; "that chain loops back round" makes you go and look.
    assert.throws(() => applyOp(plan, { type: 'edit', id: `${pre}:aaaaaaa1`, kind,
      fields: { [ref]: `${pre}:aaaaaaa1` } }, `${pre}:aaaaaaa1`),
      undefined, `${kind}.${ref} accepted pointing at itself`);

    assert.throws(() => applyOp(plan, { type: 'edit', id: `${pre}:aaaaaaa1`, kind,
      fields: { [ref]: `${pre}:bbbbbbb2` } }, `${pre}:aaaaaaa1`),
      undefined, `${kind}.${ref} accepted a loop back to itself`);

    assert.throws(() => applyOp(plan, { type: 'add', kind,
      fields: { ...b, [ref]: `${pre}:zzzzzzz9` } }, `${pre}:ccccccc3`),
      undefined, `${kind}.${ref} accepted an id that is not in the record`);
  }
});

// ── a follow-up link survives its parent being edited ────────────────────────────────────────
//
// ⚠ THE FIRST checkFollows BRICKED RECORDS. Ids are content hashes, so rewording a parent or moving
// it to another pillar mints a new id and orphaned every child; the guard then refused ANY edit to
// that child, including a typo fix in an unrelated field. A practitioner who re-pillared one
// question could not save the next one, and an MCP session got a refusal with no way past it.
// Both halves of the fix are exercised here, and both were proven by removing them.
test('a question that follows from another survives the parent being reworded', async () => {
  const crypto = await import('node:crypto');
  const mint = (kind, f) => `q:${crypto.createHash('sha256')
    .update(identityParts(kind, f).join(' ')).digest('hex').slice(0, 8)}`;
  let p = normalisePlan({ engagement: { slug: 'x', client: 'C', title: 'T', stage: 'S', access: 'A' } });
  const addQ = (f) => { const id = mint('question', f); p = applyOp(p, { type: 'add', kind: 'question', fields: f }, id); return id; };
  const a = addQ({ pillar: 'Data', q: 'What is churn?' });
  addQ({ pillar: 'Data', q: 'And by cohort?', from: a });

  // the ops layer mints from the item AS IT WILL BE, which is what moves the id
  const next = mint('question', { ...findItem(p, a).item, pillar: 'Data', q: 'What is churn, exactly?' });
  assert.notEqual(next, a, 'the reword must actually re-mint, or this test proves nothing');
  p = applyOp(p, { type: 'edit', id: a, fields: { q: 'What is churn, exactly?' } }, next);

  const child = p.QUESTIONS.flatMap((g) => g.items).find((q) => q.q === 'And by cohort?');
  assert.equal(child.from, next, 'the follow-up link was orphaned by the re-mint');
  // and the child must still be editable in a field that has nothing to do with the link
  assert.doesNotThrow(() => applyOp(p, { type: 'edit', id: child.id, fields: { why: 'unrelated' } }, child.id));
});

test('removing a parent question does not lock the questions that followed from it', () => {
  let p = normalisePlan({ engagement: { slug: 'x', client: 'C', title: 'T', stage: 'S', access: 'A' } });
  p = applyOp(p, { type: 'add', kind: 'question', fields: { pillar: 'Data', q: 'What is churn?' } }, 'q:aaaaaaa1');
  p = applyOp(p, { type: 'add', kind: 'question', fields: { pillar: 'Data', q: 'By cohort?', from: 'q:aaaaaaa1' } }, 'q:bbbbbbb2');
  p = applyOp(p, { type: 'remove', id: 'q:aaaaaaa1' });
  // A link the record can no longer resolve is an honest state it is allowed to hold: the drawer
  // labels it, and the practitioner decides. What it must NOT do is make the record unwritable.
  assert.doesNotThrow(() => applyOp(p, { type: 'edit', id: 'q:bbbbbbb2', fields: { why: 'unrelated' } }, 'q:bbbbbbb2'),
    'an already-dangling link blocked an edit that had nothing to do with it');
  // ⚠ but the guard must still bite on a link THIS edit is setting, or the tolerance has swallowed it
  assert.throws(() => applyOp(p, { type: 'edit', id: 'q:bbbbbbb2', fields: { from: 'q:nosuchid' } }, 'q:bbbbbbb2'),
    // Either message is correct here; which one depends on whether anything else is left in the
    // record, and after the removal nothing is. What matters is that it still bites.
    /followed from/, 'a newly set bad parent was accepted');
});

test('the "no other questions" message does not count the question being edited', () => {
  let p = normalisePlan({ engagement: { slug: 'x', client: 'C', title: 'T', stage: 'S', access: 'A' } });
  p = applyOp(p, { type: 'add', kind: 'question', fields: { pillar: 'Data', q: 'One?' } }, 'q:aaaaaaa1');
  p = applyOp(p, { type: 'add', kind: 'question', fields: { pillar: 'Data', q: 'Two?' } }, 'q:bbbbbbb2');
  // ⚠ The count included the item under edit, so a record plainly holding two questions reported
  // that it held none. Two questions, so the message must be the one that names the missing id.
  assert.throws(() => applyOp(p, { type: 'edit', id: 'q:bbbbbbb2', fields: { from: 'q:ghost' } }, 'q:bbbbbbb2'),
    /No question "q:ghost"/);
});

// ── the cadence note belongs to "other", and the RECORD says so ──────────────────────────────
//
// ⚠ This was enforced only by the drawer, so an MCP session stored `cadence: 'monthly'` beside
// `cadenceNote: 'every third Tuesday'` and any renderer showing both stated a contradiction. Worse,
// enforcing it in the form cost data: a <select> fires change on every arrow-key step, so one
// keystroke wiped the client's own words with no undo. The guard moved here; the form stopped
// destroying anything.
for (const kind of ['kpi', 'task']) {
  test(`${kind}: the cadence note is dropped unless the cadence is "other"`, () => {
    const base = kind === 'kpi' ? { name: 'Turnaround' } : { what: 'Re-types responses' };
    const off = buildItem(kind, { ...base, cadence: 'weekly', cadenceNote: 'every third Tuesday' }, `${link(kind)}:a`);
    assert.equal(off.cadence, 'weekly');
    assert.equal(off.cadenceNote, '', 'a note survived a cadence that is not "other"');

    const on = buildItem(kind, { ...base, cadence: 'other', cadenceNote: 'every third Tuesday' }, `${link(kind)}:b`);
    assert.equal(on.cadenceNote, 'every third Tuesday', 'the words were dropped where they belong');

    // free text still resolves to "other" and KEEPS what was typed, which is the whole reason the
    // note exists: the categorical field is what you group by, the note is what they said.
    const typed = buildItem(kind, { ...base, cadence: 'every third Tuesday' }, `${link(kind)}:c`);
    assert.equal(typed.cadence, 'other');
    assert.equal(typed.cadenceNote, 'every third Tuesday');
  });
}

// ── nothing is left pointing at an id that has moved ─────────────────────────────────────────
//
// ⚠ Ids are content hashes, so editing an item MINTS A NEW ONE. Every field holding the old id then
// goes stale, and because each is hard-validated when its own item is next edited, a stale one does
// not merely lose a link: it makes the REFERRING item unwritable, and clearing the bad reference
// needs an edit the record refuses. The first fix carried `question.from` and missed the other
// twelve, so fixing a typo in a question bricked the session covering it. Proven by removing one
// row from ID_FIELDS and watching this go red.
function populated() {
  let p = normalisePlan({ engagement: { slug: 'x', client: 'C', title: 'T', stage: 'S', access: 'A' } });
  const mint = (kind, f) => `${ID_PREFIX[kind]}:${createHash('sha256')
    .update(identityParts(kind, f).join(' ')).digest('hex').slice(0, 8)}`;
  const add = (kind, f) => { const id = mint(kind, f); p = applyOp(p, { type: 'add', kind, fields: f }, id); return id; };
  const unit = add('unit', { ref: 'OPS', name: 'Operations', unitType: 'team' });
  const boss = add('person', { name: 'Ama', role: 'Supervisor', side: 'client', unitId: unit });
  add('person', { name: 'Kofi', role: 'Analyst', side: 'client', reportsTo: boss, worksWith: [boss] });
  const q = add('question', { pillar: 'Data', q: 'Who checks the returns?' });
  add('question', { pillar: 'Data', q: 'And by cohort?', from: q });
  add('session', { person: 'Ama', only: 'Only she runs it', covers: [q], personId: boss });
  const kpi = add('kpi', { name: 'Turnaround', scope: 'team', unitId: unit, affectedBy: [q] });
  add('hypothesis', { ref: 'H1', claim: 'Re-keying causes it', kills: 'A clean run', bearsOn: [q] });
  add('task', { what: 'Re-types responses', personId: boss });
  add('build', { ref: 'B1', name: 'Field capture', kpis: [kpi] });
  return { plan: p, mint, ids: { unit, boss, q, kpi } };
}

test('re-minting an item leaves nothing pointing at its old id', () => {
  const { plan, mint, ids } = populated();
  // Reword each referenced item in turn and assert the old id is gone from the whole record.
  for (const [kind, id, change] of [
    ['question', ids.q, { q: 'Who checks the returns, exactly?' }],
    ['person', ids.boss, { name: 'Ama Mensah' }],
    // ⚠ A unit's identity is its REF, not its name, and a kpi's is scope plus name. Editing the
    // wrong field re-mints nothing and the assertion below would pass over a record that never
    // changed. The notEqual guard is what caught that.
    ['unit', ids.unit, { ref: 'OPSD' }],
    ['kpi', ids.kpi, { name: 'Turnaround time' }],
  ]) {
    const found = findItem(plan, id);
    const seed = { ...found.item, ...(found.pillar ? { pillar: found.pillar } : {}), ...change };
    const next = mint(kind, seed);
    assert.notEqual(next, id, `the ${kind} edit must actually re-mint, or this proves nothing`);
    const after = applyOp(plan, { type: 'edit', id, fields: change }, next);
    const left = JSON.stringify(after).split('"').filter((x) => x === id);
    assert.equal(left.length, 0, `${kind}: ${left.length} reference(s) still point at the old id`);
  }
});

test('every referring item stays writable after the thing it names is reworded', () => {
  const { plan, mint, ids } = populated();
  const found = findItem(plan, ids.q);
  const next = mint('question', { ...found.item, pillar: found.pillar, q: 'Who checks the returns, exactly?' });
  const after = applyOp(plan, { type: 'edit', id: ids.q, fields: { q: 'Who checks the returns, exactly?' } }, next);
  // ⚠ THE ACTUAL HARM. A stale reference is not a cosmetic loss: the referring item can no longer
  // be saved at all, in the drawer, in an inline editor, or from an MCP session.
  for (const section of ['SESSIONS', 'KPIS', 'HYPOTHESES']) {
    for (const item of after[section] || []) {
      assert.doesNotThrow(() => applyOp(after, { type: 'edit', id: item.id, fields: { note: 'unrelated' } }, item.id),
        `${section}: bricked by a reword of something it names`);
    }
  }
});

// ⚠ THE FIXTURE VERSION OF THIS TEST PASSED OVER A MISSING FIELD. It scanned a populated record
// for id-shaped values, so it could only ever see the fields the fixture happened to fill; the very
// next id field added (`build.dependsOn`) was invisible to it and it stayed green. A completeness
// check that depends on a fixture being complete is not one.
//
// ⚠ AND THE FIRST REWRITE WAS TOO CRUDE THE OTHER WAY: it asked whether a field KEEPS an id-shaped
// string, which every free-text field does, so it reported `process.name` as a reference. Storing a
// string that looks like an id is not holding a reference.
//
// What actually distinguishes one is behaviour on BOTH sides: a reference field ACCEPTS an id the
// record holds and REFUSES one it does not. Free text accepts both; a number field refuses both.
// So the schema is asked, rather than guessed at.
test('ID_FIELDS names every field the record validates as a reference', () => {
  const named = new Set(ID_FIELDS.map(([s2, f]) => `${s2}.${f}`));
  const SECTION_OF = {
    process: 'PROCESSES', question: 'QUESTIONS', evidence: 'EVIDENCE', session: 'SESSIONS',
    source: 'SOURCES', kpi: 'KPIS', hypothesis: 'HYPOTHESES', competitor: 'COMPETITORS',
    offering: 'OFFERINGS', unit: 'UNITS', person: 'PEOPLE', task: 'TASKS', build: 'BUILDS',
  };
  const { plan, ids } = populated();
  const real = Object.values(ids);
  const FAKE = 'q:deadbeef';
  const base = { name: 'Probe name', q: 'Probe question?', pillar: 'Data', item: 'Probe item',
    person: 'Probe person', only: 'Only they can', what: 'Probe what', claim: 'Probe claim',
    kills: 'A clean run', num: '97', howToday: 'By hand', ref: 'ZZ', scope: 'team' };
  const put = (kind, field, value) => {
    const fields = { ...base, [field]: value };
    applyOp(plan, { type: 'add', kind, fields }, `${ID_PREFIX[kind]}:zzzzzzz9`);
  };
  const missed = [];
  let refusedOnce = 0;
  for (const kind of KINDS) {
    for (const field of FIELDS_BY_KIND[kind]) {
      // Does it refuse an id nothing holds?
      let refusesFake = false;
      for (const shape of [FAKE, [FAKE]]) {
        try { put(kind, field, shape); } catch (e) { if (String(e.message).includes(FAKE)) refusesFake = true; }
      }
      if (!refusesFake) continue;
      refusedOnce++;
      // Does it accept one the record DOES hold? If nothing is accepted it is not an item
      // reference at all, just a field that dislikes this string (a number, a URL, an enum).
      let acceptsReal = false;
      for (const id of real) {
        for (const shape of [id, [id]]) {
          try { put(kind, field, shape); acceptsReal = true; } catch { /* keep trying */ }
        }
      }
      if (acceptsReal && !named.has(`${SECTION_OF[kind]}.${field}`)) missed.push(`${SECTION_OF[kind]}.${field}`);
    }
  }
  assert.ok(refusedOnce >= ID_FIELDS.length, `only ${refusedOnce} fields refused an unknown id, but ID_FIELDS names ${ID_FIELDS.length}: the probe has gone blind`);
  assert.deepEqual([...new Set(missed)], [],
    'these fields are validated as references and are not in ID_FIELDS, so a re-mint will leave them stale');
});

test('ID_FIELDS covers what a populated record actually holds', () => {
  const { plan } = populated();
  const named = new Set(ID_FIELDS.map(([s, f]) => `${s}.${f}`));
  const looksLikeId = (v) => typeof v === 'string' && new RegExp(`^(${Object.values(ID_PREFIX).join('|')}):[0-9a-f]{8}$`).test(v);
  const missed = [];
  for (const section of SECTIONS) {
    const rows = section === 'QUESTIONS'
      ? (plan.QUESTIONS || []).flatMap((g) => g.items || [])
      : (Array.isArray(plan[section]) ? plan[section] : []);
    for (const row of rows) {
      for (const [field, v] of Object.entries(row)) {
        if (field === 'id') continue;
        const hit = looksLikeId(v) || (Array.isArray(v) && v.some(looksLikeId));
        if (hit && !named.has(`${section}.${field}`)) missed.push(`${section}.${field}`);
      }
    }
  }
  // ⚠ This is the guard on the TABLE, not on the carry. A fourteenth id-holding field added without
  // a row here would silently reintroduce the brick, and nothing else in the suite would notice.
  assert.deepEqual([...new Set(missed)], [],
    'these fields hold an id and are not in ID_FIELDS, so a re-mint will leave them stale');
});


// ── the two evidence axes ─────────────────────────────────────────────────────────────────────
//
// `state` answers do we have it. `vstate` answers have we assessed it. They were one field, which
// meant an untouched export and a document somebody had read, weighed and judged fit both read as
// "Held" — and a finding built on either looked equally sound.
import { canReview, HOLDS_SOMETHING, EVIDENCE_VSTATE_IDS, EVIDENCE_STATE_IDS,
  canBaseline, MEASURE_CONFIDENCE, MEASURE_CONFIDENCE_MEANS } from './deepdive-schema.mjs';

const ev = (over) => buildItem('evidence', { item: 'A payroll export', ...over }, 'e:aaaaaaa1');

test('you cannot review what you do not hold', () => {
  for (const state of ['missing', 'accepted']) {
    assert.equal(canReview({ state }).ok, false, `${state} should not be reviewable`);
    assert.match(canReview({ state }).why, /\S/, 'a refusal has to say why');
  }
  for (const state of ['held', 'partial', 'ours']) {
    assert.equal(canReview({ state }).ok, true, `${state} should be reviewable`);
  }
});

test('a validation status cannot be smuggled onto evidence nobody has provided', () => {
  // The important one: the constraint has to hold at the RECORD, not only in the form. An MCP
  // session writes straight past a control that is merely hidden.
  assert.equal(ev({ state: 'missing', vstate: 'validated' }).vstate, null);
  assert.equal(ev({ state: 'accepted', vstate: 'validated' }).vstate, null);
  assert.equal(ev({ state: 'held', vstate: 'validated' }).vstate, 'validated');
});

test('held evidence nobody has weighed is captured, not validated', () => {
  assert.equal(ev({ state: 'held' }).vstate, 'captured');
});

test('an accepted limitation is a state a record can hold', () => {
  // Evidence we will never get, where the assessment proceeds anyway. Without this it stays
  // Outstanding forever and the register becomes a list of failures rather than of decisions.
  assert.ok(EVIDENCE_STATE_IDS.includes('accepted'));
  assert.equal(ev({ state: 'accepted' }).state, 'accepted');
});

test('the gap fields survive a round trip', () => {
  const e = ev({ state: 'missing', whyItMatters: 'Only source for cycle time', impactIfUnresolved: 'The baseline stays unmeasured' });
  assert.equal(e.whyItMatters, 'Only source for cycle time');
  assert.equal(e.impactIfUnresolved, 'The baseline stays unmeasured');
});

test('every validation state and acquisition state is one HOLDS_SOMETHING can be asked about', () => {
  // A guard against the two lists drifting: a new acquisition state that nobody decides the
  // reviewability of would silently fall to "not reviewable".
  for (const id of EVIDENCE_STATE_IDS) {
    assert.equal(typeof HOLDS_SOMETHING.has(id), 'boolean');
  }
  assert.ok(EVIDENCE_VSTATE_IDS.includes('challenged'),
    'contradiction needs a state of its own: it is an investigative signal, not a defect');
});


// ── a measure you cannot reproduce is not a baseline ──────────────────────────────────────────
//
// A baseline of 8.4 days and a post-implementation 2.7 days that counted different months, or a
// different caseload, is not a 68% improvement. It is two numbers. This is where benefits
// realisation normally dies, so the record refuses to call such a measure a baseline.
const kpi = (over) => buildItem('kpi', { name: 'Onboarding cycle time', scope: 'team', ...over }, 'k:aaaaaaa1');

test('a number with no method and no period is not yet a baseline', () => {
  const g = canBaseline(kpi({ current: 8.4 }));
  assert.equal(g.ok, false);
  assert.match(g.why, /how it is calculated/);
  assert.match(g.why, /what period/);
});

test('a baseline needs the value, the method and the period, and says which are missing', () => {
  assert.equal(canBaseline(kpi({ current: 8.4, definition: 'sum / count', period: 'Q3 2026' })).ok, true);
  // each one missing on its own is named rather than reported as a generic failure
  assert.match(canBaseline(kpi({ definition: 'd', period: 'p' })).why, /current value/);
  assert.match(canBaseline(kpi({ current: 1, period: 'p' })).why, /how it is calculated/);
  assert.match(canBaseline(kpi({ current: 1, definition: 'd' })).why, /what period/);
});

test('a current value of zero is a value, not a blank', () => {
  // ⚠ A truthiness check would have refused a perfectly good baseline of 0: zero defects, zero
  // rework, zero escalations are exactly the numbers a transformation is trying to protect.
  assert.equal(canBaseline(kpi({ current: 0, definition: 'd', period: 'p' })).ok, true);
});

test('whitespace is not a measurement definition', () => {
  assert.equal(canBaseline(kpi({ current: 1, definition: '   ', period: '   ' })).ok, false);
});

test('a measure carries its own confidence, separate from a finding\'s', () => {
  // A finding's confidence is about accounts agreeing. This is about the number itself.
  assert.equal(kpi({ current: 1 }).confidence, 'moderate');
  assert.equal(kpi({ current: 1, confidence: 'limited' }).confidence, 'limited');
  for (const c of MEASURE_CONFIDENCE) assert.ok(MEASURE_CONFIDENCE_MEANS[c], `${c} has no meaning`);
});

test('the measurement definition fields survive a round trip', () => {
  const k = kpi({ current: 8.4, period: 'Jul to Sep 2026', population: 'New commercial cases, excluding renewals',
    limitations: 'August is a low-volume month' });
  assert.equal(k.period, 'Jul to Sep 2026');
  assert.match(k.population, /excluding renewals/);
  assert.match(k.limitations, /low-volume/);
});

test('coverage counts only the questions that NEED a person', () => {
  // ⚠ A DOCUMENT-ROUTED QUESTION IS NOT UNANSWERED. Before PERSON_ROUTES, the Sessions tab told a
  // practitioner "78 nobody set to answer" when most of those were routed to documents, systems
  // and desk research: the exact things the Standard (4.3) says are never asked of a person. The
  // gap stat was manufacturing meetings.
  let p = normalisePlan({ engagement: { slug: 'x', client: 'C', title: 'T', stage: 'S', access: 'A' } });
  const add = (k, f, id) => { p = applyOp(p, { type: 'add', kind: k, fields: f }, id); };
  add('question', { pillar: 'Data', q: 'Reachable from the archive?', certainty: 'unknown', route: 'document' }, 'q:aaaaaaa1');
  add('question', { pillar: 'Data', q: 'Needs the manager in the room?', certainty: 'unknown', route: 'session' }, 'q:bbbbbbb2');
  add('question', { pillar: 'Data', q: 'Nobody has decided how yet?', certainty: 'unknown' }, 'q:ccccccc3');
  add('question', { pillar: 'Data', q: 'Already answered?', certainty: 'known', note: 'Stated on 21 Aug.' }, 'q:ddddddd4');
  add('session', { person: 'The manager', only: 'The one thing', covers: ['q:bbbbbbb2'] }, 's:aaaaaaa1');

  const cov = questionCoverage(p);
  assert.equal(cov.all, 4);
  assert.equal(cov.total, 2, 'needing a person = the session-routed one plus the undecided one');
  assert.equal(cov.answered, 1, 'the tied session-routed question counts as answered');
  assert.deepEqual(cov.unanswerable.map((r) => r.question.id), ['q:ccccccc3'],
    'only the undecided question is a gap: the document route is answered without a diary');
  assert.equal(cov.gathered, 2, 'the known one and the document one are gathered, not gaps');
});
