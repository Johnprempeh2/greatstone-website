import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resetTokenFromLocation } from './better-auth-client.mjs';

test('password reset token is read from Better Auth hash redirect or URL query', () => {
  assert.equal(resetTokenFromLocation({ search: '', hash: '#account?token=hash-token' }), 'hash-token');
  assert.equal(resetTokenFromLocation({ search: '?token=query-token', hash: '#account' }), 'query-token');
  assert.equal(resetTokenFromLocation({ search: '', hash: '#account' }), null);
});
