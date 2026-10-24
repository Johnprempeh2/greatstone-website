import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { getPool } from './db.mjs';
import { authServerPool } from './auth-server-pool.mjs';
import { sendEmail } from '../../../supabase/functions/_shared/front-door-leads.mjs';

async function sendAuthMail(to, subject, url) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) throw new Error('Auth email is not configured');
  const result = await sendEmail({ apiKey: key, from, to, subject, text: url });
  if (!result.sent) throw new Error('Auth email delivery failed');
}

async function checkPassword({ hash, password }) {
  // Imported Supabase identities retain their bcrypt hashes. New and reset
  // passwords use Better Auth's current scrypt format.
  if (/^\$2[aby]\$/.test(hash)) {
    const { compare } = await import('bcryptjs');
    return compare(password, hash);
  }
  return verifyPassword({ hash, password });
}

export function createAuthRequest(pool = getPool(), sendMail = sendAuthMail) {
  if (!pool) throw new Error('Auth database is not configured');
  const baseURL = process.env.BETTER_AUTH_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!baseURL || !secret || secret.length < 32) throw new Error('Auth URL or secret is not configured');
  const database = authServerPool(pool);
  const auth = betterAuth({
    database,
    baseURL,
    secret,
    trustedOrigins: [baseURL],
    advanced: { database: { generateId: () => randomUUID() } },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      password: { hash: hashPassword, verify: checkPassword },
      sendResetPassword: ({ user, url }) => sendMail(user.email, 'Reset your password', url),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      sendVerificationEmail: ({ user, url }) => sendMail(user.email, 'Verify your email', url),
    },
  });
  return { auth, finish: database.finish };
}

export async function sessionFromRequest(request, create = createAuthRequest) {
  const scoped = create();
  try {
    const session = await scoped.auth.api.getSession({ headers: request.headers });
    await scoped.finish(true);
    return session;
  } catch (error) {
    await scoped.finish(false);
    throw error;
  }
}

export async function userFromRequest(request, verify) {
  if (verify) {
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') || '')?.[1];
    return token ? verify(token) : null;
  }
  const result = await sessionFromRequest(request);
  return result?.user || null;
}

export function authIdentity(user) {
  return { id: user.id, email: user.email || null,
    email_verified: user.emailVerified === true || !!user.email_confirmed_at };
}
