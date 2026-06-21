// Supabase Auth helpers for the catalogue admin. A signed-in user's JWT drives the staff_all
// write RLS (0004); the public.users row gives their role. Keeps catalogue admin auth separate
// from the legacy Puck-pages prototype session — additive, low-risk.
import { supabase } from '../lib/supabase.mjs';

export async function signIn(email, password) {
  if (!supabase) return { error: { message: 'Catalogue backend not configured.' } };
  return supabase.auth.signInWithPassword({ email: (email || '').trim(), password });
}

// Staff self-serve password reset. Same Supabase recovery flow the storefront uses: the email link lands
// on a bare URL (clean fragment — see customerAuth's authRedirect note), App routes it to the #account
// set-a-new-password form, and updateUser there works for any Supabase user (staff included).
export async function resetPassword(email) {
  if (!supabase) return { error: { message: 'Catalogue backend not configured.' } };
  const redirectTo = (typeof location !== 'undefined' ? location.origin + location.pathname : '');
  return supabase.auth.resetPasswordForEmail((email || '').trim(), { redirectTo });
}
export async function signOut() { if (supabase) { const { error } = await supabase.auth.signOut(); if (error) throw error; } }
export async function getSession() { if (!supabase) return null; const { data } = await supabase.auth.getSession(); return data.session; }
export function onAuth(cb) { if (!supabase) return { data: { subscription: { unsubscribe() {} } } }; return supabase.auth.onAuthStateChange((_e, s) => cb(s)); }

// The signed-in user's staff profile (role/org) from public.users — null if not staff.
export async function getStaffUser() {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('users')
    .select('id, email, full_name, role, org_id').eq('auth_subject', user.id).maybeSingle();
  if (error) { console.warn('getStaffUser', error); return null; }
  return data; // role ∈ owner/admin/editor/sales/viewer (or null if no profile row)
}
export const isStaff = (u) => !!u && ['owner', 'admin', 'editor'].includes(u.role);
