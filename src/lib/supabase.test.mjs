// R0.6 (GRE-2617): Better Auth is the only sign-in, so the shared Supabase client is a data client with
// auth off. It must never keep, refresh or read a Supabase session, even if a caller asks for one.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'anon-test-key';
const { makeClient } = await import('./supabase.mjs');

test('the shared Supabase client has auth off', () => {
  const { auth } = makeClient();
  assert.equal(auth.persistSession, false);
  assert.equal(auth.autoRefreshToken, false);
  assert.equal(auth.detectSessionInUrl, false);
});

test('a caller cannot turn Supabase auth back on', () => {
  const { auth } = makeClient('anon-test-key', { auth: { persistSession: true, detectSessionInUrl: true } });
  assert.equal(auth.persistSession, false);
  assert.equal(auth.detectSessionInUrl, false);
});
