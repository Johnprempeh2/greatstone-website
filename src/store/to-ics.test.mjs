import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toIcs } from './to-ics.mjs';

test('toIcs: builds an all-day VEVENT with DTEND on the next day, CRLF lines', () => {
  const ics = toIcs({ title: 'Kickoff call', date: '2026-07-01', uid: 'gs-1', stamp: '20260601T000000Z' });
  const lines = ics.split('\r\n');
  assert.ok(lines.includes('BEGIN:VCALENDAR'));
  assert.ok(lines.includes('BEGIN:VEVENT'));
  assert.ok(lines.includes('UID:gs-1'));
  assert.ok(lines.includes('DTSTAMP:20260601T000000Z'));
  assert.ok(lines.includes('DTSTART;VALUE=DATE:20260701'));
  assert.ok(lines.includes('DTEND;VALUE=DATE:20260702'));        // exclusive end = next day
  assert.ok(lines.includes('SUMMARY:Kickoff call'));
  assert.ok(lines.includes('END:VCALENDAR'));
  assert.ok(ics.endsWith('\r\n'));
});

test('toIcs: DTEND rolls over month/year boundaries', () => {
  assert.ok(toIcs({ title: 'x', date: '2026-07-31' }).split('\r\n').includes('DTEND;VALUE=DATE:20260801'));
  assert.ok(toIcs({ title: 'x', date: '2026-12-31' }).split('\r\n').includes('DTEND;VALUE=DATE:20270101'));
});

test('toIcs: escapes commas/semicolons/backslashes in text fields', () => {
  const ics = toIcs({ title: 'Review, plan; next', description: 'a\\b', date: '2026-07-01' });
  assert.ok(ics.includes('SUMMARY:Review\\, plan\\; next'));
  assert.ok(ics.includes('DESCRIPTION:a\\\\b'));
});

test('toIcs: omits empty DESCRIPTION/LOCATION, defaults a missing title', () => {
  const ics = toIcs({ date: '2026-07-01' });
  assert.ok(ics.includes('SUMMARY:Greatstone session'));
  assert.ok(!ics.includes('DESCRIPTION:'));
  assert.ok(!ics.includes('LOCATION:'));
});

test('toIcs: returns null for a missing or malformed date', () => {
  assert.equal(toIcs({ title: 'x' }), null);
  assert.equal(toIcs({ title: 'x', date: 'not-a-date' }), null);
  assert.equal(toIcs({ title: 'x', date: '2026-7-1' }), null);   // requires zero-padded YYYY-MM-DD
});
