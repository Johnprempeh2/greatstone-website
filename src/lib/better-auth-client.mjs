import { createAuthClient } from 'better-auth/client';
import { twoFactorClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({ plugins: [twoFactorClient()] });
const EVENT = 'greatstone-auth-changed';
export const notifyAuthChange = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT)); };

export async function getSession() {
  const { data } = await authClient.getSession();
  return data?.session ? { ...data.session, user: data.user } : null;
}

export function onAuth(callback) {
  if (typeof window === 'undefined') return { data: { subscription: { unsubscribe() {} } } };
  let active = true;
  const update = () => { getSession().then((session) => { if (active) callback(session); }).catch(() => { if (active) callback(null); }); };
  window.addEventListener(EVENT, update);
  window.addEventListener('focus', update);
  return { data: { subscription: { unsubscribe() { active = false; window.removeEventListener(EVENT, update); window.removeEventListener('focus', update); } } } };
}

// With two-factor on, the password step returns { twoFactorRedirect } and no session yet. Only the account page
// asks for the code; other sign-in forms send the visitor there.
export const TWO_FACTOR_ELSEWHERE = 'This account uses two-factor sign-in. Sign in on your account page first, then come back here.';
export async function signIn(email, password, { twoFactor = false } = {}) {
  const result = await authClient.signIn.email({ email: email.trim(), password });
  if (!result.error && result.data?.twoFactorRedirect) {
    return twoFactor ? { ...result, twoFactor: true } : { data: null, error: { message: TWO_FACTOR_ELSEWHERE, code: 'TWO_FACTOR_REQUIRED' } };
  }
  if (!result.error) notifyAuthChange();
  return result;
}

// Second sign-in step: a 6-digit authenticator code, or a recovery code (each works once).
export async function verifySignInCode(code, { recovery = false } = {}) {
  const value = String(code || '').trim();
  const result = recovery
    ? await authClient.twoFactor.verifyBackupCode({ code: value })
    : await authClient.twoFactor.verifyTotp({ code: value.replace(/\s/g, '') });
  if (!result.error) notifyAuthChange();
  return result;
}

// Account page: turn on (returns the otpauth:// link and the recovery codes), confirm with a first code,
// turn off with the password and a fresh code, or replace the recovery codes.
export const startTwoFactor = (password) => authClient.twoFactor.enable({ password });
export async function confirmTwoFactor(code) {
  const result = await authClient.twoFactor.verifyTotp({ code: String(code || '').replace(/\s/g, '') });
  if (!result.error) notifyAuthChange();
  return result;
}
export async function disableTwoFactor(password, code) {
  const compact = String(code || '').replace(/\s/g, '');
  const result = await authClient.twoFactor.disable({ password, code: /^\d{6}$/.test(compact) ? compact : String(code || '').trim() });
  if (!result.error) notifyAuthChange();
  return result;
}
export const replaceRecoveryCodes = (password) => authClient.twoFactor.generateBackupCodes({ password });

export async function signUp(email, password, name) {
  const result = await authClient.signUp.email({ email: email.trim(), password, name: name?.trim() || email.trim() });
  if (!result.error) notifyAuthChange();
  return result;
}

export async function signOut() {
  const result = await authClient.signOut();
  if (!result.error) notifyAuthChange();
  return result;
}

export async function signOutAll() {
  const result = await authClient.revokeSessions();
  if (result.error) return result;
  return signOut();
}

export const resendConfirmation = (email) => authClient.sendVerificationEmail({ email: email.trim(), callbackURL: '/#account' });
export const resetPassword = (email) => authClient.requestPasswordReset({ email: email.trim(), redirectTo: '/#account' });

export function resetTokenFromLocation(locationValue = typeof location !== 'undefined' ? location : null) {
  if (!locationValue) return null;
  return new URLSearchParams(locationValue.search).get('token') ||
    new URLSearchParams(String(locationValue.hash || '').split('?')[1] || '').get('token');
}

export async function updatePassword(newPassword, currentPassword) {
  const token = resetTokenFromLocation();
  const result = token
    ? await authClient.resetPassword({ newPassword, token })
    : await authClient.changePassword({ newPassword, currentPassword, revokeOtherSessions: true });
  if (!result.error) notifyAuthChange();
  return result;
}
