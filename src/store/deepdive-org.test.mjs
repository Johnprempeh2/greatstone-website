// The organisation, and what the record can say about one person.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalisePlan, applyOp, findItem } from '../data/deepdive-schema.mjs';
import { personHolds, unlinkedNames, personLoad, targetState } from './deepdive-org.mjs';
import { TASK_FATE, FATE_MEANS, FATE_REMOVES, FATE_REDUCES } from '../data/deepdive-schema.mjs';

// ── a person's page has to be able to answer what they are on the hook for ────────────────────
//
// ⚠ WHO RUNS A PROCESS, WHO TO SPEAK TO, WHO CONTROLS A SOURCE AND WHOSE NUMBER A KPI IS were all
// free text, so none of them reached the person named in them. The words are still on those
// records; these are the links, and this is the check that they arrive.
test('everything linked to a person reaches their page', () => {
  let p = normalisePlan({ engagement: { slug: 'x', client: 'C', title: 'T', stage: 'S', access: 'A' } });
  const add = (k, f, id) => { p = applyOp(p, { type: 'add', kind: k, fields: f }, id); };
  add('unit', { ref: 'OPS', name: 'Operations', unitType: 'team' }, 'u:aaaaaaa1');
  add('person', { name: 'A manager', role: 'Research manager', side: 'client' }, 'n:aaaaaaa1');
  add('person', { name: 'An analyst', role: 'Analyst', side: 'client' }, 'n:bbbbbbb2');
  add('process', { num: '01', name: 'Data collection', howToday: 'By hand',
    whoRuns: 'the research manager', whoRunsId: 'n:aaaaaaa1',
    speakTo: ['An analyst'], speakToIds: ['n:bbbbbbb2'] }, 'p:aaaaaaa1');
  add('source', { name: 'The value tables', sourceType: 'system', owner: 'her', ownerId: 'n:aaaaaaa1' }, 'r:aaaaaaa1');
  add('kpi', { name: 'Turnaround', scope: 'team', unitId: 'u:aaaaaaa1', owner: 'her', ownerId: 'n:aaaaaaa1' }, 'k:aaaaaaa1');

  const h = personHolds(p, 'n:aaaaaaa1');
  assert.equal(h.runs.length, 1, 'the process she runs did not reach her page');
  assert.equal(h.owns.length, 1, 'the source she controls did not reach her page');
  assert.equal(h.numbers.length, 1, 'the number that is hers did not reach her page');
  assert.equal(personHolds(p, 'n:bbbbbbb2').walkWith.length, 1, 'being somebody to speak to did not reach his page');
  // ⚠ and the words are STILL THERE. A link that replaced the text would lose what was actually said.
  assert.equal(findItem(p, 'p:aaaaaaa1').item.whoRuns, 'the research manager');
});

test('a name the record cannot follow is reported, even when others on the same record can', () => {
  let p = normalisePlan({ engagement: { slug: 'x', client: 'C', title: 'T', stage: 'S', access: 'A' } });
  const add = (k, f, id) => { p = applyOp(p, { type: 'add', kind: k, fields: f }, id); };
  add('person', { name: 'An analyst', role: 'Analyst', side: 'client' }, 'n:bbbbbbb2');
  add('process', { num: '01', name: 'Data collection', howToday: 'By hand',
    speakTo: ['An analyst', 'A field supervisor', 'The data lead'],
    speakToIds: ['n:bbbbbbb2'] }, 'p:aaaaaaa1');
  const loose = unlinkedNames(p).map((x) => x.said);
  // ⚠ THIS SKIPPED EVERY NAME THE MOMENT ONE WAS LINKED, so a process naming three people and
  // linking one reported nothing left to do, and the sweep looked finished when it was a third done.
  assert.deepEqual(loose.sort(), ['A field supervisor', 'The data lead'],
    'a partially linked record hid the names still to do');
});

test('a recorded gap is not reported as a name to go and link', () => {
  let p = normalisePlan({ engagement: { slug: 'x', client: 'C', title: 'T', stage: 'S', access: 'A' } });
  p = applyOp(p, { type: 'add', kind: 'process', fields: { num: '01', name: 'Marketing',
    howToday: 'By hand', whoRuns: 'Not established. This is the thinnest area of our understanding.' } }, 'p:aaaaaaa1');
  // ⚠ Four of nine processes on the live record say exactly this. Listing them as names to link
  // buried the five real ones and made the surface read as twenty-eight jobs when it was five.
  assert.deepEqual(unlinkedNames(p), [], 'an honest "not established" was reported as a name');
});

