// GRE-6335: two-factor sign-in end to end through the real auth handler and Postgres (migration 078).
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { hashSync } from 'bcryptjs';
import { startPostgres, skip, MIGRATIONS } from './lib/postgres.mjs';
import { createAuthRequest } from '../functions/lib/better-auth.mjs';
import { makeAuthHandler } from '../functions/auth.mjs';
import { hashRecoveryCode, newRecoveryCodes, normaliseRecoveryCode, recoveryCodeStore } from '../functions/lib/two-factor.mjs';

const origin = 'http://localhost:5181';
let db;
let pool;
let previous;
let ipSeq = 0;

before(async () => {
  if (skip) return;
  db = startPostgres('two-factor');
  await db.migrate();
  pool = new pg.Pool({ connectionString: db.url, max: 2 });
  previous = { url: process.env.BETTER_AUTH_URL, secret: process.env.BETTER_AUTH_SECRET };
  process.env.BETTER_AUTH_URL = origin;
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('base64');
});
after(async () => {
  await pool?.end();
  db?.stop();
  for (const [key, name] of [['url', 'BETTER_AUTH_URL'], ['secret', 'BETTER_AUTH_SECRET']]) {
    if (!previous) break;
    if (previous[key] === undefined) delete process.env[name];
    else process.env[name] = previous[key];
  }
});

