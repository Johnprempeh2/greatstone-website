// Port of scripts/retention-delete.mjs @505ba6a (the Postgres part): the right-to-erasure purge of one engagement,
// and the sweep of memory blobs past expires_at. Same scope and same order as the source, in one transaction.
// Port: the Notion mirror is gone; its place is the outbox (session_end events carry transcripts), so the outbox
// rows of the engagement are purged with the rest. The CLI's dry run is { confirm: false }, which rolls back.
// Kept by design, as in the source: usage_ledger (content-free cost rows; session_id is nulled) and consent_event
// (the lawful-basis audit trail).
//
// GRE-2653 (retention per round, spec `retention-rights-regions` on GRE-2639):
//   * The deletion date is readout_at (or closed_at, with no readout) + retention_days, default 90; the older
//     retention_delete_after date still counts, whichever comes first. A daily scheduled function runs it.
//   * Before anything is deleted, an anonymised themes copy is written: theme labels, counts, time estimates and
//     team roll-ups, with no names, quotes, user ids or insight ids. That copy is what the client keeps.
//   * The full delete also removes the invites (employee rows, which hold name and email) and the people no other
//     round still needs, the synthesis runs and the engagement's activity log. consent_event outlives the invite
//     (migration 055), so the consent proof stays without any interview content.
//   * Every statement is bounded by the engagement id, and by the organisation id when one is given.
//   * The job writes a deletion_record (counts per table, time) and an outbox event for the engagement owner.
import { inInterviewTransaction } from './db.mjs';

export const DEFAULT_RETENTION_DAYS = 90;

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
const rows = async (db, sql, params) => {
  const { data, error } = await db.sql(sql, params);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
};

/** The deletion date of a round as YYYY-MM-DD, or null when there is no readout, close or legacy date yet. */
export function deletionDate(eng) {
  const days = Number.isInteger(eng?.retention_days) ? eng.retention_days : DEFAULT_RETENTION_DAYS;
  const from = eng?.readout_at ?? eng?.closed_at ?? null;
  const candidates = [];
  if (from && !Number.isNaN(Date.parse(from))) candidates.push(new Date(Date.parse(from) + days * 86_400_000));
  if (eng?.retention_delete_after) candidates.push(new Date(`${String(eng.retention_delete_after).slice(0, 10)}T00:00:00Z`));
  if (candidates.length === 0) return null;
  return new Date(Math.min(...candidates.map((d) => d.getTime()))).toISOString().slice(0, 10);
}