test('a line that names a linked person is not reported, however it is worded', () => {
  let p = normalisePlan({ engagement: { slug: 'x', client: 'C', title: 'T', stage: 'S', access: 'A' } });
  const add = (k, f, id) => { p = applyOp(p, { type: 'add', kind: k, fields: f }, id); };
  add('person', { name: 'The interviewers', role: 'Collection', side: 'client' }, 'n:aaaaaaa1');
  add('person', { name: 'The field supervisor', side: 'client' }, 'n:bbbbbbb2');
  add('process', { num: '01', name: 'Data collection', howToday: 'By hand',
    speakTo: [
      // ⚠ THESE ARE SENTENCES, NOT NAMES. An exact-match comparison reported every one as unlinked
      // while the link sat right there, and a leading article made the second one miss as well.
      'The field supervisor, on what a day actually looks like.',
      'Interviewers themselves, not only those who manage them. The refusal happens to them.',
      'Whoever handles pay and contracts for the surge.',
    ],
    speakToIds: ['n:aaaaaaa1', 'n:bbbbbbb2'] }, 'p:aaaaaaa1');
  const said = unlinkedNames(p).map((x) => x.said);
  assert.deepEqual(said, ['Whoever handles pay and contracts for the surge.'],
    'the sweep reported a line whose person is already linked');
});

test('a step reaches the person who does it, and survives them being renamed', async () => {
  const { createHash } = await import('node:crypto');
  const { ID_PREFIX, identityParts } = await import('../data/deepdive-schema.mjs');
  const mint = (k, f) => `${ID_PREFIX[k]}:${createHash('sha256')
    .update(identityParts(k, f).join(' ')).digest('hex').slice(0, 8)}`;
  let p = normalisePlan({ engagement: { slug: 'x', client: 'C', title: 'T', stage: 'S', access: 'A' } });
  const add = (k, f, id) => { p = applyOp(p, { type: 'add', kind: k, fields: f }, id); };
  add('person', { name: 'A supervisor', role: 'Field', side: 'client' }, 'n:aaaaaaa1');
  add('process', { num: '01', name: 'Data collection', howToday: 'By hand',
    steps: [{ name: 'Collect on paper', who: 'a field interviewer', whoId: 'n:aaaaaaa1' }] }, 'p:aaaaaaa1');

  // ⚠ BOTH, as everywhere else. Half of these are a role rather than somebody on the chart, and a
  // picker in place of the words is how the role gets deleted.
  const step = findItem(p, 'p:aaaaaaa1').item.steps[0];
  assert.equal(step.who, 'a field interviewer');
  assert.equal(step.whoId, 'n:aaaaaaa1');
  assert.equal(personHolds(p, 'n:aaaaaaa1').doesSteps.length, 1, 'the step did not reach their page');

  assert.throws(() => applyOp(p, { type: 'edit', id: 'p:aaaaaaa1',
    fields: { steps: [{ name: 'X', whoId: 'n:ghost' }] } }, 'p:aaaaaaa1'), /No person/,
    'a step naming somebody the record does not hold was accepted');

  // ⚠ THE CASE NO TABLE CAN GUARD. ID_FIELDS names top-level fields, and the completeness test that
  // guards it works by offering an id to a field and seeing whether the record validates it. A
  // reference buried inside an array of objects is invisible to both, so carryRefs handles it by
  // hand and this is the only thing that says so. Without it, renaming somebody leaves every step
  // they do pointing at a dead id and every one of those processes unwritable.
  const next = mint('person', { ...findItem(p, 'n:aaaaaaa1').item, name: 'A named supervisor' });
  assert.notEqual(next, 'n:aaaaaaa1', 'the rename must re-mint, or this proves nothing');
  const after = applyOp(p, { type: 'edit', id: 'n:aaaaaaa1', fields: { name: 'A named supervisor' } }, next);
  assert.equal(after.PROCESSES[0].steps[0].whoId, next, 'the step was orphaned by the rename');
  assert.doesNotThrow(() => applyOp(after, { type: 'edit', id: after.PROCESSES[0].id,
    fields: { whoRuns: 'unrelated' } }, after.PROCESSES[0].id), 'the process was bricked by the rename');
  assert.equal(personHolds(after, next).doesSteps.length, 1, 'the step stopped reaching their page');
});


