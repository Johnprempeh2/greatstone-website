import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asLocalDate } from './local-date.mjs';

test('asLocalDate: a date-only string is the local calendar day, not UTC midnight', () => {
  const d = asLocalDate('2026-04-01');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 3); // April, in the viewer's zone, wherever they are
  assert.equal(d.getDate(), 1);
  assert.equal(d.getHours(), 0);
});

test('asLocalDate: the month-end mirror image holds too', () => {
  const d = asLocalDate('2026-03-31');
  assert.equal(d.getMonth(), 2);
  assert.equal(d.getDate(), 31);
});

test('asLocalDate: a real instant is passed through untouched', () => {
  const iso = '2026-04-01T09:30:00Z';
  assert.equal(asLocalDate(iso).getTime(), new Date(iso).getTime());
  assert.equal(asLocalDate('2026-04-01T09:30:00+00:00').getTime(), new Date('2026-04-01T09:30:00+00:00').getTime());
});

test('asLocalDate: surrounding whitespace on a date-only value still reads as that day', () => {
  const d = asLocalDate('  2026-04-01  ');
  assert.equal(d.getMonth(), 3);
  assert.equal(d.getDate(), 1);
});

test('asLocalDate: non-strings and junk keep Date\'s own behaviour, so caller guards still fire', () => {
  const now = new Date('2026-04-01T09:30:00Z');
  assert.equal(asLocalDate(now).getTime(), now.getTime());
  assert.equal(asLocalDate(1775030400000).getTime(), 1775030400000);
  assert.ok(Number.isNaN(asLocalDate('not-a-date').getTime()));
  assert.ok(Number.isNaN(asLocalDate(undefined).getTime()));
});
