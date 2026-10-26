import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimProofHash, clearProofRecords } from '../../scripts/owner-proof-state.mjs';

test('a corrected second proof payload cannot leave records outside clear', async () => {
  const map = new Map([['runner/state', { until: '2026-10-26T10:30:00Z' }]]);
  const store = {
    async setJSON(key, value) { map.set(key, value); },
    async delete(key) { map.delete(key); },
  };
  const first = 'a'.repeat(64);
  const second = 'b'.repeat(64);
  await claimProofHash(store, map.get('runner/state'), first);
  await claimProofHash(store, map.get('runner/state'), first);
  map.set(`ledger/${first}`, { dryRunAt: 'now' });
  map.set(`results/${first}/dry-run`, { status: 'dry-run-ok' });
  map.set('results/latest', { status: 'dry-run-ok' });
  await assert.rejects(claimProofHash(store, map.get('runner/state'), second), /different proof payload/);
  assert.equal(map.get('runner/state').proofHash, first);
  assert.equal(map.has(`ledger/${second}`), false);
  await clearProofRecords(store, map.get('runner/state'));
  assert.equal(map.has(`ledger/${first}`), false);
  assert.equal(map.has(`results/${first}/dry-run`), false);
  assert.equal(map.has('results/latest'), false);
});
