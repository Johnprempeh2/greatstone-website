import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canBulk, bulkSetStatus, bulkActions, SAFE_STATUSES } from './bulk-status.mjs';

// NOTE: deliberately does NOT import store.js — it imports puck.config.jsx (JSX), which bare
// `node --test` cannot load. The reversible edges below are the source of truth at store.js:78:
//   TRANSITIONS = { draft:['review'], review:['approved','draft'], approved:['published','draft'], published:['draft'] }
// The two reversible, non-gated edges this engine is allowed to apply: draft<->review.

const NOW = Date.parse('2026-07-01T12:00');
const page = (status, over = {}) => ({ title: status, status, data: { x: 1 }, published: { x: 1 }, approvedBy: null, statusHistory: [], ...over });
const stateOf = (pages) => ({ order: Object.keys(pages), pages });

test('canBulk truth table — only the two reversible edges are true', () => {
  assert.equal(canBulk('draft', 'review'), true);
  assert.equal(canBulk('review', 'draft'), true);
  // gated / illegal targets are all false:
  assert.equal(canBulk('draft', 'approved'), false);
  assert.equal(canBulk('review', 'published'), false);
  assert.equal(canBulk('approved', 'draft'), false);   // store allows it, bulk does NOT
  assert.equal(canBulk('published', 'draft'), false);  // store allows it, bulk does NOT
  assert.equal(canBulk('draft', 'published'), false);
});

test('drift guard: SAFE_STATUSES are exactly draft + review (kept in sync with store.js:78)', () => {
  assert.deepEqual([...SAFE_STATUSES].sort(), ['draft', 'review']);
});

test('draft→review moves only drafts; others no-op; moved counted', () => {
  const r = bulkSetStatus(stateOf({ a: page('draft'), b: page('review'), c: page('approved') }), ['a', 'b', 'c'], 'review', 'me', NOW);
  assert.equal(r.moved, 1);
  assert.equal(r.state.pages.a.status, 'review');
  assert.equal(r.state.pages.b.status, 'review'); // already review, unchanged
  assert.equal(r.state.pages.c.status, 'approved');
});

test('review→draft round-trip; statusHistory grows by one per move with {from,to,by,ts}, no note', () => {
  let s = stateOf({ a: page('draft') });
  s = bulkSetStatus(s, ['a'], 'review', 'me', NOW).state;
  s = bulkSetStatus(s, ['a'], 'draft', 'me', NOW + 1000).state;
  assert.equal(s.pages.a.status, 'draft');
  assert.equal(s.pages.a.statusHistory.length, 2);
  const e = s.pages.a.statusHistory[1];
  assert.deepEqual(e, { from: 'review', to: 'draft', by: 'me', ts: NOW + 1000 });
  assert.ok(!('note' in e));
});

test('LOAD-BEARING SAFETY: an approved/published page is NEVER moved by any bulk call', () => {
  const s0 = stateOf({ p: page('approved') });
  assert.equal(bulkSetStatus(s0, ['p'], 'review', 'me', NOW).moved, 0); // canBulk(approved,review) false
  assert.equal(bulkSetStatus(s0, ['p'], 'draft', 'me', NOW).moved, 0);  // store allows, bulk does not
  assert.equal(bulkSetStatus(s0, ['p'], 'approved', 'me', NOW).moved, 0); // approved not a safe target
  assert.equal(bulkSetStatus(s0, ['p'], 'published', 'me', NOW).moved, 0);
  const pub = stateOf({ p: page('published') });
  assert.equal(bulkSetStatus(pub, ['p'], 'draft', 'me', NOW).moved, 0);
  assert.equal(bulkSetStatus(pub, ['p'], 'review', 'me', NOW).moved, 0);
});

test('a successful move touches ONLY status + statusHistory (data/published/approvedBy untouched)', () => {
  const before = page('draft', { data: { x: 1, y: [2, 3] }, published: { x: 9 }, approvedBy: 'someone' });
  const r = bulkSetStatus(stateOf({ a: before }), ['a'], 'review', 'me', NOW);
  assert.deepEqual(r.state.pages.a.data, { x: 1, y: [2, 3] });
  assert.deepEqual(r.state.pages.a.published, { x: 9 });
  assert.equal(r.state.pages.a.approvedBy, 'someone');
});

test('ghost / unknown / empty slugs are safe (moved 0, same state reference)', () => {
  const s0 = stateOf({ a: page('draft') });
  const r1 = bulkSetStatus(s0, ['nope'], 'review', 'me', NOW);
  assert.equal(r1.moved, 0);
  assert.equal(r1.state, s0);
  assert.equal(bulkSetStatus(s0, [], 'review', 'me', NOW).moved, 0);
  assert.equal(bulkSetStatus(s0, ['a'], 'bogus', 'me', NOW).moved, 0); // unsafe target
});

test('bulkActions: [] on empty/mixed/all-gated; one transition on uniform', () => {
  const pages = { a: page('draft'), b: page('draft'), r: page('review'), ap: page('approved') };
  assert.deepEqual(bulkActions(pages, []), []);
  assert.deepEqual(bulkActions(pages, ['a', 'r']), []); // mixed
  assert.deepEqual(bulkActions(pages, ['ap']), []);     // all-gated → no safe edge
  assert.deepEqual(bulkActions(pages, ['a', 'b']), [{ from: 'draft', to: 'review', count: 2 }]);
  assert.deepEqual(bulkActions(pages, ['r']), [{ from: 'review', to: 'draft', count: 1 }]);
  assert.deepEqual(bulkActions(pages, ['a', 'nope']), [{ from: 'draft', to: 'review', count: 1 }]); // ghost filtered
});

test('ts/by passthrough + null fallback', () => {
  const r = bulkSetStatus(stateOf({ a: page('draft') }), ['a'], 'review', undefined, NaN);
  const e = r.state.pages.a.statusHistory[0];
  assert.equal(e.by, null);
  assert.equal(e.ts, null);
});

test('never mutates the input state', () => {
  const s0 = stateOf({ a: page('draft') });
  const histRef = s0.pages.a.statusHistory;
  const r = bulkSetStatus(s0, ['a'], 'review', 'me', NOW);
  assert.equal(s0.pages.a.status, 'draft');
  assert.equal(s0.pages.a.statusHistory, histRef);
  assert.equal(s0.pages.a.statusHistory.length, 0);
  assert.notEqual(r.state, s0);
});
