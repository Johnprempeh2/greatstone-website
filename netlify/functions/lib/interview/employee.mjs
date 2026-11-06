// Port of SOURCE src/lib/employee.ts @505ba6a. Resolution rules (active engagement only, newest
// engagement wins, two-tier admin context) unchanged.
// Port: `supabaseService()` replaced by an injected `db` (interviewDb) as the FIRST parameter of every
// export. The embedded selects `*, engagement:engagement_id!inner(*), org_unit:unit_id(*)` are rewritten
// as db.sql JOINs (see contextRows) that rebuild the same row shape, so the source's destructuring code
// below is unchanged. `import 'server-only'` removed.
// Port: the source keyed every lookup on the verified email. Here the key is the Better Auth user id
// (employee.user_id, set when the person claims their invitation at join), so getEmployeeContextByEmail
// became getEmployeeContextByUserId and the other lookups take the user id. Email is used only to claim
// an invitation (interview-join.mjs) and as the address of a lazily provisioned gs_admin row.

/**
 * Employee lookup: the explicit authorisation step of the worker-plane
 * pattern. Every protected server path resolves the signed-in user id to an
 * employee row inside an ACTIVE engagement before doing anything else. No
 * employee row, no access.
 */

/**
 * @typedef {{ employee: import('./types.mjs').Employee, engagement: import('./types.mjs').Engagement,
 *   orgUnit: import('./types.mjs').OrgUnit | null }} EmployeeContext
 */

// Port: replaces the PostgREST embed `*, engagement:engagement_id!inner(*), org_unit:unit_id(*)` with
// `.eq('engagement.status', 'active')`. to_jsonb keeps the supabase-js value shapes (timestamps as ISO
// strings, so the created_at localeCompare sort below behaves as in the source). Each returned row is
// the employee columns plus nested `engagement` and `org_unit` (null when the unit is missing).
const CONTEXT_SELECT = `SELECT to_jsonb(e) AS employee, to_jsonb(g) AS engagement,
    CASE WHEN u.id IS NULL THEN NULL ELSE to_jsonb(u) END AS org_unit
  FROM employee e
  JOIN engagement g ON g.id = e.engagement_id
  LEFT JOIN org_unit u ON u.id = e.unit_id
  WHERE g.status = 'active'`;

async function contextRows(db, where, params, limit) {
  const { data, error } = await db.sql(
    `${CONTEXT_SELECT} AND ${where}${limit ? ` LIMIT ${Number(limit)}` : ''}`,
    params
  );
  return {
    data: error ? null : (data ?? []).map((r) => ({ ...r.employee, engagement: r.engagement, org_unit: r.org_unit ?? null })),
    error,
  };
}

/**
 * Find the employee record for a signed-in Better Auth user, restricted to
 * active engagements. Returns the employee plus their engagement and org
 * unit, or null when the user holds no (claimed) row on an active engagement.
 *
 * @param {any} db interviewDb client
 * @param {string} userId Better Auth user id (the caller's participant.id)
 * @returns {Promise<EmployeeContext | null>}
 */
export async function getEmployeeContextByUserId(db, userId) {
  if (!userId) return null;
  const { data, error } = await contextRows(db, 'e.user_id = $1', [String(userId)]);

  if (error) {
    throw new Error(`employee lookup failed: ${error.message}`);
  }
  if (!data || data.length === 0) return null;

  // Almost everyone belongs to exactly one engagement. Greatstone staff
  // (gs_admin) can be on several at once — so resolution must be deterministic:
  // the MOST RECENTLY CREATED active engagement wins, which means a freshly
  // created client org automatically becomes the admin's active context.
  // (A full engagement switcher is the durable follow-up for running multiple
  // live clients side by side.)
  const rows = [...data].sort((a, b) => {
    const ea = a.engagement?.created_at ?? '';
    const eb = b.engagement?.created_at ?? '';
    const byDate = eb.localeCompare(ea);
    if (byDate !== 0) return byDate;
    // Tiebreak on engagement id for a TOTAL order, so two engagements created
    // in the same instant never flip the resolved context between requests.
    const ia = a.engagement?.id ?? '';
    const ib = b.engagement?.id ?? '';
    return ib.localeCompare(ia);
  });

  const row = rows[0];
  const { engagement, org_unit, ...employee } = row;

  return {
    employee,
    engagement,
    orgUnit: org_unit ?? null,
  };
}

