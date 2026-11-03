import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { legacyHashDestination, keepLandingQuery } from '../../../next-proof/legacy-hashes.mjs';
import { takeVerifiedQuery } from '../../../src/lib/auth-landing.mjs';

test('verification redirect /?verified=1#account reaches /account with the marker', () => {
  const destination = legacyHashDestination('#account', '/', []);
  assert.equal(keepLandingQuery(destination, '?verified=1'), '/account?verified=1');
});

test('Next /account reads the verified marker once and drops it from the URL', () => {
  const calls = [];
  const history = { state: { next: true }, replaceState: (...args) => calls.push(args) };
  const location = { href: 'https://example.test/account?verified=1&source=email' };
  assert.equal(takeVerifiedQuery(location, history), true);
  assert.deepEqual(calls, [[{ next: true }, '', '/account?source=email']]);

  assert.equal(takeVerifiedQuery({ href: 'https://example.test/account' }, history), false);
  assert.equal(calls.length, 1);
});

test('Next /account passes the verified landing to the account screen', () => {
  const page = readFileSync(new URL('./page.jsx', import.meta.url), 'utf8');
  assert.match(page, /takeVerifiedQuery\(window\.location, window\.history\)/);
  assert.match(page, /<AccountDashboard verified=\{verified\} \/>/);
});
