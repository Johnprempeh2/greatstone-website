import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bulkSetSchedule, bulkClearSchedule, bulkSetNote, bulkClearNote, bulkSetAssignee, bulkClearAssignee } from './bulk-meta.mjs';
import { pageSchedule, classifySchedule } from './schedule-model.mjs';
import { pageNote } from './notes-model.mjs';
import { pageAssignee } from './assignee-model.mjs';

const NOW = Date.parse('2026-07-01T12:00');
const SOON = NOW + 86400000;
const page = (over = {}) => ({ title: 't', status: 'draft', data: { x: 1 }, published: { x: 1 }, ...over });
const stateOf = (pages) => ({ order: Object.keys(pages), pages });
const S3 = () => stateOf({ a: page(), b: page(), c: page() });

test('bulkSetSchedule: one date across the selection (persona 1)', () => {
  const { state, count } = bulkSetSchedule(S3(), ['a', 'b', 'c'], SOON);
  assert.equal(count, 3);
  for (const slug of ['a', 'b', 'c']) {
    assert.equal(pageSchedule(state.pages[slug]), SOON);
    assert.equal(classifySchedule(state.pages[slug], NOW), 'scheduled');
  }
});

test('bulkSetNote: same note on each (persona 2)', () => {
  const { state, count } = bulkSetNote(stateOf({ a: page(), b: page() }), ['a', 'b'], 'needs legal sign-off', 'me@x', NOW);
  assert.equal(count, 2);
  for (const slug of ['a', 'b']) {
    assert.deepEqual(pageNote(state.pages[slug]), { text: 'needs legal sign-off', by: 'me@x', ts: NOW });
  }
});

test('bulkSetAssignee: assign N to one owner (the new verb)', () => {
  const { state, count } = bulkSetAssignee(S3(), ['a', 'b', 'c'], 'ben@x', 'me@x', NOW);
  assert.equal(count, 3);
  for (const slug of ['a', 'b', 'c']) {
    assert.deepEqual(pageAssignee(state.pages[slug]), { who: 'ben@x', by: 'me@x', ts: NOW });
  }
});

test('clear undoes set for all three (reversibility proof)', () => {
  let s = bulkSetSchedule(S3(), ['a', 'b'], SOON).state;
  s = bulkSetNote(s, ['a', 'b'], 'x', 'me', NOW).state;
  s = bulkSetAssignee(s, ['a', 'b'], 'ben', 'me', NOW).state;
  s = bulkClearSchedule(s, ['a', 'b']).state;
  s = bulkClearNote(s, ['a', 'b']).state;
  s = bulkClearAssignee(s, ['a', 'b']).state;
  for (const slug of ['a', 'b']) {
    assert.equal(pageSchedule(s.pages[slug]), null);
    assert.equal(pageNote(s.pages[slug]), null);
    assert.equal(pageAssignee(s.pages[slug]), null);
  }
});

test('ADDITIVE — data / published / status never touched by any of the six', () => {
  let s = S3();
  s = bulkSetSchedule(s, ['a'], SOON).state;
  s = bulkSetNote(s, ['a'], 'x', 'me', NOW).state;
  s = bulkSetAssignee(s, ['a'], 'ben', 'me', NOW).state;
  assert.deepEqual(s.pages.a.data, { x: 1 });
  assert.deepEqual(s.pages.a.published, { x: 1 });
  assert.equal(s.pages.a.status, 'draft');
});

test('ghost / empty / unknown slugs no-op → count 0 and SAME state ref', () => {
  const s0 = S3();
  assert.equal(bulkSetSchedule(s0, ['nope'], SOON).state, s0);
  assert.equal(bulkSetSchedule(s0, ['nope'], SOON).count, 0);
  assert.equal(bulkSetNote(s0, [], 't', 'me', NOW).count, 0);
  assert.equal(bulkSetAssignee(s0, ['nope'], 'ben', 'me', NOW).state, s0);
});

test('invalid ts no-ops (no NaN publishAt)', () => {
  const s0 = S3();
  const r = bulkSetSchedule(s0, ['a'], NaN);
  assert.equal(r.count, 0);
  assert.equal(r.state, s0);
});

test('blank text/who route to clear (per-slug helper semantics inherited)', () => {
  const s = stateOf({ a: page({ note: { text: 'old', by: 'm', ts: NOW }, assignee: { who: 'old' } }) });
  assert.equal(pageNote(bulkSetNote(s, ['a'], '   ', 'me', NOW).state.pages.a), null);
  assert.equal(pageAssignee(bulkSetAssignee(s, ['a'], '  ', 'me', NOW).state.pages.a), null);
});

test('never mutates input; new ref when count > 0', () => {
  const s0 = S3();
  const r = bulkSetAssignee(s0, ['a'], 'ben', 'me', NOW);
  assert.notEqual(r.state, s0);
  assert.equal(s0.pages.a.assignee, undefined);
});

test('by / ts null fallback flows through the fold', () => {
  const { state } = bulkSetAssignee(S3(), ['a'], 'x', undefined, NaN);
  assert.deepEqual(pageAssignee(state.pages.a), { who: 'x', by: null, ts: null });
});