// A browser: one client IP and a cookie jar.
function browser() {
  const ip = `203.0.113.${++ipSeq}`;
  const jar = new Map();
  return {
    jar,
    async call(path, body) {
      const handler = makeAuthHandler(() => createAuthRequest(pool, async () => {}));
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const response = await handler(new Request(`${origin}/api/auth/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json', origin, 'x-nf-client-connection-ip': ip, ...(cookie ? { cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      }));
      for (const line of response.headers.getSetCookie()) {
        const [pair, ...attrs] = line.split(';');
        const at = pair.indexOf('=');
        const name = pair.slice(0, at).trim();
        const value = pair.slice(at + 1);
        if (!value || attrs.some((a) => /max-age=0\b/i.test(a.trim()))) jar.delete(name);
        else jar.set(name, value);
      }
      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* not json */ }
      return { status: response.status, json, text };
    },
    hasSession: () => [...jar.keys()].some((k) => k.endsWith('session_token')),
  };
}

// RFC 6238 code from the otpauth:// URI, as an authenticator app would compute it.
function base32Decode(text) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of text.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(uri, offsetSteps = 0) {
  const secret = base32Decode(new URL(uri).searchParams.get('secret'));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offsetSteps));
  const mac = createHmac('sha1', secret).update(counter).digest();
  const o = mac[mac.length - 1] & 0xf;
  return String((mac.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}
const wrongCode = (uri) => { const right = totp(uri); return right === '000000' ? '111111' : '000000'; };

let userSeq = 0;
async function makeUser() {
  const n = ++userSeq;
  const id = `c0ffee00-0000-4000-8000-0000000060${String(n).padStart(2, '0')}`;
  const email = `two-factor-${n}@example.test`;
  const password = `two-factor-test-password-${n}`;
  await pool.query('INSERT INTO better_auth."user" ("id","name","email","emailVerified") VALUES ($1,$2,$3,true)', [id, 'Test', email]);
  await pool.query('INSERT INTO better_auth."account" ("id","accountId","providerId","userId","password") VALUES ($1,$2,$3,$4,$5)',
    [`account-60${n}`, id, 'credential', id, hashSync(password, 4)]);
  return { id, email, password };
}

async function enrol(user) {
  const b = browser();
  const signedIn = await b.call('sign-in/email', { email: user.email, password: user.password });
  assert.equal(signedIn.status, 200, signedIn.text);
  const enabled = await b.call('two-factor/enable', { password: user.password });
  assert.equal(enabled.status, 200, enabled.text);
  const confirmed = await b.call('two-factor/verify-totp', { code: totp(enabled.json.totpURI) });
  assert.equal(confirmed.status, 200, confirmed.text);
  return { b, uri: enabled.json.totpURI, codes: enabled.json.backupCodes };
}

test('recovery codes: readable alphabet, normalised input, hashes only in storage', async () => {
  const codes = newRecoveryCodes();
  assert.equal(codes.length, 10);
  for (const c of codes) assert.match(c, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(new Set(codes).size, 10);
  assert.equal(normaliseRecoveryCode(' abcde fghjk '), 'ABCDE-FGHJK');
  assert.equal(hashRecoveryCode('k', 'abcdefghjk'), hashRecoveryCode('k', 'ABCDE-FGHJK'));
  assert.notEqual(hashRecoveryCode('k', 'ABCDE-FGHJK'), hashRecoveryCode('other-key', 'ABCDE-FGHJK'));
  const store = recoveryCodeStore('k');
  const stored = JSON.parse(await store.encrypt(JSON.stringify(codes)));
  assert.ok(stored.every((h) => /^h1:[0-9a-f]{64}$/.test(h)));
  assert.deepEqual(JSON.parse(await store.encrypt(JSON.stringify(stored))), stored, 're-storing hashes does not hash twice');
});

test('enrol: confirm code is required, the secret is encrypted and recovery codes are hashed', { skip }, async () => {
  const user = await makeUser();
  const b = browser();
  assert.equal((await b.call('sign-in/email', { email: user.email, password: user.password })).status, 200);
  assert.equal((await b.call('two-factor/enable', { password: 'not-the-password' })).status, 400, 'enrol needs the password');
  const enabled = await b.call('two-factor/enable', { password: user.password });
  assert.equal(enabled.status, 200, enabled.text);
  assert.match(enabled.json.totpURI, /^otpauth:\/\/totp\/Greatstone:/);
  assert.equal(enabled.json.backupCodes.length, 10);

  const { rows: [row] } = await pool.query('SELECT "secret","backupCodes","verified" FROM better_auth."twoFactor" WHERE "userId"=$1', [user.id]);
  const plainSecret = Buffer.from(base32Decode(new URL(enabled.json.totpURI).searchParams.get('secret'))).toString();
  assert.ok(!row.secret.includes(plainSecret), 'secret is not stored in plain text');
  assert.equal(row.verified, false, 'not on until a code is confirmed');
  const stored = JSON.parse(row.backupCodes);
  assert.equal(stored.length, 10);
  for (const code of enabled.json.backupCodes) assert.ok(!row.backupCodes.includes(code), 'no plain recovery code stored');
  assert.ok(stored.every((h) => h.startsWith('h1:')));

  // still off: signing in elsewhere does not ask for a code yet
  const other = browser();
  assert.equal((await other.call('sign-in/email', { email: user.email, password: user.password })).json.twoFactorRedirect, undefined);

  assert.equal((await b.call('two-factor/verify-totp', { code: wrongCode(enabled.json.totpURI) })).status, 401);
  const confirmed = await b.call('two-factor/verify-totp', { code: totp(enabled.json.totpURI) });
  assert.equal(confirmed.status, 200, confirmed.text);
  const { rows: [after] } = await pool.query('SELECT u."twoFactorEnabled", t."verified" FROM better_auth."user" u JOIN better_auth."twoFactor" t ON t."userId"=u."id" WHERE u."id"=$1', [user.id]);
  assert.deepEqual(after, { twoFactorEnabled: true, verified: true });
  const session = await b.call('get-session');
  assert.equal(session.json.user.twoFactorEnabled, true, 'the account page can see 2FA is on');
});

test('sign in asks for the authenticator code; a wrong code gives no session', { skip }, async () => {
  const user = await makeUser();
  const { uri } = await enrol(user);
  const b = browser();
  const first = await b.call('sign-in/email', { email: user.email, password: user.password });
  assert.equal(first.status, 200, first.text);
  assert.equal(first.json.twoFactorRedirect, true);
  assert.deepEqual(first.json.twoFactorMethods, ['totp']);
  assert.equal(b.hasSession(), false, 'no session before the code');
  assert.equal((await b.call('get-session')).json, null);

  assert.equal((await b.call('two-factor/verify-totp', { code: wrongCode(uri) })).status, 401);
  assert.equal(b.hasSession(), false);
  const ok = await b.call('two-factor/verify-totp', { code: totp(uri) });
  assert.equal(ok.status, 200, ok.text);
  assert.equal((await b.call('get-session')).json.user.id, user.id);
});

test('a recovery code signs in once and is refused the second time', { skip }, async () => {
  const user = await makeUser();
  const { codes } = await enrol(user);
  const typed = codes[0].toLowerCase().replace('-', ' ');

  const b = browser();
  assert.equal((await b.call('sign-in/email', { email: user.email, password: user.password })).json.twoFactorRedirect, true);
  const used = await b.call('two-factor/verify-backup-code', { code: typed });
  assert.equal(used.status, 200, used.text);
  assert.equal((await b.call('get-session')).json.user.id, user.id);
  const { rows: [row] } = await pool.query('SELECT "backupCodes" FROM better_auth."twoFactor" WHERE "userId"=$1', [user.id]);
  assert.equal(JSON.parse(row.backupCodes).length, 9);

  const again = browser();
  assert.equal((await again.call('sign-in/email', { email: user.email, password: user.password })).json.twoFactorRedirect, true);
  assert.equal((await again.call('two-factor/verify-backup-code', { code: codes[0] })).status, 401, 'reuse refused');
  // the stored hash typed back in is hashed again, so it never matches
  assert.equal((await again.call('two-factor/verify-backup-code', { code: JSON.parse(row.backupCodes)[0] })).status, 401);
  assert.equal(again.hasSession(), false);
  const other = await again.call('two-factor/verify-backup-code', { code: codes[1] });
  assert.equal(other.status, 200, other.text);
});

test('turning 2FA off needs the password and a fresh code', { skip }, async () => {
  const user = await makeUser();
  const { b, uri, codes } = await enrol(user);
  assert.equal((await b.call('two-factor/disable', { password: user.password })).status, 400, 'code required');
  assert.equal((await b.call('two-factor/disable', { password: user.password, code: wrongCode(uri) })).status, 401);
  assert.equal((await b.call('two-factor/disable', { password: user.password, code: 'AAAAA-AAAAA' })).status, 401);
  assert.equal((await b.call('two-factor/disable', { password: 'wrong-password', code: totp(uri) })).status, 400);
  const { rows: [still] } = await pool.query('SELECT "twoFactorEnabled" FROM better_auth."user" WHERE "id"=$1', [user.id]);
  assert.equal(still.twoFactorEnabled, true);

  const off = await b.call('two-factor/disable', { password: user.password, code: totp(uri) });
  assert.equal(off.status, 200, off.text);
  const { rows: [now] } = await pool.query('SELECT "twoFactorEnabled" FROM better_auth."user" WHERE "id"=$1', [user.id]);
  assert.equal(now.twoFactorEnabled, false);
  assert.equal((await pool.query('SELECT 1 FROM better_auth."twoFactor" WHERE "userId"=$1', [user.id])).rowCount, 0);
  const plain = browser();
  const signedIn = await plain.call('sign-in/email', { email: user.email, password: user.password });
  assert.equal(signedIn.json.twoFactorRedirect, undefined);
  assert.equal(plain.hasSession(), true);

  // a recovery code also works to turn it off
  const second = await enrol(user);
  const offByRecovery = await second.b.call('two-factor/disable', { password: user.password, code: second.codes[3] });
  assert.equal(offByRecovery.status, 200, offByRecovery.text);
  assert.notEqual(codes[3], second.codes[3]);
});

test('code attempts are limited: 5 per sign-in challenge, 10 a minute per client', { skip }, async () => {
  const user = await makeUser();
  const { uri } = await enrol(user);
  const b = browser();
  assert.equal((await b.call('sign-in/email', { email: user.email, password: user.password })).json.twoFactorRedirect, true);
  for (let i = 0; i < 5; i += 1) assert.equal((await b.call('two-factor/verify-totp', { code: wrongCode(uri) })).status, 401);
  const spent = await b.call('two-factor/verify-totp', { code: totp(uri) });
  assert.equal(spent.status, 400, 'the challenge is spent after 5 wrong codes, even for a right one');
  assert.equal(b.hasSession(), false);

  const statuses = [];
  for (let i = 0; i < 6; i += 1) statuses.push((await b.call('two-factor/verify-totp', { code: totp(uri) })).status);
  assert.equal(statuses.at(-1), 429, `limited after 10 calls in a minute: ${statuses}`);
  assert.ok((await pool.query('SELECT 1 FROM better_auth."rateLimit"')).rowCount > 0, 'limit is kept in the database');
  // other auth paths are not limited by this change
  const signIns = [];
  for (let i = 0; i < 5; i += 1) signIns.push((await b.call('sign-in/email', { email: user.email, password: 'wrong' })).status);
  assert.ok(!signIns.includes(429), `sign-in unchanged: ${signIns}`);
});

test('migration 078 rolls back and re-applies without touching other accounts', { skip }, async () => {
  const sql = (name) => readFileSync(join(MIGRATIONS, '078_two_factor', name), 'utf8');
  const users = db.psql('SELECT count(*) FROM better_auth."user"').stdout.trim();
  const down = db.psql(sql('rollback.sql'));
  assert.equal(down.status, 0, down.stderr);
  assert.equal(db.psql(`SELECT count(*) FROM information_schema.columns WHERE table_schema='better_auth' AND column_name='twoFactorEnabled'`).stdout.trim(), '0');
  assert.equal(db.psql(`SELECT to_regclass('better_auth."twoFactor"') IS NULL`).stdout.trim(), 't');
  assert.equal(db.psql('SELECT count(*) FROM better_auth."user"').stdout.trim(), users, 'rollback keeps every user');
  for (let i = 0; i < 2; i += 1) {
    const up = db.psql(sql('migration.sql'));
    assert.equal(up.status, 0, up.stderr);
  }
  assert.equal(db.psql(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='better_auth' AND c.relname IN ('twoFactor','rateLimit') AND c.relforcerowsecurity`).stdout.trim(), '2');
});
