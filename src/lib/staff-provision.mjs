// Staff provisioning validator. A staff member signs in with a Supabase Auth user; the app then maps
// auth.uid() → a public.users row (auth_subject) to learn their org + role (see app_staff_org() in
// migration 0004). If that link, role, org or active flag is wrong, the person either can't sign in or
// signs in with no powers — a launch-day failure that is invisible until someone tries. This checks a set
// of public.users rows (and, when available, the Auth user list) for exactly those faults.
//
// Pure + unit-tested: no Supabase import. scripts/verify-staff.mjs pulls the real rows and runs this.
import { STAFF_CAPS, isCmsRole, ROLE_LABEL } from '../cms/staffRoles.mjs';

// The canonical Greatstone org (same id the migrations seed, e.g. org_settings in 0005).
export const GREATSTONE_ORG_ID = '11111111-1111-4111-8111-111111111111';

// row shape (subset of public.users): { id, email, full_name, role, auth_subject, is_active, deleted_at, org_id }
// opts.authUsers (optional): [{ id, email }] from auth.admin.listUsers() — enables orphan cross-checks.
// opts.customerAuthIds (optional): auth ids that belong to CUSTOMERS (customer_users.auth_subject). Customers
//   legitimately have an Auth user with no staff profile, so they must NOT be flagged as orphan_auth.
// Returns { ok, errors, warnings, issues:[{level,code,message,email}], liveCount, managerCount }.
export function validateStaff(rows, opts = {}) {
  const orgId = opts.orgId === undefined ? GREATSTONE_ORG_ID : opts.orgId;
  const authUsers = Array.isArray(opts.authUsers) ? opts.authUsers : null;
  const customerAuthIds = new Set(Array.isArray(opts.customerAuthIds) ? opts.customerAuthIds : []);
  const all = Array.isArray(rows) ? rows : [];
  const live = all.filter((r) => !r.deleted_at);
  const issues = [];
  const add = (level, code, message, email) => issues.push({ level, code, message, email: email || null });
  const who = (r) => r.email || r.id || '(unknown)';

  // per live-staff-row checks
  for (const r of live) {
    if (!r.auth_subject) add('error', 'no_auth_link', `${who(r)}: no auth_subject — a profile with no linked sign-in can never sign in.`, r.email);
    if (!r.role || !STAFF_CAPS[r.role]) add('error', 'bad_role', `${who(r)}: role ${JSON.stringify(r.role)} is not a recognised org_role.`, r.email);
    if (r.is_active === false) add('warn', 'inactive', `${who(r)}: is_active is false — cannot act as staff until reactivated.`, r.email);
    if (orgId && r.org_id && r.org_id !== orgId) add('error', 'wrong_org', `${who(r)}: org_id ${r.org_id} is not the Greatstone org.`, r.email);
  }

  // soft-deleted rows that still look live (access should be fully revoked)
  for (const r of all.filter((r) => r.deleted_at)) {
    if (r.auth_subject && r.is_active !== false) add('warn', 'deleted_but_live', `${who(r)}: soft-deleted but still active + auth-linked — confirm access is revoked.`, r.email);
  }

  // cross-row duplicates among live staff
  const bySub = new Map();
  const byEmail = new Map();
  for (const r of live) {
    if (r.auth_subject) bySub.set(r.auth_subject, (bySub.get(r.auth_subject) || []).concat(r));
    if (r.email) { const k = String(r.email).toLowerCase(); byEmail.set(k, (byEmail.get(k) || []).concat(r)); }
  }
  for (const [sub, rs] of bySub) if (rs.length > 1) add('error', 'dup_auth', `auth_subject ${sub} is shared by ${rs.length} profiles (${rs.map((r) => r.email).join(', ')}) — app_staff_org() would be ambiguous.`);
  for (const [em, rs] of byEmail) if (rs.length > 1) add('error', 'dup_email', `email ${em} is on ${rs.length} live profiles.`);

  // there must be at least one usable manager (owner/admin) so staff + publishing can be managed
  const managers = live.filter((r) => STAFF_CAPS[r.role] && STAFF_CAPS[r.role].manageUsers && r.auth_subject && r.is_active !== false);
  if (!managers.length) add('error', 'no_manager', 'No active owner/admin with a linked sign-in — nobody can manage staff or publish.');
  // and at least one account that can actually use the CMS console (owner/admin/editor)
  if (!live.some((r) => isCmsRole(r.role) && r.auth_subject && r.is_active !== false)) add('warn', 'no_cms_user', 'No active owner/admin/editor with a linked sign-in — nobody can open the editor.');

  // optional Auth cross-check
  if (authUsers) {
    const authById = new Map(authUsers.map((u) => [u.id, u]));
    const profileSubs = new Set(live.map((r) => r.auth_subject).filter(Boolean));
    for (const r of live) {
      if (r.auth_subject && !authById.has(r.auth_subject)) add('error', 'orphan_profile', `${who(r)}: auth_subject ${r.auth_subject} has no matching Auth user — they cannot sign in.`, r.email);
      const au = authById.get(r.auth_subject);
      if (au && au.email && r.email && String(au.email).toLowerCase() !== String(r.email).toLowerCase()) add('warn', 'email_mismatch', `${who(r)}: profile email differs from the Auth email (${au.email}).`, r.email);
    }
    for (const au of authUsers) {
      // Customers (customer_users) are Auth users by design, so only flag an Auth user that is NEITHER staff
      // NOR a known customer — that is the "created a login, forgot the staff profile" case worth surfacing.
      if (!profileSubs.has(au.id) && !customerAuthIds.has(au.id)) add('warn', 'orphan_auth', `${au.email || au.id}: an Auth user with no staff profile or customer record — would see "no role assigned".`);
    }
  }

  const errors = issues.filter((i) => i.level === 'error').length;
  return { ok: errors === 0, errors, warnings: issues.length - errors, issues, liveCount: live.length, managerCount: managers.length };
}

// A compact roster summary for a report header: total, live, and a per-role count (with labels).
export function summariseStaff(rows) {
  const all = Array.isArray(rows) ? rows : [];
  const live = all.filter((r) => !r.deleted_at);
  const byRole = {};
  for (const r of live) {
    const key = r.role && STAFF_CAPS[r.role] ? r.role : (r.role ? `${r.role} (unknown)` : '(no role)');
    byRole[key] = (byRole[key] || 0) + 1;
  }
  return { total: all.length, live: live.length, byRole, roleLabel: ROLE_LABEL };
}