/**
 * Resolve context from an employee ROW ID rather than a user id.
 *
 * The voice path has no signed-in user to key on: Deepgram calls our think endpoint
 * server to server, and identity comes from a per-session bearer token which
 * resolves to a session and therefore to an employee_id. Everything downstream
 * (the interview engine, the prompt, extraction) then works on exactly the
 * same EmployeeContext as the typed path.
 *
 * Still engagement-gated: an employee on a closed engagement resolves to null,
 * so a stale voice token cannot drive an interview after the round ends.
 *
 * @returns {Promise<EmployeeContext | null>}
 */
export async function getEmployeeContextById(db, employeeId) {
  const { data, error } = await contextRows(db, 'e.id = $1', [employeeId], 1);

  if (error) throw new Error(`employee lookup failed: ${error.message}`);
  const row = data?.[0];
  if (!row) return null;

  const { engagement, org_unit, ...employee } = row;
  return {
    employee,
    engagement,
    orgUnit: org_unit ?? null,
  };
}

/**
 * Resolve the caller's context FOR A SPECIFIC ENGAGEMENT. Unlike
 * getEmployeeContextByUserId (which picks the newest active engagement), this
 * reads the employee row — and therefore the portal_role — from the TARGET
 * engagement itself. Anything that authorises an action against a named
 * engagement (the deliverable gate, release, etc.) must use this so a role
 * held on one engagement can never be borrowed to act on another. Returns
 * null when the user is not a member of that active engagement.
 *
 * @param {any} db interviewDb client
 * @param {string} userId Better Auth user id
 * @param {string} engagementId
 * @returns {Promise<EmployeeContext | null>}
 */
export async function getEmployeeContextForEngagement(db, userId, engagementId) {
  if (!userId) return null;
  const { data, error } = await contextRows(
    db,
    'e.user_id = $1 AND e.engagement_id = $2',
    [String(userId), engagementId],
    1
  );

  if (error) {
    throw new Error(`employee lookup failed: ${error.message}`);
  }
  if (!data || data.length === 0) return null;

  const row = data[0];
  const { engagement, org_unit, ...employee } = row;

  return {
    employee,
    engagement,
    orgUnit: org_unit ?? null,
  };
}

/**
 * Is this user a Greatstone staff admin ANYWHERE? True when the user holds a
 * gs_admin row on any ACTIVE engagement. This is the all-see-all authority key
 * for the cross-engagement overview: Greatstone staff are global, so a gs_admin
 * on one engagement may view and administer every active engagement.
 * Port: keyed on the Better Auth user id + role (was the plain email + role).
 * A hard staff allowlist (env) can be OR-ed in here later without touching callers.
 *
 * @param {any} db interviewDb client
 * @param {string} userId Better Auth user id
 * @returns {Promise<boolean>}
 */
