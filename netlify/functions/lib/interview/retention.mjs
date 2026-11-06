// Port of scripts/retention-delete.mjs @505ba6a (the Postgres part): the right-to-erasure purge of one engagement,
// and the sweep of memory blobs past expires_at. Same scope and same order as the source, in one transaction.
// Port: the Notion mirror is gone; its place is the outbox (session_end events carry transcripts), so the outbox
// rows of the engagement are purged with the rest. The CLI's dry run is { confirm: false }, which rolls back.
// Kept by design, as in the source: usage_ledger (content-free cost rows; session_id is nulled) and consent_event
// (the lawful-basis audit trail).
import { inInterviewTransaction } from './db.mjs';

class DryRun extends Error {}
const count = async (db, sql, params) => {
  const { data, error } = await db.sql(`SELECT count(*)::int AS n FROM (${sql}) q`, params);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data[0].n;
};
const run = async (db, sql, params) => {
  const { count: n, error } = await db.sql(sql, params);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return n;
};

/** Purge one engagement. before (ISO date) limits the transcript purge to sessions started before it. */
export async function retentionDelete(pool, engagementId, { before = null, confirm = false } = {}) {
  let report;
  try {
    await inInterviewTransaction(pool, async (db) => {
      const eng = await db.from('engagement').select('id, client_name, released_synthesis_id').eq('id', engagementId).maybeSingle();
      if (eng.error) throw Object.assign(new Error(eng.error.message), { code: eng.error.code });
      if (!eng.data) throw Object.assign(new Error('No engagement found'), { code: 'P0002' });
      const scope = `SELECT s.id FROM session s JOIN employee e ON e.id = s.employee_id WHERE e.engagement_id = $1
        ${before ? 'AND s.started_at < $2' : ''}`;
      const params = before ? [engagementId, before] : [engagementId];
      // Port: memory is per (person, organisation): only this round's organisation's blobs of its people go.
      const memoryScope = `SELECT mb.person_id FROM memory_blob mb
        WHERE mb.customer_id = (SELECT g.customer_id FROM engagement g WHERE g.id = $1)
          AND mb.person_id IN (SELECT DISTINCT e.person_id FROM employee e WHERE e.engagement_id = $1 AND e.person_id IS NOT NULL)`;
      report = {
        engagementId, released: !!eng.data.released_synthesis_id, confirmed: confirm,
        sessions: await count(db, scope, params),
        turns: await count(db, `SELECT 1 FROM turn WHERE session_id IN (${scope})`, params),
        insights: await count(db, `SELECT 1 FROM insight WHERE session_id IN (${scope})`, params),
        synthesis: await count(db, 'SELECT 1 FROM synthesis WHERE engagement_id = $1', [engagementId]),
        synthesisCache: await count(db, 'SELECT 1 FROM synthesis_cache WHERE engagement_id = $1', [engagementId]),
        memoryBlobs: await count(db, memoryScope, [engagementId]),
        outbox: await count(db, 'SELECT 1 FROM outbox WHERE engagement_id = $1', [engagementId]),
      };
      if (!confirm) throw new DryRun();
      report.turns = await run(db, `DELETE FROM turn WHERE session_id IN (${scope})`, params);
      report.insights = await run(db, `DELETE FROM insight WHERE session_id IN (${scope})`, params);
      report.sessions = await run(db, `DELETE FROM session s USING employee e WHERE s.employee_id = e.id AND e.engagement_id = $1
        ${before ? 'AND s.started_at < $2' : ''}`, params);
      // synthesis embeds verbatim quotes: purged engagement-wide, and the release withdrawn first
      await run(db, 'UPDATE engagement SET released_synthesis_id = NULL, released_at = NULL, released_by = NULL WHERE id = $1', [engagementId]);
      report.synthesisCache = await run(db, 'DELETE FROM synthesis_cache WHERE engagement_id = $1', [engagementId]);
      report.synthesis = await run(db, 'DELETE FROM synthesis WHERE engagement_id = $1', [engagementId]);
      report.memoryBlobs = await run(db, `DELETE FROM memory_blob
        WHERE customer_id = (SELECT g.customer_id FROM engagement g WHERE g.id = $1)
          AND person_id IN (SELECT DISTINCT e.person_id FROM employee e WHERE e.engagement_id = $1 AND e.person_id IS NOT NULL)`,
        [engagementId]);
      report.outbox = await run(db, 'DELETE FROM outbox WHERE engagement_id = $1', [engagementId]);
      await db.from('audit_log').insert({ engagement_id: engagementId, actor_name: 'system:retention', action: 'retention.deleted',
        summary: `Retention delete: ${report.sessions} sessions, ${report.turns} turns, ${report.synthesis} syntheses removed` });
    });
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
  }
  return report;
}

/** Memory blobs past expires_at (the app only read-filtered on expiry; this removes them). */
export async function sweepExpiredMemory(pool, { confirm = false } = {}) {
  let n = 0;
  try {
    await inInterviewTransaction(pool, async (db) => {
      n = await count(db, 'SELECT 1 FROM memory_blob WHERE expires_at IS NOT NULL AND expires_at < now()', []);
      if (!confirm) throw new DryRun();
      n = await run(db, 'DELETE FROM memory_blob WHERE expires_at IS NOT NULL AND expires_at < now()', []);
    });
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
  }
  return n;
}

/** Engagements whose retention_delete_after date has passed and still hold sessions or synthesis. */
export async function dueForRetention(pool) {
  return inInterviewTransaction(pool, async (db) => {
    const { data, error } = await db.sql(`SELECT g.id FROM engagement g WHERE g.retention_delete_after IS NOT NULL
      AND g.retention_delete_after < current_date AND (EXISTS (SELECT 1 FROM employee e JOIN session s ON s.employee_id = e.id
      WHERE e.engagement_id = g.id) OR EXISTS (SELECT 1 FROM synthesis y WHERE y.engagement_id = g.id))`, []);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return data.map((r) => r.id);
  });
}
