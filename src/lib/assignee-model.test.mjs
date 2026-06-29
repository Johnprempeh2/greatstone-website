import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageAssignee, setAssignee, clearAssignee, listAssignees } from './assignee-model.mjs';

const NOW = Date.parse('2026-07-01T12:00');
const page = (over = {}) => ({ title: 't', status: 'draft', data: { x: 1 }, ...over });
const stateOf = (pages) => ({ order: Object.keys(pages), pages });

test('setAssignee then pageAssignee round-trips who/by/ts', () => {
  const s = setAssignee(stateOf({ a: page() }), 'a', 'ben@x', 'me@x', NOW);
  assert.deepEqual(pageAssignee(s.pages.a), { who: 'ben@x', by: 'me@x', ts: NOW });
});

test('clearAssignee undoes setAssignee (true round-trip to unset)', () => {
  const s0 = stateOf({ a: page() });
  const set = setAssignee(s0, 'a', 'ben@x', 'me@x', NOW);
  const cleared = clearAssignee(set, 'a');
  assert.equal(pageAssignee(cleared.pages.a), null);
});

test('blank / whitespace who routes to clear (canonical unassigned)', () => {
  const s = setAssignee(stateOf({ a: page({ assignee: { who: 'old' } }) }), 'a', '   ', 'me@x', NOW);
  assert.equal(pageAssignee(s.pages.a), null);
  assert.equal(s.pages.a.assignee, null);
});

test('by / ts null fallback (undefined, NaN → null)', () => {
  const s = setAssignee(stateOf({ a: page() }), 'a', 'ben@x', undefined, NaN);
  assert.deepEqual(pageAssignee(s.pages.a), { who: 'ben@x', by: null, ts: null });
});

test('never mutates input; returns a new state ref', () => {
  const s0 = stateOf({ a: page() });
  const s1 = setAssignee(s0, 'a', 'ben@x', 'me@x', NOW);
  assert.notEqual(s1, s0);
  assert.equal(s0.pages.a.assignee, undefined); // original untouched
});

test('ghost slug → returns the same state ref unchanged', () => {
  const s0 = stateOf({ a: page() });
  assert.equal(setAssignee(s0, 'nope', 'x', 'me', NOW), s0);
  assert.equal(clearAssignee(s0, 'nope'), s0);
});

test('only page.assignee changes — data / status untouched', () => {
  const s = setAssignee(stateOf({ a: page() }), 'a', 'ben@x', 'me@x', NOW);
  assert.deepEqual(s.pages.a.data, { x: 1 });
  assert.equal(s.pages.a.status, 'draft');
});

test('listAssignees: only assigned pages, newest-first, null ts sinks', () => {
  const s = stateOf({
    a: page({ assignee: { who: 'ann', by: 'me', ts: NOW } }),
    b: page(),
    c: page({ assignee: { who: 'cal', by: 'me', ts: NOW + 1000 } }),
    d: page({ assignee: { who: 'dot', by: 'me', ts: null } }),
  });
  const list = listAssignees(s);
  assert.deepEqual(list.map((x) => x.slug), ['c', 'a', 'd']); // b unassigned dropped; d (null ts) last
  assert.equal(list[0].who, 'cal');
});
