// Port of SOURCE src/lib/audit.ts @505ba6a. Never-throw contract, 500-char summary cap and action keys
// unchanged. Port: `supabaseService()` replaced by an injected `db` (interviewDb) as the FIRST parameter:
// logAudit(db, entry), getEngagementActivity(db, engagementId, limit = 30). `import 'server-only'` removed.

/**
 * Engagement audit log: an append-only record of who did what on an engagement,
 * for accountability and the DPA/compliance story. Written from the admin
 * actions via logAudit(), read for the dashboard Activity feed via
 * getEngagementActivity().
 *
 * CONTRACT: auditing must NEVER break the action it records. logAudit swallows
 * every error — a failed insert logs to the server and returns, it never throws
 * back into the caller. The audit row is a side effect, not part of the
 * transaction the user is trying to complete.
 *
 * The table is service-role only (RLS enabled + forced, no authenticated
 * policies); the dashboard reads it through the worker plane after its own role
 * check, so there is no direct client access.
 */

/**
 * Stable event keys — keep these append-only so old rows stay meaningful.
 * @typedef {'engagement.created' | 'engagement.reset' | 'engagement.erased' | 'engagement.closed'
 *   | 'engagement.reopened' | 'invite.sent' | 'person.enrolled' | 'person.declined' | 'person.reinvited'
 *   | 'person.edited' | 'role.client_admin_set' | 'role.client_admin_removed' | 'role.team_leader_set'
 *   | 'role.team_leader_removed' | 'delegation.set' | 'delegation.removed' | 'unit.created' | 'unit.renamed'
 *   | 'unit.deleted' | 'seats.allocated' | 'enrolment.updated' | 'context.saved' | 'synthesis.generated'
 *   | 'synthesis.released' | 'synthesis.unreleased'} AuditAction
 */

/**
 * @typedef {{ engagementId: string, actorEmail?: string | null, actorName?: string | null,
 *   action: AuditAction, summary: string, targetId?: string | null }} AuditEntry
 */

/** Record an audit event. Best-effort: never throws. @param {any} db @param {AuditEntry} entry */
export async function logAudit(db, entry) {
  try {
    const { error } = await db
      .from('audit_log')
      .insert({
        engagement_id: entry.engagementId,
        actor_email: entry.actorEmail ?? null,
        actor_name: entry.actorName ?? null,
        action: entry.action,
        summary: entry.summary.slice(0, 500),
        target_id: entry.targetId ?? null,
      });
    if (error) console.error('[audit] insert failed:', entry.action, error.message);
  } catch (e) {
    console.error('[audit] insert threw:', entry.action, e);
  }
}

/**
 * @typedef {{ id: string, action: AuditAction, summary: string, actorName: string | null,
 *   actorEmail: string | null, at: string }} ActivityItem
 */

/** The most recent audit events for an engagement, newest first. @returns {Promise<ActivityItem[]>} */
export async function getEngagementActivity(db, engagementId, limit = 30) {
  const { data, error } = await db
    .from('audit_log')
    .select('id, action, summary, actor_name, actor_email, created_at')
    .eq('engagement_id', engagementId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[audit] read failed:', error.message);
    return [];
  }
  return (data ?? []).map((row) => {
    return {
      id: row.id,
      action: row.action,
      summary: row.summary,
      actorName: row.actor_name,
      actorEmail: row.actor_email,
      at: row.created_at,
    };
  });
}
