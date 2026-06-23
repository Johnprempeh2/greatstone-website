// Decide which UI state a data list should render, so a failed read never masquerades as an
// empty list ("No clients yet" when the query actually errored). Used by the staff Clients & DX
// lists. `loading` true while the read is in flight; `error` truthy if it failed; `rows` the
// loaded array (may be null/[] before it lands). Order matters: loading → error → empty → rows.
export function listState(loading, error, rows) {
  if (loading) return 'loading';
  if (error) return 'error';           // an error wins over "empty" — never show the empty copy on a failure
  if (!Array.isArray(rows) || rows.length === 0) return 'empty';
  return 'rows';
}
