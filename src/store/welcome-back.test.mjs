import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstNameOf, sinceLastVisit } from './welcome-back.mjs';

// minimal in-memory storage stub
const mkStore = (seed) => { const m = new Map(seed ? [['k', String(seed)]] : []); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), _get: (k) => m.get(k) }; };
const NOW = Date.UTC(2026, 5, 23, 12, 0, 0);
const daysAgo = (n) => NOW - n * 86400000;

test('firstNameOf: first token, trimmed, empty-safe', () => {
  assert.equal(firstNameOf('John Prempeh'), 'John');
  assert.equal(firstNameOf('  Rama  '), 'Rama');
  assert.equal(firstNameOf(''), '');
  assert.equal(firstNameOf(null), '');
});

test('sinceLastVisit: first visit returns null but records now', () => {
  const s = mkStore();
  assert.equal(sinceLastVisit('k', { now: NOW, storage: s }), null);
  assert.equal(s._get('k'), String(NOW)); // recorded for next time
});

test('sinceLastVisit: friendly gaps for a prior visit', () => {
  assert.equal(sinceLastVisit('k', { now: NOW, storage: mkStore(daysAgo(0)) }), 'last here earlier today');
  assert.equal(sinceLastVisit('k', { now: NOW, storage: mkStore(daysAgo(1)) }), 'last here yesterday');
  assert.equal(sinceLastVisit('k', { now: NOW, storage: mkStore(daysAgo(5)) }), 'last here 5 days ago');
});

test('sinceLastVisit: overwrites the stored timestamp with now', () => {
  const s = mkStore(daysAgo(3));
  sinceLastVisit('k', { now: NOW, storage: s });
  assert.equal(s._get('k'), String(NOW));
});

test('sinceLastVisit: guards junk values, missing storage, and backwards clocks', () => {
  assert.equal(sinceLastVisit('k', { now: NOW, storage: mkStore('not-a-number') }), null);
  assert.equal(sinceLastVisit('k', { now: NOW, storage: null }), null);
  assert.equal(sinceLastVisit('', { now: NOW, storage: mkStore(daysAgo(2)) }), null);
  assert.equal(sinceLastVisit('k', { now: NOW, storage: mkStore(NOW + 86400000) }), null); // stored in the future
});
