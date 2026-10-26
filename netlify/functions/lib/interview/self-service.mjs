// GRE-2653: "See my interview data" and "Delete my interview data" in the website account (claims C7 and C8 of
// the interview privacy notice; spec `retention-rights-regions` on GRE-2639, section 4).
//
// The website account (Better Auth) is the only identity. The person's own rows are read under participant claims,
// so RLS limits them to the website user id (054; an invite is claimed by user id at join). A client admin
// is a participant like anyone else here: these calls never reach another person's rows.
//
// Delete hard-deletes the person's sessions, turns (cascade), insights, synthesis cache entries that hold them,
// pending outbox events and per-person memory for that round, writes a 'withdrawal' consent_event (no content),
// and takes them out of every synthesis of the round at once: their quotes and insight ids go, a theme left with
// fewer than two voices or two quotes drops (two-voice rule), and the round's synthesis is marked stale so a new
// run must be made and checked before the next release. A 'participant_withdrawn' outbox event (round only) tells
// the GSAM owner to re-run and send an updated version (claim C8). The client is not told who deleted.
import { randomUUID } from 'node:crypto';
import { interviewDb, inInterviewTransaction } from './db.mjs';
import { deletionDate } from './retention.mjs';
import { effectiveQuoteChoice, scrubVerbatim } from './quotes.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class SelfServiceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const must = ({ data, error }) => {
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
};

/** The latest consent choice of each kind, from the append-only log. */
function latestChoices(events, employee) {
  const latest = {};
  for (const e of [...events].sort((a, b) => String(a.ts).localeCompare(String(b.ts)))) latest[e.kind] = e;
  return {
    participation: latest.participation ? latest.participation.value : null,
    quotes: effectiveQuoteChoice(employee),
    quotesChosen: employee.quote_choice != null,
    memory: latest.memory_opt_in ? latest.memory_opt_in.value : null,
    withdrawn: !!latest.withdrawal,
    history: events.map((e) => ({ kind: e.kind, value: e.value, choice: e.choice ?? null, at: e.ts })),
  };
}

/** Quotes of this person in the round's released synthesis (the only version a client sees). */
function quotesUsed(synthesis, insightIds) {
  if (!synthesis) return [];
  const ids = new Set(insightIds);
  const out = [];
  const visit = (list, where) => {
    for (const item of Array.isArray(list) ? list : []) {
      for (const q of Array.isArray(item.evidence_quotes) ? item.evidence_quotes : []) {
        if (!ids.has(q.insight_id) || q.withheld || !q.quote) continue;
        out.push({ where, title: item.title ?? null, quote: q.quote, attribution: q.attribution ?? null });
      }
    }
  };
  visit(synthesis.themes, 'theme');
  visit((synthesis.hot_spots ?? []).flatMap((h) => h.local_themes ?? []), 'team theme');
  visit(synthesis.recommendations, 'recommendation');
  return out;
}

/**
 * Everything held about the signed-in person from their interviews, per round. identity: Better Auth
 * { id, email } with a verified email. Returns { generatedAt, rounds: [...] }; the same object is the download.
 */
export async function seeMyInterviewData(pool, identity) {
  const db = interviewDb(identity, { pool });
  const employees = must(await db.from('employee')
    .select('id, engagement_id, name, email, role_title, status, quote_choice').order('id'));
  const rounds = [];
  for (const employee of employees) {
    const eng = must(await db.from('engagement')
      .select('id, client_name, readout_at, closed_at, retention_days, retention_delete_after, released_synthesis_id')
      .eq('id', employee.engagement_id).maybeSingle());
    if (!eng) continue;
    const sessions = must(await db.from('session').select('id, started_at, ended_at, phase, is_voice')
      .eq('employee_id', employee.id).order('started_at'));
    const sessionIds = sessions.map((s) => s.id);
    const turns = sessionIds.length ? must(await db.from('turn').select('session_id, role, content, ts, input_mode')
      .in('session_id', sessionIds).order('seq')) : [];
    const insights = sessionIds.length ? must(await db.from('insight')
      .select('id, session_id, type, label, evidence_quote, time_per_week_hours, confidence, second_hand')
      .in('session_id', sessionIds)) : [];
    const consents = must(await db.from('consent_event').select('kind, value, choice, ts').eq('employee_id', employee.id));
    // the released synthesis is system-only: read it once, and keep only this person's own quotes from it
    let released = null;
    if (eng.released_synthesis_id && insights.length) {
      released = await inInterviewTransaction(pool, async (sys) => must(await sys.from('synthesis')
        .select('themes, hot_spots, recommendations').eq('id', eng.released_synthesis_id).eq('engagement_id', eng.id).maybeSingle()));
    }
    rounds.push({
      engagementId: eng.id,
      engagement: eng.client_name,
      you: { name: employee.name, email: employee.email, role: employee.role_title, status: employee.status },
      readoutAt: eng.readout_at ?? null,
      deletionDate: deletionDate(eng),
      consent: latestChoices(consents, employee),
      sessions: sessions.map((s) => ({
        startedAt: s.started_at, endedAt: s.ended_at, phase: s.phase, voice: s.is_voice,
        transcript: turns.filter((t) => t.session_id === s.id)
          .map((t) => ({ speaker: t.role === 'user' ? 'you' : 'interviewer', text: t.content, at: t.ts, mode: t.input_mode ?? null })),
      })),
      insights: insights.map((i) => ({ type: i.type, label: i.label, quote: i.evidence_quote,
        hoursPerWeek: i.time_per_week_hours, confidence: i.confidence, secondHand: i.second_hand })),
      quotesUsed: quotesUsed(released, insights.map((i) => i.id)),
    });
  }
  return { generatedAt: new Date().toISOString(), rounds };
}

