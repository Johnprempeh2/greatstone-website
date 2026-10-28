// Port of src/lib/synthesis/cache.ts @505ba6a.
// Changed: types stripped; `db` is the interviewDb('system') client (supabase-js shaped) instead of a
// SupabaseClient. Logic, keys and fingerprints unchanged.
//
// synthesis_cache access: the resumability/idempotency layer.
//
// Chosen design (documented per the wave brief): per-interview summaries are cached keyed by session
// id with fingerprint `ended_at|insight_count|vN`, and unit roll-ups keyed by org_unit id with a
// fingerprint hashed from their inputs' fingerprints. A row whose fingerprint matches is reused as-is;
// a mismatch (interview resumed, new insights, prompt revision) costs exactly one re-summarisation.
// Re-clicking Generate therefore continues a partially complete run instead of restarting it, and a
// full re-run on an unchanged engagement pays for the coordinator call only.

import { createHash } from 'node:crypto';

/** @returns {Promise<Map<string, { fingerprint: string, payload: unknown }>>} */
export async function loadCache(db, engagementId, kind) {
  const { data, error } = await db
    .from('synthesis_cache')
    .select('key, fingerprint, payload')
    .eq('engagement_id', engagementId)
    .eq('kind', kind);
  if (error) throw new Error(`synthesis_cache read failed: ${error.message}`);
  const map = new Map();
  for (const row of data ?? []) {
    map.set(row.key, { fingerprint: row.fingerprint, payload: row.payload });
  }
  return map;
}

export async function upsertCache(db, engagementId, kind, key, fingerprint, payload, model) {
  const { error } = await db
    .from('synthesis_cache')
    .upsert(
      { engagement_id: engagementId, kind, key, fingerprint, payload, model },
      { onConflict: 'engagement_id,kind,key' }
    );
  if (error) throw new Error(`synthesis_cache upsert failed: ${error.message}`);
}

export function hashFingerprint(parts) {
  return createHash('sha1').update(parts.join('||')).digest('hex');
}
