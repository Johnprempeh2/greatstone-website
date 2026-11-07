// GRE-2653: the daily retention delete of the interview engine. Every round whose deletion date (readout, or close,
// plus retention_days; default 90) has passed gets its anonymised themes copy written, then its interview data
// hard-deleted, with a deletion record. INTERVIEW_RETENTION_DRY_RUN=1 counts and rolls back. System scope only;
// the log carries round ids and counts, never names or content.
import { getPool } from './lib/db.mjs';
import { dueForRetention, retentionDelete } from './lib/interview/retention.mjs';

export async function retentionRun({ pool = getPool(), env = process.env, log = console.log, now = null } = {}) {
  if (!pool || env.INTERVIEW_ENABLED !== '1') return { skipped: true };
  const confirm = env.INTERVIEW_RETENTION_DRY_RUN !== '1';
  const reports = [];
  for (const id of await dueForRetention(pool, { now })) {
    try {
      reports.push(await retentionDelete(pool, id, { confirm }));
    } catch (error) {
      // one round failing must not stop the others; it is due again tomorrow
      log(`interview-retention: round ${id} failed: ${error.code || 'error'}`);
    }
  }
  log(`interview-retention: ${confirm ? 'deleted' : 'dry run, would delete'} ${reports.length} rounds`
    + (reports.length ? ` (${reports.map((r) => `${r.engagementId}: ${r.sessions} sessions, ${r.turns} turns`).join('; ')})` : ''));
  return { confirm, rounds: reports };
}

export default async () => { await retentionRun(); };
export const config = { schedule: '@daily' };
