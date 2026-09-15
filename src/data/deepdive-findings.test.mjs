// The finding is where the method's credibility actually sits, and until now it had no test at all.
//
// Two rules matter more than the rest and both are easy to break by accident:
//
//  1. A FINDING IS NEVER OVERWRITTEN. An update is a new finding that supersedes the old one, and
//     the old one stays. That is what makes the history on a question real rather than a claim.
//  2. THE ENGINE MAY SUGGEST. IT MUST NEVER VALIDATE. A conclusion with nothing identifiable
//     behind it must not reach Validated, because a week later it is indistinguishable from one
//     drawn from a transcript and a system export: both read the same and neither can be checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIDENCE, CONFIDENCE_IDS, BEN_CONFIDENCE, FINDING_STATE, FINDING_STATE_IDS,
  normaliseFinding, validateFindingInput, initialState, canValidate, evidenceBehind,
  standing, historyFor, questionState, stateAfterConclusion, certaintyDrift, certaintyDriftRollup, MAX_FINDING,
} from './deepdive-findings.mjs';

const F = (over = {}) => normaliseFinding({ id: 'f:1', questionId: 'q:1', text: 'Something', ...over });

// ── the Engine rule ───────────────────────────────────────────────────────────────────────────
test('a finding with nothing behind it cannot be validated', () => {
  const bare = F();
  assert.equal(canValidate(bare).ok, false);
  assert.match(canValidate(bare).why, /session|source|evidence/i);
});

test('any one identifiable handle is enough to validate', () => {
  // Deliberately generous: a session, a source we hold, an evidence record, or a stated origin in
  // words all qualify. What does not qualify is nothing at all.
  for (const over of [{ sessionId: 's:1' }, { sourceId: 'r:1' },
    { evidenceIds: ['e:1'] }, { source: 'their ops lead, in the August session' }]) {
    assert.equal(canValidate(F(over)).ok, true, `${JSON.stringify(over)} should be enough`);
  }
});

test('whitespace is not provenance', () => {
  // `source: '   '` is the shape a blank form field actually arrives in, and a truthiness check
  // would have accepted it.
  assert.equal(canValidate(F({ source: '   ' })).ok, false);
});

test('evidenceBehind counts what stands behind and what stands against', () => {
  const e = evidenceBehind(F({ sessionId: 's:1', evidenceIds: ['e:1', 'e:2'], challengedBy: ['e:9'] }));
  assert.equal(e.session, true);
  assert.equal(e.evidence, 2);
  assert.equal(e.challenged, 1);
  // ⚠ Challenging evidence must NOT count toward being able to validate. Evidence that contradicts
  // a conclusion is a reason to look again, not a reason to feel supported.
  assert.equal(evidenceBehind(F({ challengedBy: ['e:9'] })).evidence, 0);
  assert.equal(canValidate(F({ challengedBy: ['e:9'] })).ok, false);
});

// ── who wrote it decides where it starts ──────────────────────────────────────────────────────
test('an agent proposes, a practitioner validates', () => {
  assert.equal(initialState('mcp'), 'proposed');
  assert.equal(initialState('portal'), 'validated');
});

// ── the record shape ──────────────────────────────────────────────────────────────────────────
test('normaliseFinding accepts the Finding Record fields and defaults the rest', () => {
  const f = F({
    evidenceIds: ['e:1'], challengedBy: ['e:2'], rootCause: 'Fragmented ownership',
    impact: 'Avoidable delay', desiredOutcome: 'One consistent flow',
    opportunityId: 'y:1', baselineRequired: true,
  });
  assert.deepEqual(f.evidenceIds, ['e:1']);
  assert.deepEqual(f.challengedBy, ['e:2']);
  assert.equal(f.rootCause, 'Fragmented ownership');
  assert.equal(f.desiredOutcome, 'One consistent flow');
  assert.equal(f.opportunityId, 'y:1');
  assert.equal(f.baselineRequired, true);

  const bare = F();
  assert.deepEqual(bare.evidenceIds, []);
  assert.deepEqual(bare.challengedBy, []);
  assert.equal(bare.rootCause, '');
  assert.equal(bare.opportunityId, null);
  assert.equal(bare.baselineRequired, false);
});

