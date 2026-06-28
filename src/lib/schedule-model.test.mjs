import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pageSchedule, classifySchedule, listSchedules, describeDue,
  setSchedule, clearSchedule, isLiveCurrent, toLocalInput,
} from './schedule-model.mjs';

const NOW = Date.parse('2026-07-01T12:00');
const DAY = 86400000;
const page = (over = {}) => ({ title: 'P', status: 'draft', data: { x: 1 }, published: null, ...over });
const stateOf = (pages) => ({ order: Object.keys(pages), pages });

test('pageSchedule: additive-field safety — no publishAt → null, never throws', () => {
  assert.equal(pageSchedule(page()), null);
  assert.equal(pageSchedule(page({ publishAt: null })), null);
  assert.equal(pageSchedule(page({ publishAt: 'oops' })), null);
  assert.equal(pageSchedule(undefined), null);
  assert.equal(pageSchedule(page({ publishAt: NOW })), NOW);
});

test('classify: none / scheduled / overdue', () => {
  assert.equal(classifySchedule(page(), NOW), 'none');
  assert.equal(classifySchedule(page({ publishAt: NOW + 1000 }), NOW), 'scheduled');
  assert.equal(classifySchedule(page({ publishAt: NOW - 1000 }), NOW), 'overdue');
});

test('classify: boundary publishAt === now is overdue (<= now), not scheduled', () => {
  assert.equal(classifySchedule(page({ publishAt: NOW }), NOW), 'overdue');
});

test('classify: past embargo but already live & current → none (spent, no nag)', () => {
  const live = page({ status: 'published', data: { x: 1 }, published: { x: 1 }, publishAt: NOW - 5000 });
  assert.equal(isLiveCurrent(live), true);
  assert.equal(classifySchedule(live, NOW), 'none');
});

test('classify: published but DRIFTED (data !== published) past embargo → overdue', () => {
  const drift = page({ status: 'published', data: { x: 2 }, published: { x: 1 }, publishAt: NOW - 5000 });
  assert.equal(classifySchedule(drift, NOW), 'overdue');
});

test('listSchedules: grouping + sort (scheduled asc, overdue asc), none excluded', () => {
  const pages = {
    a: page({ publishAt: NOW + 3 * DAY }),
    b: page({ publishAt: NOW + 1 * DAY }),
    c: page({ publishAt: NOW - 2 * DAY }),
    d: page({ publishAt: NOW - 1 * DAY }),
    e: page(),
  };
  const { scheduled, overdue } = listSchedules(stateOf(pages), NOW);
  assert.deepEqual(scheduled.map((x) => x.slug), ['b', 'a']);
  assert.deepEqual(overdue.map((x) => x.slug), ['c', 'd']);
  assert.equal(scheduled[0].bucket, 'scheduled');
  assert.equal(overdue[0].bucket, 'overdue');
});

test('listSchedules: empty / missing pages safe', () => {
  assert.deepEqual(listSchedules({ order: [], pages: {} }, NOW), { scheduled: [], overdue: [] });
  assert.deepEqual(listSchedules({}, NOW), { scheduled: [], overdue: [] });
});

test('describeDue: relative strings, both directions', () => {
  assert.equal(describeDue(NOW + 3 * DAY, NOW), 'in 3 days');
  assert.equal(describeDue(NOW + 1 * DAY, NOW), 'tomorrow');
  assert.equal(describeDue(NOW - 2 * DAY, NOW), '2 days overdue');
  assert.equal(describeDue(NOW - 1 * DAY, NOW), '1 day overdue');
  assert.equal(describeDue(NOW + 5 * 3600000, NOW), 'in 5 h');
  assert.equal(describeDue(NOW - 5 * 3600000, NOW), '5 h overdue');
  assert.equal(describeDue(NOW, NOW), 'now');
  assert.equal(describeDue('nope', NOW), '');
});

test('setSchedule: returns NEW state, sets stamp, no mutation', () => {
  const s0 = stateOf({ a: page() });
  const s1 = setSchedule(s0, 'a', NOW);
  assert.equal(s1.pages.a.publishAt, NOW);
  assert.equal(s0.pages.a.publishAt, undefined);
  assert.notEqual(s1, s0);
  assert.notEqual(s1.pages.a, s0.pages.a);
});

test('setSchedule: unknown slug returns state unchanged', () => {
  const s0 = stateOf({ a: page() });
  assert.equal(setSchedule(s0, 'zzz', NOW), s0);
});

test('set then clear roundtrip — clear actually REMOVES the embargo', () => {
  let s = stateOf({ a: page() });
  s = setSchedule(s, 'a', NOW + 1000);
  assert.equal(classifySchedule(s.pages.a, NOW), 'scheduled');
  s = clearSchedule(s, 'a');
  assert.equal(s.pages.a.publishAt, null);
  assert.equal(pageSchedule(s.pages.a), null);
  assert.equal(classifySchedule(s.pages.a, NOW), 'none');
});

test('toLocalInput: ms → datetime-local value, blank for non-finite', () => {
  assert.match(toLocalInput(NOW), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.equal(toLocalInput(null), '');
});
