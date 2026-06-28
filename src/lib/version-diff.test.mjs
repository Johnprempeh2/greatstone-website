import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffVersions, diffProps } from './version-diff.mjs';

const blk = (id, type, props = {}) => ({ type, props: { id, ...props } });
const data = (title, content) => ({ root: { props: { title } }, content });

test('identical snapshots produce an empty diff', () => {
  const d = data('Home', [blk('a', 'Hero', { headline: 'Hi' }), blk('b', 'Quote', { text: 'x' })]);
  const r = diffVersions(d, JSON.parse(JSON.stringify(d)));
  assert.equal(r.counts.total, 0);
  assert.equal(r.titleChanged, null);
});

test('a single field edit is reported as changed with the field path (by value, not reference)', () => {
  const from = data('Home', [blk('a', 'Hero', { headline: 'Old', body: 'same' })]);
  const to = data('Home', [blk('a', 'Hero', { headline: 'New', body: 'same' })]);
  const r = diffVersions(from, to);
  assert.equal(r.counts.changed, 1);
  assert.equal(r.changed[0].type, 'Hero');
  assert.deepEqual(r.changed[0].fields.map((f) => f.path), ['headline']);
});

test('equal string values (re-saved, not edited) do not churn', () => {
  const from = data('Home', [blk('a', 'Hero', { headline: 'Same' })]);
  const to = data('Home', [blk('a', 'Hero', { headline: 'Same' })]); // different object identity, same value
  assert.equal(diffVersions(from, to).counts.total, 0);
});

test('added and removed blocks land in the right buckets, not changed', () => {
  const from = data('Home', [blk('a', 'Hero'), blk('b', 'Quote')]);
  const to = data('Home', [blk('a', 'Hero'), blk('c', 'Faq')]);
  const r = diffVersions(from, to);
  assert.deepEqual(r.added.map((x) => x.type), ['Faq']);
  assert.deepEqual(r.removed.map((x) => x.type), ['Quote']);
  assert.equal(r.counts.changed, 0);
});

test('a pure reorder is reported as moved, not changed', () => {
  const from = data('Home', [blk('a', 'Hero'), blk('b', 'Quote'), blk('c', 'Faq')]);
  const to = data('Home', [blk('c', 'Faq'), blk('a', 'Hero'), blk('b', 'Quote')]);
  const r = diffVersions(from, to);
  assert.equal(r.counts.changed, 0);
  assert.equal(r.counts.added, 0);
  assert.equal(r.counts.removed, 0);
  assert.ok(r.moved.length >= 1 && r.moved.length <= 2); // minimal moved set (LCS keeps the longest run)
  assert.deepEqual(r.moved.map((x) => x.type).sort(), ['Faq']); // moving Faq to the front is the single move
});

test('a nested-array prop edit is summarised, never dumped', () => {
  const from = data('P', [blk('a', 'Pillars', { items: [{ t: '1' }, { t: '2' }] })]);
  const to = data('P', [blk('a', 'Pillars', { items: [{ t: '1' }, { t: 'two' }] })]);
  const r = diffVersions(from, to);
  assert.equal(r.changed.length, 1);
  const f = r.changed[0].fields[0];
  assert.equal(f.kind, 'array');
  assert.equal(f.summary, '1 item edited');
});

test('array length change summarises the count delta', () => {
  const from = data('P', [blk('a', 'Logos', { items: [1, 2] })]);
  const to = data('P', [blk('a', 'Logos', { items: [1, 2, 3] })]);
  assert.equal(diffVersions(from, to).changed[0].fields[0].summary, '3 items (was 2)');
});

test('title changes are detected by value', () => {
  const from = data('Old title', [blk('a', 'Hero')]);
  const to = data('New title', [blk('a', 'Hero')]);
  const r = diffVersions(from, to);
  assert.deepEqual(r.titleChanged, { from: 'Old title', to: 'New title' });
  assert.equal(r.counts.total, 1);
});

test('id-less legacy blocks fall back to index pairing without crashing', () => {
  const from = { root: { props: { title: 'X' } }, content: [{ type: 'Hero', props: { headline: 'A' } }] };
  const to = { root: { props: { title: 'X' } }, content: [{ type: 'Hero', props: { headline: 'B' } }] };
  const r = diffVersions(from, to);
  assert.equal(r.counts.changed, 1); // paired by index '@idx-0'
});

test('missing / partial data shapes are tolerated', () => {
  assert.equal(diffVersions(null, null).counts.total, 0);
  assert.equal(diffVersions({}, {}).counts.total, 0);
  const r = diffVersions({ content: [blk('a', 'Hero')] }, { content: [] });
  assert.equal(r.counts.removed, 1);
});

test('diffProps skips id and flags cleared vs added vs changed', () => {
  assert.deepEqual(diffProps({ id: 'x', a: 'one' }, { id: 'y', a: 'two' }).map((f) => f.kind), ['changed']);
  assert.equal(diffProps({ a: '' }, { a: 'now set' })[0].kind, 'added');
  assert.equal(diffProps({ a: 'was set' }, { a: '' })[0].kind, 'cleared');
});
