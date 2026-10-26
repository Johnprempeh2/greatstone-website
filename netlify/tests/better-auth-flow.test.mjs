import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { hashSync } from 'bcryptjs';
import { startPostgres, skip } from './lib/postgres.mjs';
import { createAuthRequest } from '../functions/lib/better-auth.mjs';
import { cleanVerificationRedirect, makeAuthHandler } from '../functions/auth.mjs';

const origin = 'http://localhost:5181';
let db;
let pool;
let previous;
const mail = [];
const auditedStatements = [];
const auditedPool = {
  async connect() {
    const client = await pool.connect();
    const raw = client.query.bind(client);
    let inBridge = false;
    const query = async (...args) => {
      const statement = typeof args[0] === 'string' ? args[0] : args[0]?.text || '';
      const result = await raw(...args);
      if (/^SET LOCAL ROLE auth_server$/i.test(statement)) inBridge = true;
      else if (/^(COMMIT|ROLLBACK)$/i.test(statement)) inBridge = false;
      if (inBridge) {
        const { rows } = await raw('SELECT current_user AS role');
        auditedStatements.push({ role: rows[0].role, afterInnerCommit: /^RELEASE SAVEPOINT/.test(statement) });
      }
      return result;
    };
    return { query, release: () => client.release() };
  },
};

before(async () => {
  if (skip) return;
  db = startPostgres('auth-flow');
  await db.migrate();
  pool = new pg.Pool({ connectionString: db.url, max: 1 });
  previous = { url: process.env.BETTER_AUTH_URL, secret: process.env.BETTER_AUTH_SECRET };
  process.env.BETTER_AUTH_URL = origin;
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('base64');
});
after(async () => {
  await pool?.end();
  db?.stop();
  if (previous) {
    if (previous.url === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = previous.url;
    if (previous.secret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previous.secret;
  }
});

async function call(path, body, headers = {}) {
  const handler = makeAuthHandler(() => createAuthRequest(auditedPool, async (to, subject, url) => { mail.push({ to, subject, url }); }));
  return handler(new Request(`${origin}/api/auth/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', origin, ...headers },
      body: body ? JSON.stringify(body) : undefined,
    }));
}

test('sign-up writes user and account in nested transaction and keeps uuid; verification enables sign-in', { skip }, async () => {
  const email = 'auth-flow@example.test';
  const password = 'test-password-only-48';
  const signUp = await call('sign-up/email', { name: 'Test User', email, password });
  assert.equal(signUp.status, 200, await signUp.clone().text());
  const { user } = await signUp.json();
  assert.match(user.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  const stored = db.psql(`SELECT count(*) FROM better_auth."account" WHERE "userId"='${user.id}'`);
  assert.equal(stored.stdout.trim(), '1', stored.stderr);
  assert.ok(auditedStatements.length >= 4, `recorded ${auditedStatements.length} Better Auth sign-up statements`);
  assert.ok(auditedStatements.every((item) => item.role === 'auth_server'), 'every statement retained auth_server');
  assert.ok(auditedStatements.some((item) => item.afterInnerCommit), 'sign-up used a nested transaction');
  assert.equal(db.psql(`SELECT id FROM auth.users WHERE email='${email}'`).stdout.trim(), user.id);
  assert.equal(mail.length, 1);
  const denied = await call('sign-in/email', { email, password });
  assert.notEqual(denied.status, 200, 'unverified email cannot sign in');
  const verified = await call(new URL(mail[0].url).pathname.replace('/api/auth/', '') + new URL(mail[0].url).search);
  assert.ok([200, 302].includes(verified.status), `verification: ${verified.status}`);
  const landing = new URL(verified.headers.get('location'), origin);
  assert.equal(landing.pathname, '/');
  assert.equal(landing.searchParams.get('verified'), '1');
  assert.equal(landing.searchParams.has('token'), false);
  assert.equal(landing.searchParams.has('callbackURL'), false);
  assert.equal(verified.headers.get('referrer-policy'), 'no-referrer');
  const invalid = await call('verify-email?token=invalid-test&callbackURL=%2F');
  const invalidLanding = new URL(invalid.headers.get('location'), origin);
  assert.equal(invalidLanding.searchParams.get('error'), 'INVALID_TOKEN');
  assert.equal(invalidLanding.searchParams.has('token'), false);
  assert.equal(invalidLanding.searchParams.has('callbackURL'), false);
  const signedIn = await call('sign-in/email', { email, password });
  assert.equal(signedIn.status, 200, await signedIn.text());
  assert.match(signedIn.headers.get('set-cookie') || '', /better-auth\.session_token/);
  const cookie = (signedIn.headers.get('set-cookie') || '').split(';')[0];
  const session = await call('get-session', undefined, { cookie });
  assert.equal((await session.json()).user.id, user.id);

  const requested = await call('request-password-reset', { email, redirectTo: '/#account' });
  assert.equal(requested.status, 200, await requested.clone().text());
  const resetMail = mail.find((item) => item.subject === 'Reset your password');
  assert.ok(resetMail);
  const resetUrl = new URL(resetMail.url);
  const redirected = await call(resetUrl.pathname.replace('/api/auth/', '') + resetUrl.search);
  assert.ok([200, 302].includes(redirected.status));
  const token = new URL(redirected.headers.get('location') || origin + resetUrl.search).searchParams.get('token');
  assert.ok(token, 'reset link returns token to account page');
  const reset = await call('reset-password', { newPassword: 'new-test-password-48', token });
  assert.equal(reset.status, 200, await reset.clone().text());
  const oldPassword = await call('sign-in/email', { email, password });
  assert.notEqual(oldPassword.status, 200);
  const newPassword = await call('sign-in/email', { email, password: 'new-test-password-48' });
  assert.equal(newPassword.status, 200, await newPassword.clone().text());
});

test('verification redirect drops sensitive callback query without changing other auth redirects', () => {
  const request = new Request(`${origin}/api/auth/verify-email?token=secret&callbackURL=%2F`);
  const response = Response.redirect(`${origin}/?token=secret&callbackURL=%2F#account`);
  const cleaned = cleanVerificationRedirect(request, response);
  assert.equal(cleaned.headers.get('location'), '/?verified=1#account');
  assert.equal(cleaned.headers.get('referrer-policy'), 'no-referrer');
  const other = cleanVerificationRedirect(new Request(`${origin}/api/auth/sign-in/email`), response);
  assert.equal(other, response);
});

test('an imported bcrypt password signs in under the original UUID', { skip }, async () => {
  const id = 'c0ffee00-0000-4000-8000-000000000049';
  const email = 'legacy-auth-flow@example.test';
  const password = 'legacy-test-password-49';
  await pool.query('INSERT INTO better_auth."user" ("id","name","email","emailVerified") VALUES ($1,$2,$3,true)', [id, 'Legacy Test', email]);
  await pool.query('INSERT INTO better_auth."account" ("id","accountId","providerId","userId","password") VALUES ($1,$2,$3,$4,$5)',
    ['legacy-account-49', id, 'credential', id, hashSync(password, 4)]);
  const response = await call('sign-in/email', { email, password });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).user.id, id);
});
