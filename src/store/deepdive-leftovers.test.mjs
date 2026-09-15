// What a session leaves behind, and both directions of it: what MUST be reported, and what must
// NOT be. A leftover list that shrinks wrongly hides an unanswered question; one that grows
// wrongly nags about work already done elsewhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalisePlan, applyOp } from '../data/deepdive-schema.mjs';
import { sessionLeftovers, sessionNeedsRecord } from './deepdive-state.mjs';

const plan = (() => {
  let p = normalisePlan({ engagement: { slug: 'x', client: 'C', title: 'T', stage: 'S', access: 'A' } });
  const add = (k, f, id) => { p = applyOp(p, { type: 'add', kind: k, fields: f }, id); };
  add('question', { pillar: 'Data', q: 'Answered in the room?' }, 'q:aaaaaaa1');
  add('question', { pillar: 'Data', q: 'Skipped in the room?' }, 'q:bbbbbbb2');
  add('question', { pillar: 'People', q: 'Answered later by desk research?' }, 'q:ccccccc3');
  add('question', { pillar: 'People', q: 'Removed after being tied?' }, 'q:ddddddd4');
  add('session', { name: 'The sitting', person: 'Ama',
    covers: ['q:aaaaaaa1', 'q:bbbbbbb2', 'q:ccccccc3', 'q:ddddddd4'] }, 's:aaaaaaa1');
  // ⚠ THE SCHEMA REFUSES A DEAD COVER AT BUILD TIME (the first draft of this fixture learned so),
  // which means a dead id can only ARISE from a later removal. Do exactly that, and the test
  // below asserts whichever truth holds: either removal scrubs covers, or leftovers must skip.
  p = applyOp(p, { type: 'remove', id: 'q:ddddddd4' }, 'q:ddddddd4');
  return p;
})();
const S = plan.SESSIONS[0];

test('an examined session reports exactly the covered questions still open', () => {
  const map = { [S.id]: { status: 'done' }, 'q:aaaaaaa1': { status: 'done' } };
  const left = sessionLeftovers(plan, map, S);
  assert.deepEqual(left.map((x) => x.id).sort(), ['q:bbbbbbb2', 'q:ccccccc3'],
    'the two unanswered live questions are the leftovers; a removed question is not invented into one '
    + `(covers now: ${JSON.stringify(S.covers)})`);
  assert.equal(left[0].q.q.length > 0, true, 'each leftover carries the live question for display');
});

test('a question answered later by ANY route stops being a leftover', () => {
  const map = { [S.id]: { status: 'done' }, 'q:aaaaaaa1': { status: 'done' },
    'q:bbbbbbb2': { status: 'done' }, 'q:ccccccc3': { status: 'done' } };
  assert.deepEqual(sessionLeftovers(plan, map, S), [],
    'the gap is judged against the record NOW, not against the meeting');
});

test('a session that has not been run has no leftovers, whatever its covers say', () => {
  assert.deepEqual(sessionLeftovers(plan, {}, S), [],
    'an open session still has its meeting ahead of it');
});

test('needing a record means examined AND nowhere to open it, both halves', () => {
  assert.equal(sessionNeedsRecord({}, S), false, 'an unrun session is not nagged');
  assert.equal(sessionNeedsRecord({ [S.id]: { status: 'done' } }, S), true);
  assert.equal(sessionNeedsRecord({ [S.id]: { status: 'done' } }, { ...S, record: 'https://x.example/notes' }), false);
  assert.equal(sessionNeedsRecord({ [S.id]: { status: 'done' } }, { ...S, recordNote: 'The blue notebook' }), false,
    'a stated place counts: the nag is about openability, not about links specifically');
});