/** Take one person out of a stored synthesis row. Returns the new row fields and whether anything changed. */
export function withdrawFromSynthesis(row, { insightIds, employeeId, texts = [] }) {
  const ids = new Set(insightIds);
  let changed = false;
  const log = [];
  const theme = (t) => {
    const support = Array.isArray(t.supporting_insight_ids) ? t.supporting_insight_ids : [];
    if (!support.some((id) => ids.has(id))) return t;
    changed = true;
    const next = {
      ...t,
      supporting_insight_ids: support.filter((id) => !ids.has(id)),
      evidence_quotes: (t.evidence_quotes ?? []).filter((q) => !ids.has(q.insight_id)),
      // one person is one voice
      distinct_voices: Math.max(0, (t.distinct_voices ?? 0) - 1),
    };
    if (next.distinct_voices < 2 || next.evidence_quotes.length < 2) {
      log.push({ kind: 'theme_dropped', subject: `theme "${t.title}"`, reason: 'below two voices after a participant withdrew' });
      return null;
    }
    return next;
  };
  const themes = (row.themes ?? []).map(theme).filter(Boolean);
  const hotSpots = (row.hot_spots ?? []).map((h) => {
    const drivers = (h.top_drivers ?? []).filter((d) => !ids.has(d.insight_id));
    if (drivers.length !== (h.top_drivers ?? []).length) changed = true;
    return { ...h, top_drivers: drivers, local_themes: (h.local_themes ?? []).map(theme).filter(Boolean) };
  });
  const recommendations = (row.recommendations ?? []).map((r) => {
    const support = r.supporting_insight_ids ?? [];
    if (!support.some((id) => ids.has(id))) return r;
    changed = true;
    const next = { ...r, supporting_insight_ids: support.filter((id) => !ids.has(id)),
      evidence_quotes: (r.evidence_quotes ?? []).filter((q) => !ids.has(q.insight_id)) };
    if (next.evidence_quotes.length < 1) {
      log.push({ kind: 'recommendation_dropped', subject: `recommendation "${r.title}"`, reason: 'no evidence left after a participant withdrew' });
      return null;
    }
    return next;
  }).filter(Boolean);
  const followUps = (row.follow_ups ?? []).filter((f) => f.employee_id !== employeeId
    && !(f.related_insight_ids ?? []).some((id) => ids.has(id)));
  if (followUps.length !== (row.follow_ups ?? []).length) changed = true;
  let headline = row.headline_read ?? null;
  if (headline && (headline.supporting_insight_ids ?? []).some((id) => ids.has(id))) {
    changed = true;
    const left = headline.supporting_insight_ids.filter((id) => !ids.has(id));
    headline = left.length >= 3 ? { ...headline, supporting_insight_ids: left } : null;
  }
  const input = (row.input_insight_ids ?? []).filter((id) => !ids.has(id));
  if (input.length !== (row.input_insight_ids ?? []).length) changed = true;
  const scrubbed = scrubVerbatim({ themes, hotSpots, recommendations, followUps, headline }, texts);
  if (JSON.stringify(scrubbed) !== JSON.stringify({ themes, hotSpots, recommendations, followUps, headline })) changed = true;
  log.push({ kind: 'note', subject: 'withdrawal', reason: 'A participant withdrew. Their evidence was removed; run the synthesis again before the next release.' });
  return {
    changed,
    fields: {
      themes: scrubbed.themes, hot_spots: scrubbed.hotSpots, recommendations: scrubbed.recommendations,
      follow_ups: scrubbed.followUps, headline_read: scrubbed.headline, input_insight_ids: input,
      validation_log: [...(row.validation_log ?? []), ...log],
    },
  };
}

/**
 * Delete the signed-in person's interview data from one round. Returns counts only. Throws code 'NOT_FOUND' when
 * the person has no invite in that round.
 */
