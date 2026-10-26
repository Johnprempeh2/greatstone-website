// Keep one proof payload per owner-import window so clear can remove every proof record.
export async function claimProofHash(store, state, hash) {
  if (state.proofHash && state.proofHash !== hash)
    throw new Error('A different proof payload was already submitted; clear this window before preparing another');
  if (!state.proofHash) await store.setJSON('runner/state', { ...state, proofHash: hash });
}

export async function clearProofRecords(store, state) {
  if (!state?.proofHash) return;
  const hash = state.proofHash;
  await store.delete(`ledger/${hash}`);
  await store.delete(`results/${hash}/dry-run`);
  await store.delete(`results/${hash}/apply`);
  await store.delete('results/latest');
}