test('id lists survive arriving as typed text as well as arrays', () => {
  // The drawer types lines; the MCP sends arrays. Both land in the same field.
  assert.deepEqual(F({ evidenceIds: 'e:1\ne:2\n\n  e:3  ' }).evidenceIds, ['e:1', 'e:2', 'e:3']);
});

test('an unknown confidence or state falls back rather than being stored', () => {
  assert.equal(F({ confidence: 'wishful' }).confidence, 'single');
  assert.equal(F({ state: 'sort of', by: 'mcp' }).state, 'proposed');
});

// ── the vocabulary the instruments speak ──────────────────────────────────────────────────────
test('every confidence maps to the instruments, and disputed deliberately does not', () => {
  for (const id of CONFIDENCE_IDS) {
    assert.ok(id in BEN_CONFIDENCE, `${id} has no mapping to the Finding Record vocabulary`);
  }
  assert.equal(BEN_CONFIDENCE.evidenced, 'High');
  assert.equal(BEN_CONFIDENCE.single, 'Limited');
  // Contradiction is an investigative signal with a finding STATE of its own, not a lower level of
  // certainty. Collapsing it into one would say we are merely less sure, when what we actually hold
  // is two accounts that cannot both be true.
  assert.equal(BEN_CONFIDENCE.disputed, null);
});

test('every confidence and state carries a label and a blurb somebody can read', () => {
  for (const id of CONFIDENCE_IDS) {
    assert.ok(CONFIDENCE[id]?.label, `${id} has no label`);
    assert.ok(CONFIDENCE[id]?.blurb, `${id} has no blurb`);
  }
  for (const id of FINDING_STATE_IDS) assert.ok(FINDING_STATE[id]?.label, `${id} has no label`);
});

// ── input ─────────────────────────────────────────────────────────────────────────────────────
test('a finding needs something in it and is capped', () => {
  assert.throws(() => validateFindingInput({ text: '   ' }), /needs something/);
  assert.throws(() => validateFindingInput({ text: 'x'.repeat(MAX_FINDING + 1) }), /capped/);
  assert.throws(() => validateFindingInput({ text: 'ok', confidence: 'vibes' }), /confidence must be/);
  assert.equal(validateFindingInput({ text: '  trimmed  ' }).text, 'trimmed');
});

// ── what currently stands ─────────────────────────────────────────────────────────────────────
const SET = [
  normaliseFinding({ id: 'f:1', questionId: 'q:1', text: 'First', at: '2026-09-01', state: 'superseded', sessionId: 's:1' }),
  normaliseFinding({ id: 'f:2', questionId: 'q:1', text: 'Second', at: '2026-09-02', confidence: 'evidenced', sessionId: 's:1' }),
  normaliseFinding({ id: 'f:3', questionId: 'q:1', text: 'Rejected', at: '2026-09-03', state: 'rejected', sessionId: 's:1' }),
  normaliseFinding({ id: 'f:4', questionId: 'q:2', text: 'Elsewhere', at: '2026-09-04', sessionId: 's:1' }),
];

test('superseded and rejected findings are history, not answers', () => {
  const live = standing(SET, 'q:1');
  assert.deepEqual(live.map((f) => f.id), ['f:2']);
  // but the history keeps everything, newest first
  assert.deepEqual(historyFor(SET, 'q:1').map((f) => f.id), ['f:3', 'f:2', 'f:1']);
});

test('the weakest live finding governs the question', () => {
  // One disputed account undoes the comfort of an evidenced one: a question with a contradiction in
  // it is not "evidenced" just because something else on it was.
  const withDispute = [...SET,
    normaliseFinding({ id: 'f:5', questionId: 'q:1', text: 'Contradicts', at: '2026-09-05', confidence: 'disputed', sessionId: 's:1' })];
  assert.equal(questionState(withDispute, 'q:1').confidence, 'disputed');
  assert.equal(questionState(SET, 'q:1').confidence, 'evidenced');
  assert.equal(questionState(SET, 'q:99').answered, false);
});

test('a question with proposals outstanding says so rather than reporting confidence', () => {
  const pending = [normaliseFinding({ id: 'f:9', questionId: 'q:7', text: 'Proposed', by: 'mcp', at: '2026-09-06' })];
  const st = questionState(pending, 'q:7');
  assert.equal(st.awaiting, 1);
  assert.match(st.label, /awaiting validation/);
});

