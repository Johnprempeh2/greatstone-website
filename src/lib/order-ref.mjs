// order-ref.mjs — a human label for an order reference, and whether the order was MIGRATED from the old
// store (imported, no Stripe session) vs placed live through Stripe. Migrated orders carry a reference of
// "legacy:<id>" (stamped by scripts/migrate-legacy-store.mjs); live orders carry the Stripe session id
// ("cs_test_…" / "cs_live_…"). Pure + unit-tested so the branching is verified without any order data.

export function isMigratedOrder(reference) {
  return typeof reference === 'string' && reference.startsWith('legacy:');
}

// { migrated, label } — `label` is a short, human display for the reference cell.
export function orderRefDisplay(reference) {
  const s = String(reference == null ? '' : reference);
  if (s.startsWith('legacy:')) {
    const id = s.slice('legacy:'.length).trim();
    return { migrated: true, label: id ? '#' + id : 'Imported', full: s };
  }
  const stripped = s.replace(/^cs_(test|live)_/, '');
  const label = stripped ? stripped.slice(0, 12) + (stripped.length > 12 ? '…' : '') : '—';
  return { migrated: false, label, full: s };
}
