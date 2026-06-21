// Customer-side Supabase Auth helpers (mirrors adminAuth.mjs). A buyer's JWT drives the customer_self
// RLS (0008): they read only their own company's orders + profile. Provisioning of the customer +
// customer_user rows is the SECURITY DEFINER RPC ensure_customer_account() (idempotent; refuses staff).
import { supabase } from '../lib/supabase.mjs';

// Auth-email redirect (signup confirmation + password recovery). It must NOT carry a hash route.
// Supabase's implicit flow returns the session in the URL *fragment* (#access_token=…&type=…); if
// redirectTo already has a `#account` fragment the browser collapses the two into one mangled fragment,
// supabase-js can't parse the token, no session is created, and the visitor lands back on the sign-in
// screen (for recovery, the reset form never shows). Land on a bare URL so the fragment is clean —
// App's AUTH_LANDING detection then routes the landing to #account (and shows the reset form for recovery).
const authRedirect = () =>
  (typeof location !== 'undefined' ? location.origin + location.pathname : '');

/** Provision (or fetch) the customer + customer_user for the signed-in buyer. Idempotent; safe on
 * every login. No-ops gracefully if there's no session yet (e.g. email confirmation pending). */
export async function ensureAccount(companyName = null, fullName = null) {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;                       // not signed in yet (confirm-email flow) — provision on next login
  const { data, error } = await supabase.rpc('ensure_customer_account', { p_company_name: companyName, p_full_name: fullName });
  if (error) { console.warn('ensureAccount', error.message); return { error }; }
  return Array.isArray(data) ? data[0] : data;      // { customer_id, customer_user_id }
}

export async function signUp(email, password, { companyName = null, fullName = null } = {}) {
  if (!supabase) return { error: { message: 'Store backend not configured.' } };
  const res = await supabase.auth.signUp({
    email: (email || '').trim(), password,
    options: { data: { company_name: companyName, full_name: fullName }, emailRedirectTo: authRedirect() },
  });
  if (!res.error) await ensureAccount(companyName, fullName); // works immediately if confirmation is off
  return res;
}

export async function signIn(email, password) {
  if (!supabase) return { error: { message: 'Store backend not configured.' } };
  const res = await supabase.auth.signInWithPassword({ email: (email || '').trim(), password });
  if (!res.error) await ensureAccount();           // idempotent: provisions a first-time / confirmed buyer
  return res;
}

/** Re-send the signup confirmation email — the recovery path when a confirm link expired, was already
 * used, or got consumed by an email scanner/prefetch (Supabase confirm links are single-use). */
export async function resendConfirmation(email) {
  if (!supabase) return { error: { message: 'Store backend not configured.' } };
  return supabase.auth.resend({ type: 'signup', email: (email || '').trim(), options: { emailRedirectTo: authRedirect() } });
}

export async function signOut() { if (supabase) await supabase.auth.signOut(); }
/** Sign out of every device/session for this account (revokes all refresh tokens), not just this browser. */
export async function signOutAll() { if (!supabase) return { error: { message: 'Not configured.' } }; return supabase.auth.signOut({ scope: 'global' }); }
export async function getSession() { if (!supabase) return null; const { data } = await supabase.auth.getSession(); return data.session; }
export function onAuth(cb) { if (!supabase) return { data: { subscription: { unsubscribe() {} } } }; return supabase.auth.onAuthStateChange((_e, s) => cb(s)); }

export async function resetPassword(email) {
  if (!supabase) return { error: { message: 'Store backend not configured.' } };
  return supabase.auth.resetPasswordForEmail((email || '').trim(), { redirectTo: authRedirect() });
}
export async function updatePassword(newPassword) {
  if (!supabase) return { error: { message: 'Store backend not configured.' } };
  return supabase.auth.updateUser({ password: newPassword });
}

/** The signed-in buyer's profile: their contact row + company + tier (RLS-scoped via app_customer_id). */
export async function getCustomerProfile() {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('customer_users')
    .select('id, email, full_name, phone, is_primary, role, customer:customers(id, name, slug, domain, notes, created_at, tier:customer_tiers(name, rank))')
    .eq('auth_subject', user.id).maybeSingle();
  if (error) { console.warn('getCustomerProfile', error.message); return null; }
  return data;
}

export const isCustomer = (profile) => !!profile && !!profile.customer;
/** The signed-in buyer is their company's admin (primary contact / explicit admin role). */
export const isCompanyAdmin = (profile) => !!profile && (profile.is_primary === true || profile.role === 'admin');