export async function isGreatstoneAdmin(db, userId) {
  if (!userId) return false;
  // Port: embedded `id, engagement:engagement_id!inner(status)` rewritten as a JOIN.
  const { data, error } = await db.sql(
    `SELECT e.id FROM employee e JOIN engagement g ON g.id = e.engagement_id
      WHERE e.user_id = $1 AND e.portal_role = 'gs_admin' AND g.status = 'active' LIMIT 1`,
    [String(userId)]
  );
  if (error) throw new Error(`admin lookup failed: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** One active engagement by id, or null when it does not exist or is closed. */
export async function getActiveEngagement(db, id) {
  const { data, error } = await db
    .from('engagement')
    .select('*')
    .eq('id', id)
    .eq('status', 'active')
    .limit(1);
  if (error) throw new Error(`engagement lookup failed: ${error.message}`);
  return data?.[0] ?? null;
}

/**
 * THE authorisation entry point for engagement-scoped ADMIN work. Resolves the
 * caller's context for a SPECIFIC engagement, with two tiers:
 *
 *   1. A real membership row on that engagement (this covers a client_admin on
 *      their own engagement, and a gs_admin who already has a row there). A
 *      client_admin can ONLY ever pass through here, so they stay strictly
 *      single-engagement and can never reach another client's data.
 *   2. A GLOBAL gs_admin (Greatstone staff) with no row on the target: a real
 *      gs_admin row is lazily created on that engagement, so the returned
 *      context always has a REAL employee id. That keeps the per-engagement
 *      admin model intact and means the two writes that record an actor id
 *      (invite -> invited_by, purchase -> purchased_by) never persist a
 *      placeholder.
 *
 * Returns null when the user is neither a member nor a Greatstone admin, or
 * when the engagement does not exist / is closed.
 * Port: takes the caller ({ id, email }, a verified Better Auth user) instead of
 * an email; the lazily provisioned row carries the caller's user id.
 *
 * @param {any} db interviewDb client
 * @param {{ id: string, email: string }} caller
 * @param {string} engagementId
 * @returns {Promise<EmployeeContext | null>}
 */
export async function getAdminContextForEngagement(db, caller, engagementId) {
  const userId = caller?.id ? String(caller.id) : null;
  const email = typeof caller?.email === 'string' ? caller.email : '';
  if (!userId || !email) return null;
  // Tier 1: a genuine role on this exact engagement.
  const existing = await getEmployeeContextForEngagement(db, userId, engagementId);
  if (
    existing &&
    (existing.employee.portal_role === 'gs_admin' ||
      existing.employee.portal_role === 'client_admin')
  ) {
    return existing;
  }
  // A member with a lesser role (employee/team_leader) is not an admin here.
  if (existing) return null;

  // Tier 2: a global Greatstone admin acting on an engagement they have no row
  // on yet. Lazily provision a real gs_admin row, then resolve normally.
  if (!(await isGreatstoneAdmin(db, userId))) return null;
  const engagement = await getActiveEngagement(db, engagementId);
  if (!engagement) return null;

  // Provision the row and read it back in ONE round-trip. A separate
  // re-select after the write could miss the just-inserted row within the same
  // request (read-after-write across pooled connections), which would wrongly
  // refuse a global admin on first access. Returning the upserted row avoids
  // that entirely. Tier 2 only runs when no row existed, so this is an insert
  // in the normal path; on-conflict merge harmlessly covers a concurrent
  // double-open of a never-opened engagement.
  // Port: supabase-js `.upsert(row, { onConflict: 'engagement_id,email' }).select(<embed>)` becomes one
  // INSERT … ON CONFLICT DO UPDATE (merging every provided column, as PostgREST does) in a CTE, joined
  // back to engagement and org_unit to rebuild the same row shape. user_id is the caller (customer_id
  // comes from the engagement, by trigger); a conflicting row already claimed by someone else keeps its
  // user_id (the scope trigger refuses the change), so the upsert fails rather than takes it over.
  const { data: rows, error: upsertError } = await db.sql(
    `WITH up AS (
       INSERT INTO employee (engagement_id, unit_id, name, email, role_title, portal_role, status, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (engagement_id, email) DO UPDATE SET
         unit_id = EXCLUDED.unit_id, name = EXCLUDED.name, role_title = EXCLUDED.role_title,
         portal_role = EXCLUDED.portal_role, status = EXCLUDED.status, user_id = EXCLUDED.user_id
       RETURNING *)
     SELECT to_jsonb(up) AS employee, to_jsonb(g) AS engagement,
       CASE WHEN u.id IS NULL THEN NULL ELSE to_jsonb(u) END AS org_unit
       FROM up JOIN engagement g ON g.id = up.engagement_id
       LEFT JOIN org_unit u ON u.id = up.unit_id`,
    [
      engagementId,
      engagement.default_unit_id ?? null,
      'Greatstone',
      email.toLowerCase(),
      'Greatstone Consultant',
      'gs_admin',
      'invited',
      userId,
    ]
  );
  if (upsertError) {
    throw new Error(`admin provisioning failed: ${upsertError.message}`);
  }

  const r = (rows ?? [])[0];
  const row = r ? { ...r.employee, engagement: r.engagement, org_unit: r.org_unit ?? null } : undefined;
  if (!row) return getEmployeeContextForEngagement(db, userId, engagementId);
  const { engagement: eng, org_unit, ...employee } = row;
  return {
    employee,
    engagement: eng,
    orgUnit: org_unit ?? null,
  };
}
