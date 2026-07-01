import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateStaff, summariseStaff, GREATSTONE_ORG_ID } from './staff-provision.mjs';

const ORG = GREATSTONE_ORG_ID;
const owner = (over = {}) => ({ id: 'u1', email: 'john@greatstonesoftware.co.uk', name: 'John', role: 'owner', auth_subject: 'auth-john', is_active: true, deleted_at: null, org_id: ORG, ...over });

test('a correctly-provisioned owner passes clean', () => {
  const res = validateStaff([owner()]);
  assert.equal(res.ok, true);
  assert.equal(res.errors, 0);
  assert.equal(res.managerCount, 1);
});

test('missing auth_subject is a blocking error (can never sign in)', () => {
  const res = validateStaff([owner({ auth_subject: null })]);
  assert.equal(res.ok, false);
  assert.ok(res.issues.some((i) => i.code === 'no_auth_link' && i.level === 'error'));
});

test('unrecognised role is a blocking error', () => {
  const res = validateStaff([owner({ role: 'superuser' })]);
  assert.ok(res.issues.some((i) => i.code === 'bad_role'));
  // and with no valid manager, no_manager also fires
  assert.ok(res.issues.some((i) => i.code === 'no_manager'));
});

test('wrong org is a blocking error', () => {
  const res = validateStaff([owner({ org_id: '99999999-9999-4999-8999-999999999999' })]);
  assert.ok(res.issues.some((i) => i.code === 'wrong_org' && i.level === 'error'));
});

test('an editor alone can open the CMS but cannot manage staff → no_manager error', () => {
  const res = validateStaff([owner({ role: 'editor', email: 'ed@greatstonesoftware.co.uk' })]);
  assert.equal(res.ok, false);
  assert.ok(res.issues.some((i) => i.code === 'no_manager'));
});

test('inactive owner is a warning, and leaves nobody able to manage', () => {
  const res = validateStaff([owner({ is_active: false })]);
  assert.ok(res.issues.some((i) => i.code === 'inactive' && i.level === 'warn'));
  assert.ok(res.issues.some((i) => i.code === 'no_manager'));
});

test('duplicate auth_subject across two live profiles is a blocking error', () => {
  const res = validateStaff([owner(), owner({ id: 'u2', email: 'a@x.co', role: 'admin' })].map((r, i) => ({ ...r, auth_subject: 'shared' })));
  assert.ok(res.issues.some((i) => i.code === 'dup_auth'));
});

test('soft-deleted staff are excluded from the live roster but flagged if still active+linked', () => {
  const res = validateStaff([owner(), owner({ id: 'u3', email: 'gone@x.co', role: 'admin', deleted_at: '2026-06-01T00:00:00Z' })]);
  assert.equal(res.liveCount, 1);
  assert.ok(res.issues.some((i) => i.code === 'deleted_but_live'));
});

test('auth cross-check: profile pointing at a missing Auth user is a blocking error', () => {
  const res = validateStaff([owner()], { authUsers: [] });
  assert.ok(res.issues.some((i) => i.code === 'orphan_profile'));
});

test('auth cross-check: an Auth user with no profile is a warning', () => {
  const res = validateStaff([owner()], { authUsers: [{ id: 'auth-john', email: 'john@greatstonesoftware.co.uk' }, { id: 'auth-stray', email: 'stray@x.co' }] });
  assert.equal(res.ok, true); // john is valid → no blocking errors
  assert.ok(res.issues.some((i) => i.code === 'orphan_auth' && i.level === 'warn'));
});

test('auth cross-check: a known customer Auth user is NOT flagged as an orphan', () => {
  const res = validateStaff([owner()], {
    authUsers: [{ id: 'auth-john', email: 'john@greatstonesoftware.co.uk' }, { id: 'auth-cust', email: 'buyer@acme.co' }],
    customerAuthIds: ['auth-cust'],
  });
  assert.ok(!res.issues.some((i) => i.code === 'orphan_auth'), 'customer must not be an orphan');
  // but a stray auth user that is neither staff nor customer still warns
  const res2 = validateStaff([owner()], {
    authUsers: [{ id: 'auth-john', email: 'john@greatstonesoftware.co.uk' }, { id: 'auth-stray', email: 'stray@x.co' }],
    customerAuthIds: ['auth-cust'],
  });
  assert.ok(res2.issues.some((i) => i.code === 'orphan_auth'));
});

test('auth cross-check: email mismatch between profile and Auth is a warning', () => {
  const res = validateStaff([owner()], { authUsers: [{ id: 'auth-john', email: 'different@x.co' }] });
  assert.ok(res.issues.some((i) => i.code === 'email_mismatch' && i.level === 'warn'));
});

test('summariseStaff: counts live rows per role', () => {
  const s = summariseStaff([owner(), owner({ id: 'u2', email: 'ed@x.co', role: 'editor' }), owner({ id: 'u3', role: 'admin', deleted_at: '2026-01-01' })]);
  assert.equal(s.total, 3);
  assert.equal(s.live, 2);
  assert.equal(s.byRole.owner, 1);
  assert.equal(s.byRole.editor, 1);
});
