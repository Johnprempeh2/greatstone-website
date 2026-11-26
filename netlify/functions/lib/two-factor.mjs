// Two-factor sign-in for site accounts (GRE-6335), on Better Auth's two-factor plugin.
//
// The plugin encrypts the authenticator secret with BETTER_AUTH_SECRET. Its recovery codes would be encrypted
// too, so they could be read back; here they are stored only as keyed hashes. A before hook hashes the code a
// visitor types, so the plugin compares hash with hash, removes the used one and refuses it next time.
// Turning two-factor off needs the password and a fresh authenticator or recovery code.
import { createHmac, randomInt } from 'node:crypto';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins';

const HASHED = 'h1:';
// No 0/O or 1/I, so a code read off paper is typed right first time.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TOTP = /^\d{6}$/;

export function newRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const chars = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

export const normaliseRecoveryCode = (code) => {
  const chars = String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return chars.length === 10 ? `${chars.slice(0, 5)}-${chars.slice(5)}` : chars;
};

export function hashRecoveryCode(secret, code) {
  return HASHED + createHmac('sha256', secret).update(`gs-recovery:${normaliseRecoveryCode(code)}`).digest('hex');
}

// What the plugin stores. It passes the new plain codes at enrol, and the remaining hashes after a code is used.
export function recoveryCodeStore(secret) {
  return {
    encrypt: async (json) => JSON.stringify(JSON.parse(json).map((c) => (String(c).startsWith(HASHED) ? c : hashRecoveryCode(secret, c)))),
    decrypt: async (stored) => stored,
  };
}

export function twoFactorOptions(secret) {
  return {
    issuer: 'Greatstone',
    backupCodeOptions: { storeBackupCodes: recoveryCodeStore(secret), customBackupCodesGenerate: () => newRecoveryCodes() },
    accountLockout: { maxFailedAttempts: 10, durationSeconds: 900 },
  };
}

export function twoFactorHooks(secret, getAuth) {
  return [
    {
      // Every typed recovery code is hashed, so a stored hash typed back in is never accepted.
      matcher: (ctx) => ctx.path === '/two-factor/verify-backup-code',
      handler: createAuthMiddleware(async (ctx) => ({
        context: { body: { ...ctx.body, code: hashRecoveryCode(secret, ctx.body?.code) } },
      })),
    },
    {
      matcher: (ctx) => ctx.path === '/two-factor/disable',
      handler: createAuthMiddleware(async (ctx) => {
        const code = String(ctx.body?.code ?? '').trim();
        if (!code) throw new APIError('BAD_REQUEST', { message: 'Enter a code from your authenticator app or a recovery code.', code: 'TWO_FACTOR_CODE_REQUIRED' });
        const auth = getAuth();
        const headers = ctx.headers;
        try {
          if (TOTP.test(code)) await auth.api.verifyTOTP({ body: { code }, headers });
          else await auth.api.verifyBackupCode({ body: { code, disableSession: true }, headers });
        } catch {
          throw new APIError('UNAUTHORIZED', { message: 'That code is not right. Try a new code.', code: 'INVALID_CODE' });
        }
      }),
    },
  ];
}

export function twoFactorPlugin(secret, getAuth) {
  const plugin = twoFactor(twoFactorOptions(secret));
  return { ...plugin, hooks: { ...plugin.hooks, before: [...(plugin.hooks?.before || []), ...twoFactorHooks(secret, getAuth)] } };
}

// The /two-factor/* endpoints are limited per client IP in the database, so the limit holds across function
// instances. Every other auth path keeps its current behaviour (no limiter), so sign-in and sign-up are unchanged.
export const rateLimit = {
  enabled: true,
  storage: 'database',
  customRules: {
    '/two-factor/*': { window: 60, max: 10 },
    '/**': false,
  },
};
