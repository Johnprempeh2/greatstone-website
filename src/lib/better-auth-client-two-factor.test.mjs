import { test } from 'node:test';
import assert from 'node:assert/strict';

// The auth client keeps the fetch it finds when it is created, so stub it before the import.
const sent = [];
globalThis.fetch = async (input, init) => {
  sent.push({ path: String(input?.url ?? input), body: init?.body });
  const body = sent.at(-1).path.endsWith('/sign-in/email') ? { twoFactorRedirect: true, twoFactorMethods: ['totp'] } : { status: true };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
};
const { signIn, disableTwoFactor, TWO_FACTOR_ELSEWHERE } = await import('./better-auth-client.mjs');

test('two-factor sign-in: only a form that asks for the code gets the code step; others get a clear message', async () => {
  const elsewhere = await signIn('a@example.test', 'pw');
  assert.equal(elsewhere.error.message, TWO_FACTOR_ELSEWHERE);
  assert.equal(elsewhere.data, null);
  const account = await signIn('a@example.test', 'pw', { twoFactor: true });
  assert.equal(account.error, null);
  assert.equal(account.twoFactor, true);
});

test('turn-off sends a 6-digit app code without spaces, and a recovery code as typed', async () => {
  await disableTwoFactor('pw', ' 123 456 ');
  assert.match(sent.at(-1).path, /\/api\/auth\/two-factor\/disable$/);
  assert.deepEqual(JSON.parse(sent.at(-1).body), { password: 'pw', code: '123456' });
  await disableTwoFactor('pw', ' abcde-fghjk ');
  assert.deepEqual(JSON.parse(sent.at(-1).body), { password: 'pw', code: 'abcde-fghjk' });
});
