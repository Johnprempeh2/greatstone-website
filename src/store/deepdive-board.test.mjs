// The workflow board: what it will draw, and what it refuses to.
//
// This module had no test of any kind, and it is the one place in the record that decides whether
// to draw a ROW OF ARROWS. That is a claim about sequence, and the record's governing rule is that
// position is layout and never a claim: an arrow needs a recorded handoff behind it. So the
// interesting assertions here are all about refusal, because a board that guesses an order is
// worse than one that says it does not know.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chainOf, processesForOffering, handoffsWithin, unnamedProcesses, driftOf, defaultOffering }
  from './deepdive-board.mjs';

const P = (num, feeds = []) => ({ id: `p:${num}`, num, name: `Process ${num}`, feeds });

test('a chain is drawn only when the handoffs order every member', () => {
  const a = P('01', ['02']); const b = P('02', ['03']); const c = P('03');
  assert.deepEqual(chainOf([a, b, c]).map((p) => p.num), ['01', '02', '03']);

  // No edges at all: membership is not sequence.
  assert.equal(chainOf([P('01'), P('02')]), null, 'two processes with no recorded handoff are not a chain');
  // A fork: 01 feeds both 02 and 03, so there is no single path through them.
  assert.equal(chainOf([P('01', ['02', '03']), P('02'), P('03')]), null, 'a fork is not a chain');
  // Two roots: nothing says which comes first.
  assert.equal(chainOf([P('01', ['03']), P('02', ['03']), P('03')]), null, 'a join has no single start');
  // Partially ordered: 01 feeds 02, and 03 floats.
  assert.equal(chainOf([P('01', ['02']), P('02'), P('03')]), null, 'a member outside the path means no path');
});

test('a chain is not broken by a cycle', () => {
  // ⚠ A cycle would hang a naive walk. Two processes feeding each other order nothing.
  assert.equal(chainOf([P('01', ['02']), P('02', ['01'])]), null, 'a two-process cycle is not a chain');
  assert.equal(chainOf([P('01', ['02']), P('02', ['03']), P('03', ['01'])]), null, 'a three-process cycle is not a chain');
});

test('one handoff written twice is still one handoff', () => {
  // The schema dedupes `feeds` on write and has never done it on load, so a row stored before that
  // check can carry the same number twice. Counted raw it reads as a fork and hides a real chain.
  const chain = chainOf([P('01', ['02', '02']), P('02', ['03']), P('03')]);
  assert.ok(chain, 'a duplicated edge was read as a fork, so a provable chain was refused');
  assert.deepEqual(chain.map((p) => p.num), ['01', '02', '03']);
});

test('a single member is its own chain, and nothing is nothing', () => {
  assert.deepEqual(chainOf([P('01')]).map((p) => p.num), ['01']);
  assert.equal(chainOf([]), null);
});

test('an offering reads its own side of the link, and unresolved numbers drop out', () => {
  const plan = {
    PROCESSES: [P('01'), P('02')],
    OFFERINGS: [{ id: 'o:1', ref: '01', name: 'Tracking', processes: ['01', '99', '01'] }],
  };
  const got = processesForOffering(plan, plan.OFFERINGS[0]);
  assert.deepEqual(got.map((p) => p.num), ['01'],
    'a number that resolves to nothing must drop, and a repeat must not double the member');
  assert.deepEqual(processesForOffering(plan, null), []);
});

test('the two mirrors disagreeing is reported, never merged', () => {
  const plan = {
    PROCESSES: [
      { ...P('01'), offerings: ['01'] },        // says it serves Tracking
      { ...P('02'), offerings: ['ZZ'] },        // names an offering that is not here
    ],
    OFFERINGS: [{ id: 'o:1', ref: '01', name: 'Tracking', processes: ['03'] }],
  };
  const drift = driftOf(plan);
  // 01 is not named back; 02 names a ref that does not resolve; the offering names a missing 03.
  assert.equal(drift.length, 3, `expected all three shapes of disagreement, got ${drift.length}`);
  assert.ok(drift.some((d) => d.process?.num === '01' && d.offering?.name === 'Tracking'));
  assert.ok(drift.some((d) => d.process?.num === '02' && d.ref === 'ZZ' && !d.offering));
  assert.ok(drift.some((d) => d.offering?.ref === '01' && d.ref === '03' && !d.process));
  // And the union is NOT taken: the offering's own list still wins.
  assert.deepEqual(processesForOffering(plan, plan.OFFERINGS[0]).map((p) => p.num), [],
    'the process claiming to serve this offering must not be merged into its members');
});

test('a process no offering names is unnamed, not universal', () => {
  const plan = {
    PROCESSES: [P('01'), P('02')],
    OFFERINGS: [{ id: 'o:1', ref: '01', name: 'Tracking', processes: ['01'] }],
  };
  assert.deepEqual(unnamedProcesses(plan).map((p) => p.num), ['02']);
  assert.deepEqual(unnamedProcesses({ PROCESSES: [P('01')] }).map((p) => p.num), ['01'],
    'with no offerings at all, every process is unnamed rather than shared by all');
});

test('handoffs within a set only count edges to members', () => {
  const inside = handoffsWithin([P('01', ['02', '99']), P('02')]);
  assert.equal(inside.length, 1, 'an edge pointing outside the set is not a handoff within it');
  assert.equal(inside[0].from.num, '01');
  assert.equal(inside[0].to.num, '02');
});

test('the board opens on the offering with the most recorded', () => {
  const plan = {
    PROCESSES: [P('01'), P('02')],
    OFFERINGS: [
      { id: 'o:1', ref: '01', name: 'Empty', processes: [] },
      { id: 'o:2', ref: '02', name: 'Full', processes: ['01', '02'] },
    ],
  };
  assert.equal(defaultOffering(plan).name, 'Full');
  // ⚠ Not null when everything is empty: a board with no default renders no lane at all.
  assert.equal(defaultOffering({ OFFERINGS: [{ id: 'o:1', ref: '01', name: 'Only', processes: [] }] }).name, 'Only');
  assert.equal(defaultOffering({ OFFERINGS: [] }), null);
});