export async function deleteMyInterviewData(pool, identity, engagementId) {
  if (!UUID.test(engagementId || '')) throw new SelfServiceError('NOT_FOUND', 'No interview found.');
  const db = interviewDb(identity, { pool });
  // participant claims: RLS decides that this is the person's own invite
  const employee = must(await db.from('employee').select('id, engagement_id, person_id')
    .eq('engagement_id', engagementId).maybeSingle());
  if (!employee) throw new SelfServiceError('NOT_FOUND', 'No interview found.');

  return inInterviewTransaction(pool, async (sys) => {
    const bound = [engagementId, employee.id];
    const exec = async (text, params) => {
      const { count, error } = await sys.sql(text, params);
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return count ?? 0;
    };
    // every statement below is bounded by the round and this person's invite in it
    const sessions = must(await sys.sql(`SELECT s.id FROM session s JOIN employee e ON e.id = s.employee_id
      WHERE e.engagement_id = $1 AND e.id = $2`, bound)).map((r) => r.id);
    const insights = sessions.length ? must(await sys.sql('SELECT id, evidence_quote FROM insight WHERE session_id = ANY($1::uuid[])',
      [sessions])) : [];
    const userTurns = sessions.length ? must(await sys.sql(`SELECT content FROM turn WHERE session_id = ANY($1::uuid[]) AND role = 'user'`,
      [sessions])).map((r) => r.content) : [];
    const counts = { sessions: sessions.length, insights: insights.length };
    counts.turns = await exec('DELETE FROM turn WHERE session_id = ANY($1::uuid[])', [sessions]);
    await exec('DELETE FROM insight WHERE session_id = ANY($1::uuid[])', [sessions]);
    await exec(`DELETE FROM session s USING employee e WHERE s.employee_id = e.id AND e.engagement_id = $1 AND e.id = $2`, bound);
    // per-session summaries of this person, and every unit roll-up of the round (they fold this person in)
    counts.synthesisCache = await exec(`DELETE FROM synthesis_cache WHERE engagement_id = $1
      AND ((kind = 'session' AND key = ANY($2::uuid[])) OR kind = 'unit')`, [engagementId, sessions]);
    counts.outbox = await exec(`DELETE FROM outbox WHERE engagement_id = $1
      AND split_part(idempotency_key, ':', 1) = ANY($2::text[])`, [engagementId, sessions]);
    // memory is per (person, organisation): only this round's organisation's blob goes
    counts.memoryBlobs = employee.person_id ? await exec(`DELETE FROM memory_blob WHERE person_id = $1
      AND customer_id = (SELECT g.customer_id FROM engagement g WHERE g.id = $2)`, [employee.person_id, engagementId]) : 0;
    must(await sys.sql(`UPDATE employee SET status = 'declined', quote_choice = 'none' WHERE engagement_id = $1 AND id = $2`, bound));
    must(await sys.from('consent_event').insert({ employee_id: employee.id, kind: 'withdrawal', value: true }));

    // out of every synthesis of the round, at once
    const syntheses = must(await sys.sql('SELECT * FROM synthesis WHERE engagement_id = $1', [engagementId]));
    counts.synthesesUpdated = 0;
    const texts = [...insights.map((i) => i.evidence_quote), ...userTurns];
    for (const row of syntheses) {
      const { changed, fields } = withdrawFromSynthesis(row, { insightIds: insights.map((i) => i.id), employeeId: employee.id, texts });
      if (!changed) continue;
      counts.synthesesUpdated += 1;
      must(await sys.sql(`UPDATE synthesis SET themes = $3::jsonb, hot_spots = $4::jsonb, recommendations = $5::jsonb,
        follow_ups = $6::jsonb, headline_read = $7::jsonb, input_insight_ids = $8::uuid[], validation_log = $9::jsonb
        WHERE id = $1 AND engagement_id = $2`,
      [row.id, engagementId, JSON.stringify(fields.themes), JSON.stringify(fields.hot_spots), JSON.stringify(fields.recommendations),
        JSON.stringify(fields.follow_ups), JSON.stringify(fields.headline_read), fields.input_insight_ids,
        JSON.stringify(fields.validation_log)]));
    }
    must(await sys.sql('UPDATE engagement SET synthesis_stale_at = now() WHERE id = $1', [engagementId]));
    must(await sys.sql(`INSERT INTO deletion_record (engagement_id, kind, counts) VALUES ($1, 'self_service', $2::jsonb)`,
      [engagementId, JSON.stringify(counts)]));
    // no name, no email, no id: the client is not told who deleted
    must(await sys.from('audit_log').insert({ engagement_id: engagementId, actor_name: 'system:self-service',
      action: 'participant.withdrawn', summary: 'A participant deleted their interview data; the synthesis must be run again' }));
    // claim C8 "we send [Client name] an updated version": GSAM reads this through the bridge and prompts the owner to
    // re-run and re-release. The key and payload carry the round only (a fresh uuid keeps each delete its own row).
    must(await sys.sql(`INSERT INTO outbox (idempotency_key, engagement_id, payload) VALUES ($1, $2, $3::jsonb)`,
      [`${engagementId}:participant_withdrawn:${randomUUID()}`, engagementId, JSON.stringify({ type: 'participant_withdrawn',
        engagement_id: engagementId, synthesis_stale: true, released_affected: counts.synthesesUpdated > 0,
        withdrawn_at: new Date().toISOString() })]));
    return counts;
  });
}

export { SelfServiceError };
