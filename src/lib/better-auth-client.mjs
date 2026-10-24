import { createAuthClient } from 'better-auth/client';

export const authClient = createAuthClient();
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

export async function signIn(email, password) {
  const result = await authClient.signIn.email({ email: email.trim(), password });
  if (!result.error) notifyAuthChange();
  return result;
}

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
