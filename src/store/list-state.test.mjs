import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listState } from './list-state.mjs';

test('listState: loading wins over everything', () => {
  assert.equal(listState(true, null, []), 'loading');
  assert.equal(listState(true, new Error('x'), [{ id: 1 }]), 'loading');
});

test('listState: error wins over empty AND over stale rows (never shows the empty copy on a failure)', () => {
  assert.equal(listState(false, new Error('boom'), []), 'error');
  assert.equal(listState(false, new Error('boom'), null), 'error');
  assert.equal(listState(false, { message: 'rls' }, [{ id: 1 }]), 'error'); // keep-prior-rows on error still reads as error
});

test('listState: empty only when loaded, no error, and no rows', () => {
  assert.equal(listState(false, null, []), 'empty');
  assert.equal(listState(false, null, null), 'empty');       // null rows (not yet an array) with no loading flag = empty
  assert.equal(listState(false, null, undefined), 'empty');
});

test('listState: rows when loaded, no error, and at least one row', () => {
  assert.equal(listState(false, null, [{ id: 1 }]), 'rows');
  assert.equal(listState(false, null, [{ id: 1 }, { id: 2 }]), 'rows');
});
