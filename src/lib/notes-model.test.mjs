import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageNote, setNote, clearNote, listNotes, describeNoteAge } from './notes-model.mjs';

const NOW = Date.parse('2026-07-01T12:00');
const page = (over = {}) => ({ title: 'P', status: 'draft', ...over });
const stateOf = (pages) => ({ order: Object.keys(pages), pages });

test('pageNote: absent / null / blank-text all collapse to null (never throws)', () => {
  assert.equal(pageNote(page()), null);
  assert.equal(pageNote(page({ note: null })), null);
  assert.equal(pageNote(page({ note: { text: '   ' } })), null);
  assert.equal(pageNote(page({ note: { text: '' } })), null);
  assert.equal(pageNote(undefined), null);
});

test('pageNote: a real note round-trips text/by/ts', () => {
  const n = pageNote(page({ note: { text: 'hi', by: 'a@b.com', ts: NOW } }));
  assert.deepEqual(n, { text: 'hi', by: 'a@b.com', ts: NOW });
});

test('setNote: sets + trims surrounding whitespace; read round-trips', () => {
  const s = setNote(stateOf({ a: page() }), 'a', '  waiting on legal  ', 'me', NOW);
  assert.deepEqual(pageNote(s.pages.a), { text: 'waiting on legal', by: 'me', ts: NOW });
});

test('setNote with blank/whitespace text routes to clear (no note)', () => {
  let s = setNote(stateOf({ a: page() }), 'a', 'note', 'me', NOW);
  s = setNote(s, 'a', '   ', 'me', NOW);
  assert.equal(pageNote(s.pages.a), null);
  assert.equal(s.pages.a.note, null);
});

test('setNote / clearNote on unknown slug return state unchanged (no throw)', () => {
  const s0 = stateOf({ a: page() });
  assert.equal(setNote(s0, 'zzz', 'x', 'me', NOW), s0);
  assert.equal(clearNote(s0, 'zzz'), s0);
});

test('setNote does NOT mutate the input state', () => {
  const s0 = stateOf({ a: page() });
  const s1 = setNote(s0, 'a', 'hello', 'me', NOW);
  assert.equal(s0.pages.a.note, undefined);
  assert.notEqual(s1, s0);
  assert.notEqual(s1.pages.a, s0.pages.a);
});

test('clearNote after set removes the note (pageNote → null)', () => {
  let s = setNote(stateOf({ a: page() }), 'a', 'temp', 'me', NOW);
  s = clearNote(s, 'a');
  assert.equal(s.pages.a.note, null);
  assert.equal(pageNote(s.pages.a), null);
});

test('listNotes: only annotated pages, newest-first; null ts sinks to bottom', () => {
  const pages = {
    a: page({ note: { text: 'old', by: 'x', ts: NOW - 5000 } }),
    b: page({ note: { text: 'new', by: 'y', ts: NOW } }),
    c: page(),
    d: page({ note: { text: 'no-ts', by: 'z', ts: null } }),
  };
  const out = listNotes(stateOf(pages));
  assert.deepEqual(out.map((n) => n.slug), ['b', 'a', 'd']);
  assert.equal(out[0].text, 'new');
});

test('listNotes: empty / missing state → []', () => {
  assert.deepEqual(listNotes(stateOf({})), []);
  assert.deepEqual(listNotes({}), []);
});

test('describeNoteAge: boundaries + non-finite guard', () => {
  assert.equal(describeNoteAge(NOW, NOW), 'just now');
  assert.equal(describeNoteAge(NOW - 5 * 60000, NOW), '5 min ago');
  assert.equal(describeNoteAge(NOW - 3 * 3600000, NOW), '3 h ago');
  assert.equal(describeNoteAge(NOW - 2 * 86400000, NOW), '2 days ago');
  assert.equal(describeNoteAge(NOW - 1 * 86400000, NOW), '1 day ago');
  assert.equal(describeNoteAge('nope', NOW), '');
  assert.equal(describeNoteAge(NOW + 5000, NOW), 'just now'); // future clamps to 0 → just now
});