// ── the headcount arithmetic ──────────────────────────────────────────────────────────────────
//
// This is the number that goes in front of a chief executive, and until now nothing tested which
// fates count toward it. `moves` did, so handing a task to a colleague booked a saving the business
// never makes. A headcount claim has to survive "where does that come from".
const load = (fates) => {
  let p = normalisePlan({ engagement: { slug: 'x', client: 'C', title: 'T', stage: 'S', access: 'A' } });
  const add = (k, f, id) => { p = applyOp(p, { type: 'add', kind: k, fields: f }, id); };
  add('person', { name: 'A supervisor', side: 'client' }, 'n:aaaaaaa1');
  fates.forEach((fate, i) => add('task',
    { what: 'Task ' + i, personId: 'n:aaaaaaa1', hours: 10, fate },
    't:' + String(i).padStart(7, 'a') + '1'));
  return { plan: p, load: personLoad(p, 'n:aaaaaaa1') };
};

test('moving work to somebody else is not a saving', () => {
  const { load: l } = load(['moves']);
  assert.equal(l.hoursFreed, 0, 'moved work must never count as freed');
  assert.equal(l.hoursMoved, 10, 'and it must still be reported, not lost');
  assert.equal(l.moved.length, 1);
  // it stays on the KEPT side too, because the business still does it
  assert.equal(l.kept.length, 1);
});

test('only work that stops being done by a person is freed', () => {
  for (const fate of ['eliminated', 'automated', 'agentic']) {
    assert.equal(load([fate]).load.hoursFreed, 10, `${fate} should free the hours`);
  }
  for (const fate of ['simplified', 'digitised', 'augmented', 'stays', 'moves', 'not decided']) {
    assert.equal(load([fate]).load.hoursFreed, 0, `${fate} must not free the hours`);
  }
});

test('lessened work is reported without being counted as a whole person', () => {
  const { load: l } = load(['simplified', 'digitised', 'augmented']);
  assert.equal(l.hoursFreed, 0, 'less of it is not none of it');
  assert.equal(l.hoursLightened, 30, 'but it must be visible rather than implying nothing happened');
});

test('the whole-business rollup reports moved and lightened work beside the saving', () => {
  const { plan } = load(['eliminated', 'moves', 'simplified']);
  const t = targetState(plan, 37.5);
  assert.equal(t.hoursFreed, 10);
  assert.equal(t.hoursMoved, 10);
  assert.equal(t.tasksMoved, 1);
  assert.equal(t.hoursLightened, 10);
  // 10 freed hours is not a whole person at 37.5, and it rounds DOWN
  assert.equal(t.peopleFreed, 0);
});

// ── the six tags ──────────────────────────────────────────────────────────────────────────────
test('every canonical tag can be recorded, in assessment order', () => {
  // Simplify and Digitise were missing, so the two cheapest answers could not be recorded at all
  // and every task skipped to automation. That is the bias assessing in order exists to prevent.
  for (const tag of ['eliminated', 'simplified', 'digitised', 'automated', 'augmented', 'agentic']) {
    assert.ok(TASK_FATE.includes(tag), `${tag} is not a fate a task can carry`);
  }
  const order = TASK_FATE.filter((f) => f !== 'not decided' && f !== 'moves' && f !== 'stays');
  assert.deepEqual(order, ['eliminated', 'simplified', 'digitised', 'automated', 'augmented', 'agentic'],
    'the six must be offered in assessment order: elimination is tested first because removing work '
    + 'recovers its full cost while automating preserves it in another form');
});

test('every fate says what happens to the work and who performs it afterwards', () => {
  for (const f of TASK_FATE) {
    assert.ok(FATE_MEANS[f], `${f} has no meaning, so the overlap between tags cannot be resolved`);
  }
});

test('no fate is both freed and merely lessened', () => {
  for (const f of FATE_REMOVES) assert.ok(!FATE_REDUCES.has(f), `${f} cannot be both`);
});
