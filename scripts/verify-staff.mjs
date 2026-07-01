#!/usr/bin/env node
// verify-staff.mjs — read-only pre-launch check that every staff account is provisioned so the person can
// actually sign in and has the right powers. ALL logic lives in src/lib/staff-provision.mjs (unit-tested);
// this file is just I/O: it reads public.users (+ the Auth user list when reachable) and prints a report.
// It writes NOTHING. Exit code 1 when there are blocking errors, so it can gate a cutover.
//
//   Usage:
//     node scripts/verify-staff.mjs               # check public.users + cross-check the Auth user list
//     node scripts/verify-staff.mjs --no-auth      # skip the Auth cross-check (only needs the DB)
//     node scripts/verify-staff.mjs --org <uuid>   # override the expected org
//
//   Env (server-side, NEVER the client bundle):
//     SUPABASE_URL (or VITE_SUPABASE_URL)   — the target project's URL
//     SUPABASE_SERVICE_ROLE_KEY             — service-role key (reads users + auth.admin)
//   e.g.  node --env-file=.env scripts/verify-staff.mjs
//
// See docs/STAFF-PROVISIONING.md for how to provision an account in the first place.
import { createClient } from '@supabase/supabase-js';
import { validateStaff, summariseStaff, GREATSTONE_ORG_ID } from '../src/lib/staff-provision.mjs';

const args = process.argv.slice(2);
const noAuth = args.includes('--no-auth');
const orgOverride = (() => { const i = args.indexOf('--org'); return i >= 0 ? args[i + 1] : null; })();
const orgId = orgOverride || GREATSTONE_ORG_ID;

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('✗ Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY. Try: node --env-file=.env scripts/verify-staff.mjs');
  process.exit(2);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

async function loadStaff() {
  const { data, error } = await sb.from('users').select('id,email,full_name,role,auth_subject,is_active,deleted_at,org_id');
  if (error) throw new Error('reading users: ' + error.message);
  return data || [];
}

async function loadCustomerAuthIds() {
  // customers hold an Auth user too (customer_users.auth_subject); exclude them from the orphan-auth check.
  const { data, error } = await sb.from('customer_users').select('auth_subject').not('auth_subject', 'is', null).is('deleted_at', null);
  if (error) { console.warn('! Could not read customer_users (' + error.message + ') — customer Auth users may show as orphans.'); return []; }
  return (data || []).map((r) => r.auth_subject).filter(Boolean);
}

async function loadAuthUsers() {
  // paginate through the Auth admin list; tolerate the API being unavailable (returns null → skip cross-check)
  try {
    const out = [];
    for (let page = 1; page <= 50; page++) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const users = (data && data.users) || [];
      out.push(...users.map((u) => ({ id: u.id, email: u.email })));
      if (users.length < 200) break;
    }
    return out;
  } catch (e) {
    console.warn('! Auth admin list unavailable (' + e.message + ') — skipping the Auth cross-check.');
    return null;
  }
}

function report(res, summary) {
  console.log('\nGreatstone staff provisioning check');
  console.log('  org: ' + orgId);
  console.log('  profiles: ' + summary.total + ' total, ' + summary.live + ' live');
  const roles = Object.entries(summary.byRole).map(([r, n]) => `${n} ${r}`).join(', ') || '(none)';
  console.log('  roles: ' + roles);
  console.log('  managers (owner/admin, active + linked): ' + res.managerCount);

  const errors = res.issues.filter((i) => i.level === 'error');
  const warns = res.issues.filter((i) => i.level === 'warn');
  if (errors.length) {
    console.log('\n  ERRORS (block launch):');
    for (const i of errors) console.log('   ✗ [' + i.code + '] ' + i.message);
  }
  if (warns.length) {
    console.log('\n  WARNINGS (worth a look):');
    for (const i of warns) console.log('   ! [' + i.code + '] ' + i.message);
  }
  console.log('');
  if (res.ok) console.log('✓ Staff provisioning OK (' + res.warnings + ' warning' + (res.warnings === 1 ? '' : 's') + ').');
  else console.log('✗ Staff provisioning has ' + res.errors + ' blocking error' + (res.errors === 1 ? '' : 's') + '.');
}

try {
  const rows = await loadStaff();
  const authUsers = noAuth ? null : await loadAuthUsers();
  const customerAuthIds = noAuth ? [] : await loadCustomerAuthIds();
  const res = validateStaff(rows, { orgId, authUsers, customerAuthIds });
  report(res, summariseStaff(rows));
  process.exit(res.ok ? 0 : 1);
} catch (e) {
  console.error('✗ ' + e.message);
  process.exit(2);
}
