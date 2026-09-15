// "Is this Supabase error just a table that does not exist yet, or a real failure?"
//
// This is easy to get wrong and fails silently when you do. PostgREST does NOT surface Postgres's
// own 42P01 (undefined_table) for an unknown relation: it answers from its schema cache and returns
// PGRST205 with a message like "Could not find the table 'public.x' in the schema cache". A guard
// written against 42P01 alone therefore never fires, and a feature meant to degrade gracefully until
// its migration lands instead throws on every load.
//
// Row-level security refusals are folded in for the same reason: to a caller deciding whether to fall
// back, "the table is not there" and "you may not read it" are the same answer.
export function isAbsentOrForbidden(error) {
  if (!error) return false;
  const code = String(error.code || '');
  if (['42P01', '42501', 'PGRST205', 'PGRST202', 'PGRST106'].includes(code)) return true;
  return /schema cache|does not exist|not exist|permission denied|row-level security/i
    .test(String(error.message || ''));
}
