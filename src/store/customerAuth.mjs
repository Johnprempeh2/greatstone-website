import { customerStore } from './customer-store-api.mjs';
import * as auth from '../lib/better-auth-client.mjs';

export const { getSession, onAuth, signOut, signOutAll, resetPassword, resendConfirmation, updatePassword,
  startTwoFactor, confirmTwoFactor, disableTwoFactor, replaceRecoveryCodes, notifyAuthChange } = auth;

export async function ensureAccount(companyName = null, fullName = null) {
  if (!await getSession()) return null;
  const { data, error } = await customerStore('ensure', { companyName, fullName });
  if (error) return { error };
  return Array.isArray(data) ? data[0] : data;
}

export async function signUp(email, password, { companyName = null, fullName = null } = {}) {
  // The verified user is provisioned on first sign-in. Better Auth keeps the
  // login separate from the customer row governed by authenticated RLS.
  return auth.signUp(email, password, fullName || companyName);
}

// The account page is the one sign-in form that asks for a two-factor code: { twoFactor: true } means
// "ask for the code next", then finishSignIn(code) completes it.
export async function signIn(email, password) {
  const result = await auth.signIn(email, password, { twoFactor: true });
  if (!result.error && !result.twoFactor) {
    await ensureAccount();
    auth.notifyAuthChange();
  }
  return result;
}

export async function finishSignIn(code, { recovery = false } = {}) {
  const result = await auth.verifySignInCode(code, { recovery });
  if (!result.error) {
    await ensureAccount();
    auth.notifyAuthChange();
  }
  return result;
}

export async function getCustomerProfile() {
  if (!await getSession()) return null;
  const { data, error } = await customerStore('profile');
  return error ? null : data;
}

// A reload that comes back empty for the same signed-in user (a session swap mid-flight, such as turning on
// two-factor) keeps the customer profile we had, so the account page does not drop to "No customer account"
// and unmount what is on screen (GRE-6351). A different user, or a first load, takes the new value.
export const nextProfile = (previous, loaded, sameUser) => (loaded == null && sameUser && isCustomer(previous) ? previous : loaded);

export const isCustomer = (profile) => !!profile?.customer;
export const isCompanyAdmin = (profile) => !!profile && (profile.is_primary === true || profile.role === 'admin');
