import { test } from 'node:test';
import assert from 'node:assert/strict';
import { twoFactorError, restartsSignIn, setupKey } from './two-factor-ui.mjs';

test('two-factor errors read as a next step', () => {
  assert.match(twoFactorError({ status: 429 }), /Wait a minute/);
  assert.match(twoFactorError({ status: 401, code: 'INVALID_CODE' }), /code is not right/);
  assert.match(twoFactorError({ status: 401, code: 'INVALID_BACKUP_CODE' }), /code is not right/);
  assert.match(twoFactorError({ status: 400, code: 'INVALID_PASSWORD' }), /password is not right/);
  assert.match(twoFactorError({ status: 429, code: 'ACCOUNT_TEMPORARILY_LOCKED' }), /15 minutes/);
  assert.match(twoFactorError({ status: 403, code: 'ACCOUNT_TEMPORARILY_LOCKED' }), /15 minutes/);
  assert.equal(twoFactorError({ message: 'Odd' }), 'Odd');
  assert.ok(restartsSignIn({ code: 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE' }));
  assert.ok(restartsSignIn({ code: 'INVALID_TWO_FACTOR_COOKIE' }));
  assert.ok(!restartsSignIn({ code: 'INVALID_CODE' }));
});

test('setup key is the otpauth secret in groups of four', () => {
  assert.equal(setupKey('otpauth://totp/Greatstone:a%40b.c?secret=ABCDEFGHIJKLMNOPQR&issuer=Greatstone'), 'ABCD EFGH IJKL MNOP QR');
  assert.equal(setupKey('not a url'), '');
});