// ── refining a conclusion must not smuggle a validation past the rule ─────────────────────────
test('a validated finding that loses its last evidence goes back to proposed', () => {
  const held = F({ state: 'validated', evidenceIds: ['e:1'] });
  assert.equal(stateAfterConclusion(held), 'validated');
  // the conclusion is refined and the supporting evidence is dropped
  const stripped = { ...held, evidenceIds: [] };
  assert.equal(stateAfterConclusion(stripped), 'proposed');
});

test('a finding that still has a session behind it stays validated', () => {
  const f = F({ state: 'validated', sessionId: 's:1', evidenceIds: ['e:1'] });
  assert.equal(stateAfterConclusion({ ...f, evidenceIds: [] }), 'validated');
});

test('the rule only ever demotes, never promotes', () => {
  // A proposed finding with plenty behind it is still proposed: validation is a person's act.
  assert.equal(stateAfterConclusion(F({ state: 'proposed', sessionId: 's:1' })), 'proposed');
  assert.equal(stateAfterConclusion(F({ state: 'rejected' })), 'rejected');
});


// ── the stated certainty against what the findings show ───────────────────────────────────────
//
// Both were on screen and counted in five places, and nothing ever set one against the other. A
// question marked Unknown with three validated answers still counted toward "to investigate".
const V = (over = {}) => normaliseFinding({ id: 'f:' + Math.random(), questionId: 'q:1', text: 't',
  sessionId: 's:1', state: 'validated', ...over });
const Q = (certainty) => ({ id: 'q:1', certainty });

test('a question still marked unknown with validated answers on it has drifted', () => {
  const d = certaintyDrift(Q('unknown'), [V()]);
  assert.equal(d.kind, 'answered');
  assert.match(d.suggest, /Indicated|Known/);
});

test('known with nothing in this record behind it is NOT drift', () => {
  // Known means established through Discovery, the GITA or a prior deliverable and carried in.
  // Having no finding here is the definition, not a defect, and flagging it would fire on every
  // carried-in question until everybody learned to ignore the signal.
  assert.equal(certaintyDrift(Q('known'), []), null);
  assert.equal(certaintyDrift(Q('indicated'), []), null);
  assert.equal(certaintyDrift(Q('unknown'), []), null);
});

test('a contradiction outranks every other kind of drift', () => {
  // Both conditions are true here: it is marked known AND everything on it is a single account.
  // Contradiction wins, because carrying on is actively wrong rather than merely out of date.
  const d = certaintyDrift(Q('known'), [V({ confidence: 'disputed' })]);
  assert.equal(d.kind, 'contradicted');
});

test('a contradiction on an unknown question is not drift', () => {
  // Nothing is being claimed, so nothing is contradicted. The disagreement is the investigation
  // working, not the plan being wrong.
  assert.equal(certaintyDrift(Q('unknown'), [V({ confidence: 'disputed' })]), null);
});

test('indicated becomes questionable once something we have seen backs it', () => {
  assert.equal(certaintyDrift(Q('indicated'), [V({ confidence: 'evidenced' })]).kind, 'evidenced');
  // corroborated accounts are not the same as a document: still believed, not yet evidenced
  assert.equal(certaintyDrift(Q('indicated'), [V({ confidence: 'corroborated' })]), null);
});

test('known resting on one uncorroborated account is thin', () => {
  assert.equal(certaintyDrift(Q('known'), [V({ confidence: 'single' })]).kind, 'thin');
  assert.equal(certaintyDrift(Q('known'), [V({ confidence: 'corroborated' })]), null);
});

test('proposals awaiting validation are not drift', () => {
  // An agent's suggestion must not move a practitioner's rating, even by implication.
  const proposed = normaliseFinding({ id: 'f:p', questionId: 'q:1', text: 't', by: 'mcp', sessionId: 's:1' });
  assert.equal(certaintyDrift(Q('unknown'), [proposed]), null);
});

test('superseded and rejected answers do not count toward drift', () => {
  const dead = [V({ state: 'superseded' }), V({ state: 'rejected' })];
  assert.equal(certaintyDrift(Q('unknown'), dead), null);
});

test('the rollup finds every drifted question and says which pillar', () => {
  const plan = { QUESTIONS: [{ pillar: 'Data', items: [Q('unknown'), { id: 'q:2', certainty: 'known' }] }] };
  const rows = certaintyDriftRollup(plan, [V()]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pillar, 'Data');
  assert.equal(rows[0].kind, 'answered');
});