// Names of the round's people, to keep them out of the anonymised copy even inside model-written labels.
function nameScrubber(names) {
  const list = [...new Set(names.flatMap((n) => {
    const full = String(n ?? '').trim();
    return full.length >= 3 ? [full, ...full.split(/\s+/).filter((part) => part.length >= 3)] : [];
  }))].sort((a, b) => b.length - a.length);
  if (list.length === 0) return (s) => s;
  const pattern = new RegExp(`\\b(?:${list.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');
  return (s) => (typeof s === 'string' ? s.replace(pattern, '[name removed]') : s);
}

/**
 * The client's anonymised copy of a synthesis row: theme labels, counts, confidence, time estimates and team roll-ups.
 * No statements or headline (model prose), no quotes, no follow-ups, no insight or employee ids, no names.
 */
export function anonymisedCopy(synthesis, { names = [] } = {}) {
  const clean = nameScrubber(names);
  const theme = (t) => ({
    title: clean(t.title), scope: t.scope ?? null, distinct_voices: t.distinct_voices ?? null,
    includes_second_hand: !!t.includes_second_hand, confidence: t.confidence ?? null,
  });
  const hotSpots = Array.isArray(synthesis?.hot_spots) ? synthesis.hot_spots : [];
  return {
    themes: (Array.isArray(synthesis?.themes) ? synthesis.themes : []).map(theme),
    recommendations: (Array.isArray(synthesis?.recommendations) ? synthesis.recommendations : []).map((r) => ({
      title: clean(r.title), impact: r.impact ?? null, feasibility: r.feasibility ?? null,
      estimated_hours_per_week: r.estimated_hours_per_week ?? null, confidence: r.confidence ?? null,
      affected_teams: Array.isArray(r.affected_teams) ? r.affected_teams : [],
    })),
    teams: hotSpots.map((h) => ({
      team: h.team, first_hand_hours_per_week: h.first_hand_hours_per_week ?? null,
      on_behalf_hours_per_week: h.on_behalf_hours_per_week ?? null, respondents: h.respondents ?? null,
      themes: (Array.isArray(h.local_themes) ? h.local_themes : []).map(theme),
    })),
  };
}

/** Purge one engagement. before (ISO date) limits the transcript purge to sessions started before it. */
export async function retentionDelete(pool, engagementId, { before = null, confirm = false, orgId = null } = {}) {
  let report;
  try {
    await inInterviewTransaction(pool, async (db) => {
      const eng = await db.from('engagement').select('id, client_name, org_id, released_synthesis_id').eq('id', engagementId).maybeSingle();
      if (eng.error) throw Object.assign(new Error(eng.error.message), { code: eng.error.code });
      if (!eng.data || (orgId && eng.data.org_id !== orgId)) throw Object.assign(new Error('No engagement found'), { code: 'P0002' });
      const scope = `SELECT s.id FROM session s JOIN employee e ON e.id = s.employee_id WHERE e.engagement_id = $1
        ${before ? 'AND s.started_at < $2' : ''}`;
      const params = before ? [engagementId, before] : [engagementId];
      // Port: memory is per (person, organisation): only this round's organisation's blobs of its people go.
      const memoryScope = `SELECT mb.person_id FROM memory_blob mb
        WHERE mb.customer_id = (SELECT g.customer_id FROM engagement g WHERE g.id = $1)
          AND mb.person_id IN (SELECT DISTINCT e.person_id FROM employee e WHERE e.engagement_id = $1 AND e.person_id IS NOT NULL)`;
      const full = !before;
      report = {
        engagementId, released: !!eng.data.released_synthesis_id, confirmed: confirm,
        sessions: await count(db, scope, params),
        turns: await count(db, `SELECT 1 FROM turn WHERE session_id IN (${scope})`, params),
        insights: await count(db, `SELECT 1 FROM insight WHERE session_id IN (${scope})`, params),
        synthesis: await count(db, 'SELECT 1 FROM synthesis WHERE engagement_id = $1', [engagementId]),
        synthesisCache: await count(db, 'SELECT 1 FROM synthesis_cache WHERE engagement_id = $1', [engagementId]),
        memoryBlobs: await count(db, memoryScope, [engagementId]),
        outbox: await count(db, 'SELECT 1 FROM outbox WHERE engagement_id = $1', [engagementId]),
        ...(full ? {
          invites: await count(db, 'SELECT 1 FROM employee WHERE engagement_id = $1', [engagementId]),
          synthesisRuns: await count(db, 'SELECT 1 FROM synthesis_run WHERE engagement_id = $1', [engagementId]),
          activity: await count(db, "SELECT 1 FROM audit_log WHERE engagement_id = $1 AND action NOT LIKE 'retention.%'", [engagementId]),
        } : {}),
      };
      if (!confirm) throw new DryRun();

      // GRE-2653: the anonymised themes copy first, from the released synthesis (else the latest one)
      if (full) {
        const [source] = await rows(db, `SELECT y.version, y.themes, y.recommendations, y.hot_spots FROM synthesis y
          WHERE y.engagement_id = $1 ORDER BY (y.id = $2) DESC, y.version DESC LIMIT 1`,
        [engagementId, eng.data.released_synthesis_id ?? '00000000-0000-0000-0000-000000000000']);
        if (source) {
          const names = (await rows(db, 'SELECT name FROM employee WHERE engagement_id = $1', [engagementId])).map((r) => r.name);
          const copy = anonymisedCopy(source, { names });
          const sessionsIncluded = report.sessions;
          await run(db, `INSERT INTO anonymised_themes (engagement_id, source_version, themes, recommendations, teams, counts)
            VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb)
            ON CONFLICT (engagement_id) DO UPDATE SET source_version = EXCLUDED.source_version,
              themes = EXCLUDED.themes, recommendations = EXCLUDED.recommendations, teams = EXCLUDED.teams,
              counts = EXCLUDED.counts, created_at = now()`,
          [engagementId, source.version, JSON.stringify(copy.themes),
            JSON.stringify(copy.recommendations), JSON.stringify(copy.teams),
            JSON.stringify({ interviews: sessionsIncluded, themes: copy.themes.length, recommendations: copy.recommendations.length })]);
        }
      }

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

      if (full) {
        report.synthesisRuns = await run(db, 'DELETE FROM synthesis_run WHERE engagement_id = $1', [engagementId]);
        // seat requests and purchases point at employees and are commercial records: their invites are cleared of
        // name and email instead of deleted
        const people = (await rows(db, 'SELECT DISTINCT person_id FROM employee WHERE engagement_id = $1 AND person_id IS NOT NULL',
          [engagementId])).map((r) => r.person_id);
        const kept = `id IN (SELECT requested_by FROM seat_request WHERE engagement_id = $1 UNION SELECT decided_by FROM seat_request
          WHERE engagement_id = $1 AND decided_by IS NOT NULL UNION SELECT purchased_by FROM seat_purchase WHERE engagement_id = $1)`;
        await run(db, `UPDATE employee SET invited_by = NULL WHERE engagement_id = $1`, [engagementId]);
        const cleared = await run(db, `UPDATE employee SET name = 'Removed', email = 'removed-' || id || '@invalid', role_title = NULL,
          person_id = NULL, user_id = NULL, login_token_hash = NULL, login_token_expires_at = NULL
          WHERE engagement_id = $1 AND ${kept}`, [engagementId]);
        report.invites = cleared + await run(db, `DELETE FROM employee WHERE engagement_id = $1 AND NOT (${kept})`, [engagementId]);
        // a person no other round, and no other organisation's memory, still holds goes too
        report.people = people.length ? await run(db, `DELETE FROM person p WHERE p.person_id = ANY($1::uuid[])
          AND NOT EXISTS (SELECT 1 FROM employee e WHERE e.person_id = p.person_id)
          AND NOT EXISTS (SELECT 1 FROM memory_blob mb WHERE mb.person_id = p.person_id)`, [people]) : 0;
        report.activity = await run(db, "DELETE FROM audit_log WHERE engagement_id = $1 AND action NOT LIKE 'retention.%'", [engagementId]);
      }

      const counts = Object.fromEntries(Object.entries(report).filter(([, v]) => typeof v === 'number'));
      await run(db, `INSERT INTO deletion_record (engagement_id, kind, counts) VALUES ($1, 'retention', $2::jsonb)`,
        [engagementId, JSON.stringify(counts)]);
      await db.from('audit_log').insert({ engagement_id: engagementId, actor_name: 'system:retention', action: 'retention.deleted',
        summary: `Retention delete: ${report.sessions} sessions, ${report.turns} turns, ${report.synthesis} syntheses removed` });
      // the engagement owner confirms the deletion to the client in writing (DPA 7.5); GSAM reads this through the bridge
      if (full) {
        await run(db, `INSERT INTO outbox (idempotency_key, engagement_id, payload) VALUES ($1, $2, $3::jsonb)
          ON CONFLICT (idempotency_key) DO NOTHING`,
        [`${engagementId}:retention_deleted:${new Date().toISOString().slice(0, 10)}`, engagementId,
          JSON.stringify({ type: 'retention_deleted', engagement_id: engagementId, counts, deleted_at: new Date().toISOString() })]);
      }
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

/**
 * Engagements whose deletion date has passed and that still hold anything identifiable: sessions, synthesis or its
 * cache, outbox rows or invites with an email.
 */
export async function dueForRetention(pool, { now = null } = {}) {
  return inInterviewTransaction(pool, async (db) => {
    const { data, error } = await db.sql(`SELECT g.id FROM engagement g
      WHERE deletion_due_at(g.readout_at, g.closed_at, g.retention_days, g.retention_delete_after) <= coalesce($1::timestamptz, now())
      AND (EXISTS (SELECT 1 FROM employee e JOIN session s ON s.employee_id = e.id WHERE e.engagement_id = g.id)
        OR EXISTS (SELECT 1 FROM synthesis y WHERE y.engagement_id = g.id)
        OR EXISTS (SELECT 1 FROM synthesis_cache c WHERE c.engagement_id = g.id)
        OR EXISTS (SELECT 1 FROM outbox o WHERE o.engagement_id = g.id AND o.payload ->> 'type' IS DISTINCT FROM 'retention_deleted')
        OR EXISTS (SELECT 1 FROM employee e WHERE e.engagement_id = g.id AND e.email NOT LIKE 'removed-%@invalid'))
      ORDER BY g.id`, [now]);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return data.map((r) => r.id);
  });
}
