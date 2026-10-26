// The interview engine's housekeeping, hourly (GRE-2612): abandonment close-out for sessions idle past
// INTERVIEW_ABANDON_AFTER_HOURS (default 48) that reached pain mapping, and the sweep of memory blobs past their
// expiry. System scope only. The retention delete runs daily in interview-retention (GRE-2653).
import { getPool } from './lib/db.mjs';
import { interviewDb } from './lib/interview/db.mjs';
import { closeOutIdleSessions } from './lib/interview/lifecycle.mjs';
import { sweepExpiredMemory } from './lib/interview/retention.mjs';

export async function housekeeping({ pool = getPool(), env = process.env, log = console.log } = {}) {
  if (!pool || env.INTERVIEW_ENABLED !== '1') return { skipped: true };
  const hours = Number(env.INTERVIEW_ABANDON_AFTER_HOURS) || 48;
  const closed = await closeOutIdleSessions(interviewDb('system', { pool }), hours);
  const memory = await sweepExpiredMemory(pool, { confirm: true });
  log(`interview-scheduled: closed out ${closed}, removed ${memory} expired memory blobs`);
  return { closed, memory };
}

export default async () => { await housekeeping(); };
export const config = { schedule: '@hourly' };
