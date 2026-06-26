import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickAdmin, askAdminMailto } from './ask-admin.mjs';

test('pickAdmin: primary contact wins, then role=admin, else null', () => {
  assert.deepEqual(pickAdmin([{ email: 'a', role: 'member' }, { email: 'b', is_primary: true }]).email, 'b');
  assert.deepEqual(pickAdmin([{ email: 'a', role: 'member' }, { email: 'c', role: 'admin' }]).email, 'c');
  assert.equal(pickAdmin([{ email: 'a', role: 'member' }]), null);
  assert.equal(pickAdmin([]), null);
  assert.equal(pickAdmin(null), null);
});

test('askAdminMailto: to the admin with a named greeting + encoded params', () => {
  const href = askAdminMailto({ company: 'Ethical Quest', admin: { email: 'naa@eq.com', full_name: 'Naa Prempeh' } });
  assert.ok(href.startsWith('mailto:naa@eq.com?subject='));
  assert.ok(href.includes(encodeURIComponent('Re: Ethical Quest account access')));
  assert.ok(decodeURIComponent(href).includes('Hi Naa,')); // first name only
  assert.ok(decodeURIComponent(href).includes('Ethical Quest'));
});

test('askAdminMailto: falls back to the Greatstone team when no admin email', () => {
  const href = askAdminMailto({ company: 'Ethical Quest', admin: null });
  assert.ok(href.startsWith('mailto:dx@greatstonesoftware.co.uk?subject='));
  assert.ok(href.includes(encodeURIComponent('Re: Ethical Quest account access')));
  assert.equal(askAdminMailto({ company: 'X', admin: { full_name: 'No Email' } }).startsWith('mailto:dx@greatstonesoftware.co.uk'), true);
});

test('askAdminMailto: empty company degrades to "your"', () => {
  assert.ok(askAdminMailto({ admin: null }).includes(encodeURIComponent('Re: your account access')));
});
