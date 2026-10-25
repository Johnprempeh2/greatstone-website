import { staffDb } from './staff-store-api.mjs';
import * as auth from '../lib/better-auth-client.mjs';

export const { signIn, resetPassword, signOut, getSession, onAuth } = auth;

export async function getStaffUser() {
  const session = await getSession();
  if (!session?.user) return null;
  const { data, error } = await staffDb.from('users')
    .select('id, email, full_name, role, org_id').eq('auth_subject', session.user.id).maybeSingle();
  return error ? null : data;
}

export const isStaff = (user) => !!user && ['owner', 'admin', 'editor'].includes(user.role);
