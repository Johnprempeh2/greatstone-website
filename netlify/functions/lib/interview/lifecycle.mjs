// Port of src/app/(portal)/admin/lifecycle-actions.ts @505ba6a: abandonment close-out.
// A session earns ended_at only at sign-off, and synthesis admits only ended sessions, so an abandoned conversation
// that reached pain mapping is closed out to enter synthesis as PARTIAL (capped at 0.7 confidence downstream).
// Port: the gs_admin check is gone. The callers are system-scoped (the GSAM bridge, whose key is the authority, and
// the scheduled close-out), and the engagement scope is kept by the employee join. revalidatePath has no equivalent.
// closeOutOpenSessions and closeOutIdleSessions are new: the bulk forms the bridge and the schedule use.

export const CLOSE_OUT_PHASES = new Set(['pain_mapping', 'automation', 'sign_off']);

const fail = (message) => ({ ok: false, message });

/** Close out one open session of this engagement. Returns { ok, message }. */
export async function closeOutSession(db, engagementId, sessionId) {
  try {
    if (typeof sessionId !== 'string' || sessionId.trim() === '') return fail('No session was selected to close out.');
    // Port: the source's embedded `employee:employee_id!inner(engagement_id)` filter, as a join
    const { data: rows, error: lookupError } = await db.sql(`SELECT s.id, s.started_at, s.ended_at, s.phase::text AS phase
      FROM session s JOIN employee e ON e.id = s.employee_id WHERE s.id = $1 AND e.engagement_id = $2 LIMIT 1`, [sessionId, engagementId]);
    if (lookupError) return fail(`Could not look up that session: ${lookupError.message}`);
    const row = rows?.[0];
    if (!row) return fail('That session is not part of this engagement.');
    if (row.ended_at !== null) return fail('That session has already ended, so there is nothing to close out.');
    if (!CLOSE_OUT_PHASES.has(row.phase)) {
      return fail('This conversation did not get far enough to include. It needs to reach the pain-mapping stage before it can be closed out — not enough of the conversation happened to include it.');
    }
    const now = new Date();
    const durationSecs = Math.max(0, Math.round((now.getTime() - new Date(row.started_at).getTime()) / 1000));
    // Guard the write against a race with a real sign-off completing: only close out a session that is still open.
    const { error: updateError } = await db.from('session')
      .update({ ended_at: now.toISOString(), resumable: false, duration_secs: durationSecs })
      .eq('id', row.id)
      .is('ended_at', null);
    if (updateError) return fail(`Could not close out the session: ${updateError.message}`);
    return { ok: true, message: 'Session closed out. Its evidence will now be included in synthesis as a partial conversation, capped at 0.7 confidence because it was never read back.' };
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Something went wrong.');
  }
}

async function closeEach(db, rows, logAudit) {
  let closed = 0;
  for (const r of rows) {
    const result = await closeOutSession(db, r.engagement_id, r.id);
    if (result.ok) {
      closed += 1;
      await logAudit(r.engagement_id, r.id);
    }
  }
  return closed;
}

/** Every open session of the engagement that reached pain mapping (the round is closing). Returns how many closed. */
export async function closeOutOpenSessions(db, engagementId, actor = 'system') {
  const { data, error } = await db.sql(`SELECT s.id, e.engagement_id FROM session s JOIN employee e ON e.id = s.employee_id
    WHERE e.engagement_id = $1 AND s.ended_at IS NULL AND s.phase::text = ANY($2)`, [engagementId, [...CLOSE_OUT_PHASES]]);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return closeEach(db, data, (eng, id) => db.from('audit_log').insert({ engagement_id: eng, actor_name: String(actor).slice(0, 200),
    action: 'session.closed_out', summary: 'Closed out an open session when the round closed', target_id: id }));
}

/**
 * The scheduled close-out: open sessions on active engagements that reached pain mapping and have been idle (no turn)
 * for idleHours. Earlier-phase sessions stay open; there is not enough to include.
 */
export async function closeOutIdleSessions(db, idleHours = 48) {
  const { data, error } = await db.sql(`SELECT s.id, e.engagement_id FROM session s
      JOIN employee e ON e.id = s.employee_id JOIN engagement g ON g.id = e.engagement_id
    WHERE s.ended_at IS NULL AND s.phase::text = ANY($1) AND g.status = 'active'
      AND coalesce((SELECT max(t.ts) FROM turn t WHERE t.session_id = s.id), s.started_at) < now() - make_interval(hours => $2)`,
  [[...CLOSE_OUT_PHASES], idleHours]);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return closeEach(db, data, (eng, id) => db.from('audit_log').insert({ engagement_id: eng, actor_name: 'system:close-out',
    action: 'session.closed_out', summary: `Closed out a session idle for more than ${idleHours} hours`, target_id: id }));
}
