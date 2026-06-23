import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil, expiryInfo, isExpiringSoon } from './licence-expiry.mjs';

const NOW = Date.UTC(2026, 5, 23, 12, 0, 0); // fixed reference so the tests are deterministic
const inDays = (n) => new Date(NOW + n * 86400000).toISOString();

test('daysUntil: guards absent + Invalid Date, never throws', () => {
  assert.equal(daysUntil(null, NOW), null);
  assert.equal(daysUntil(undefined, NOW), null);
  assert.equal(daysUntil('not-a-date', NOW), null);
  assert.equal(daysUntil(inDays(10), NOW), 10);
  assert.equal(daysUntil(inDays(-3), NOW), -3);
});

test('expiryInfo: red once past', () => {
  const info = expiryInfo(inDays(-1), 30, NOW);
  assert.equal(info.kind, 'over');
  assert.equal(info.label, 'Expired');
  assert.equal(info.cls, 'lk-exp-over');
});

test('expiryInfo: amber within the soon window, with day count', () => {
  assert.equal(expiryInfo(inDays(0), 30, NOW).label, 'Expires today');
  assert.equal(expiryInfo(inDays(1), 30, NOW).label, 'Expires in 1 day');
  const soon = expiryInfo(inDays(10), 30, NOW);
  assert.equal(soon.kind, 'soon');
  assert.equal(soon.label, 'Expires in 10 days');
  assert.equal(soon.cls, 'lk-exp-soon');
});

test('expiryInfo: nothing past the window (kind ok, empty label) + null for no date', () => {
  const ok = expiryInfo(inDays(45), 30, NOW);
  assert.equal(ok.kind, 'ok');
  assert.equal(ok.label, '');
  assert.equal(expiryInfo(null, 30, NOW), null);
  assert.equal(expiryInfo('garbage', 30, NOW), null);
});

test('isExpiringSoon: only issued keys inside the window, past excluded', () => {
  assert.equal(isExpiringSoon({ status: 'issued', expires_at: inDays(10) }, 30, NOW), true);
  assert.equal(isExpiringSoon({ status: 'issued', expires_at: inDays(0) }, 30, NOW), true);
  assert.equal(isExpiringSoon({ status: 'issued', expires_at: inDays(45) }, 30, NOW), false); // outside window
  assert.equal(isExpiringSoon({ status: 'issued', expires_at: inDays(-2) }, 30, NOW), false); // already past
  assert.equal(isExpiringSoon({ status: 'expired', expires_at: inDays(10) }, 30, NOW), false); // not issued
  assert.equal(isExpiringSoon({ status: 'issued', expires_at: null }, 30, NOW), false); // no expiry
  assert.equal(isExpiringSoon(null, 30, NOW), false);
});
