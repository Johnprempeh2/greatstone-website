// Dev-only: seed demo Supabase staff accounts so the unified admin login is demo-able across roles.
// These ARE catalogue staff (org_id + role + auth_subject), so one sign-in controls console + editor
// + catalogue. Idempotent. Run: node --env-file=.env scripts/seed-demo-staff.mjs   (NOT committed creds:
// the demo password matches the old prototype's public 'stone'.) Never touches John's owner account.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.VITE_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = '11111111-1111-4111-8111-111111111111';
if (!URL || !SERVICE) { console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const DEMO = [
  { email: 'admin@greatstone.dev', full_name: 'Studio Admin', role: 'admin' },
  { email: 'editor@greatstone.dev', full_name: 'Marketing Editor', role: 'editor' },
  { email: 'viewer@greatstone.dev', full_name: 'Reviewer', role: 'viewer' },
];
const PASSWORD = 'stone';

async function findAuthUser(email) {
  // page through admin.listUsers to find an existing auth user by email
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = (data.users || []).find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (!data.users || data.users.length < 200) break;
  }
  return null;
}

for (const d of DEMO) {
  let authId;
  let existing = await findAuthUser(d.email);
  if (existing) {
    authId = existing.id;
    // make sure the password is the known demo one
    await admin.auth.admin.updateUserById(authId, { password: PASSWORD, email_confirm: true });
    console.log(`auth: reused ${d.email}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email: d.email, password: PASSWORD, email_confirm: true });
    if (error) { console.error(`auth create ${d.email}:`, error.message); continue; }
    authId = data.user.id;
    console.log(`auth: created ${d.email}`);
  }
  // upsert the staff profile row (org + role + auth_subject) — by email
  const { data: row } = await admin.from('users').select('id').eq('email', d.email).maybeSingle();
  const now = new Date().toISOString();
  if (row) {
    const { error } = await admin.from('users').update({ role: d.role, full_name: d.full_name, auth_subject: authId, is_active: true, updated_at: now }).eq('id', row.id);
    console.log(error ? `users update ${d.email}: ${error.message}` : `users: updated ${d.email} (${d.role})`);
  } else {
    const { error } = await admin.from('users').insert({ id: crypto.randomUUID(), org_id: ORG_ID, email: d.email, full_name: d.full_name, role: d.role, auth_subject: authId, is_active: true, created_at: now, updated_at: now });
    console.log(error ? `users insert ${d.email}: ${error.message}` : `users: inserted ${d.email} (${d.role})`);
  }
}
console.log('done.');
