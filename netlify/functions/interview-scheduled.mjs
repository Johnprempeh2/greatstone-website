// The interview engine's housekeeping, hourly (GRE-2612): abandonment close-out for sessions idle past
// INTERVIEW_ABANDON_AFTER_HOURS (default 48) that reached pain mapping, the retention delete of every round whose
// retention_delete_after date has passed, and the sweep of memory blobs past their expiry. System scope only.
import { getPool } from './lib/db.mjs';
import { interviewDb } from './lib/interview/db.mjs';
import { closeOutIdleSessions } from './lib/interview/lifecycle.mjs';
import { dueForRetention, retentionDelete, sweepExpiredMemory } from './lib/interview/retention.mjs';

export async function housekeeping({ pool = getPool(), env = process.env, log = console.log } = {}) {
  if (!pool || env.INTERVIEW_ENABLED !== '1') return { skipped: true };
  const hours = Number(env.INTERVIEW_ABANDON_AFTER_HOURS) || 48;
  const closed = await closeOutIdleSessions(interviewDb('system', { pool }), hours);
  const purged = [];
  for (const id of await dueForRetention(pool)) purged.push(await retentionDelete(pool, id, { confirm: true }));
  const memory = await sweepExpiredMemory(pool, { confirm: true });
  log(`interview-scheduled: closed out ${closed}, retention-deleted ${purged.length} rounds, removed ${memory} expired memory blobs`);
  return { closed, purged: purged.length, memory };
}

export default async () => { await housekeeping(); };
export const config = { schedule: '@hourly' };
