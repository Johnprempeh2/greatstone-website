import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimProofHash, clearProofRecords } from '../../scripts/owner-proof-state.mjs';

test('a corrected second proof payload cannot leave records outside clear', async () => {
  const first = 'a'.repeat(64);
  const second = 'b'.repeat(64);
  const map = new Map([['runner/state', { until: '2026-10-26T10:30:00Z', proofHash: first }]]);
  const store = {
    async delete(key) { map.delete(key); },
  };
  claimProofHash(map.get('runner/state'), first);
  claimProofHash(map.get('runner/state'), first);
  map.set(`ledger/${first}`, { dryRunAt: 'now' });
  map.set(`results/${first}/dry-run`, { status: 'dry-run-ok' });
  map.set(`results/${first}/apply`, { status: 'applied' });
  map.set('results/latest', { status: 'dry-run-ok' });
  assert.throws(() => claimProofHash(map.get('runner/state'), second), /different proof payload/);
  assert.equal(map.get('runner/state').proofHash, first);
  assert.equal(map.has(`ledger/${second}`), false);
  await clearProofRecords(store, map.get('runner/state'));
  assert.equal(map.has(`ledger/${first}`), false);
  assert.equal(map.has(`results/${first}/dry-run`), false);
  assert.equal(map.has(`results/${first}/apply`), false);
  assert.equal(map.has('results/latest'), false);
});

test('concurrent submits cannot claim different proof hashes or leave records after clear', async () => {
  const first = 'a'.repeat(64);
  const second = 'b'.repeat(64);
  const state = { until: '2026-10-26T10:30:00Z', proofHash: first };
  const map = new Map([['runner/state', state]]);
  const store = {
    async delete(key) { map.delete(key); },
  };
  const claims = await Promise.allSettled([
    Promise.resolve().then(() => claimProofHash(state, first)),
    Promise.resolve().then(() => claimProofHash(state, second)),
  ]);
  assert.deepEqual(claims.map((claim) => claim.status), ['fulfilled', 'rejected']);
  map.set(`ledger/${first}`, { dryRunAt: 'now' });
  map.set(`results/${first}/dry-run`, { status: 'dry-run-ok' });
  map.set('results/latest', { status: 'dry-run-ok' });
  await clearProofRecords(store, map.get('runner/state'));
  assert.equal(map.has(`ledger/${first}`), false);
  assert.equal(map.has(`results/${first}/dry-run`), false);
  assert.equal(map.has('results/latest'), false);
});

test('a proof submit cannot claim an unpinned window', () => {
  assert.throws(() => claimProofHash({ until: '2026-10-26T10:30:00Z' }, 'a'.repeat(64)), /prepared with its payload/);
});
