// The flat questions view's filtering. Both directions, as ever: what a filter must catch, and
// what it must leave alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalisePlan, applyOp, questionCoverage } from '../data/deepdive-schema.mjs';
import { filterRows, rowFacts, NEEDS_DECIDING, viewCounts } from './deepdive-qview.mjs';

function fixture() {
  let p = normalisePlan({ engagement: { slug: 'x', client: 'C', title: 'T', stage: 'S', access: 'A' } });
  const add = (k, f, id) => { p = applyOp(p, { type: 'add', kind: k, fields: f }, id); };
  add('question', { pillar: 'Data', q: 'Undecided and untied?', certainty: 'unknown' }, 'q:aaaaaaa1');
  add('question', { pillar: 'Data', q: 'Routed to a document?', certainty: 'unknown', route: 'document' }, 'q:bbbbbbb2');
  add('question', { pillar: 'People', q: 'Needs the manager?', certainty: 'unknown', route: 'session' }, 'q:ccccccc3');
  add('question', { pillar: 'People', q: 'Already answered?', certainty: 'known', note: 'Stated.' }, 'q:ddddddd4');
  add('session', { person: 'The manager', only: 'The thing', covers: ['q:ccccccc3'] }, 's:aaaaaaa1');
  return p;
}

test('the needs-deciding preset finds exactly the undecided, untied, open questions', () => {
  const rows = questionCoverage(fixture()).rows;
  const hit = filterRows(rows, NEEDS_DECIDING).map((r) => r.question.id);
  // ⚠ Writing this test caught the design gap: without the `open` predicate, a KNOWN question
  // with no route and no session counted as needing a decision. An answered question needs
  // nothing; the preset must say so.
  assert.deepEqual(hit, ['q:aaaaaaa1'],
    'exactly the genuinely open, undecided, untied question: never the document-routed, the tied, or the known');
});

test('facts classify the three route states honestly', () => {
  const rows = questionCoverage(fixture()).rows;
  const byId = Object.fromEntries(rows.map((r) => [r.question.id, rowFacts(r)]));
  assert.equal(byId['q:aaaaaaa1'].routeState, 'undecided');
  assert.equal(byId['q:bbbbbbb2'].routeState, 'gathered');
  assert.equal(byId['q:ccccccc3'].routeState, 'person');
  assert.equal(byId['q:ccccccc3'].tied, true);
});

test('counts: undecided never includes the known or the tied', () => {
  const rows = questionCoverage(fixture()).rows;
  const c = viewCounts(rows);
  assert.equal(c.all, 4);
  // q:ddddddd4 is known and untied with no route: certainty must keep it OUT of undecided
  assert.equal(c.undecided, 1, 'only the genuinely open, undecided, untied question counts');
});

test('filters compose and an empty filter passes everything through', () => {
  const rows = questionCoverage(fixture()).rows;
  assert.equal(filterRows(rows).length, 4);
  assert.equal(filterRows(rows, { pillar: 'People' }).length, 2);
  assert.equal(filterRows(rows, { pillar: 'People', tie: 'tied' }).length, 1);
  assert.equal(filterRows(rows, { cert: 'known' }).length, 1);
});
