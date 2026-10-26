// The proof hash is fixed at prepare time. Submits never rewrite the shared state.
export function claimProofHash(state, hash) {
  if (!state.proofHash) throw new Error('Proof window must be prepared with its payload');
  if (state.proofHash !== hash)
    throw new Error('A different proof payload was prepared; clear this window before preparing another');
}

export async function clearProofRecords(store, state) {
  if (!state?.proofHash) return;
  const hash = state.proofHash;
  await store.delete(`ledger/${hash}`);
  await store.delete(`results/${hash}/dry-run`);
  await store.delete(`results/${hash}/apply`);
  await store.delete('results/latest');
}
