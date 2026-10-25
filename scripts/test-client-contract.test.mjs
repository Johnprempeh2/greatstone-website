import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, assertTestClientContract } from './test-client-contract.mjs';

const copy = () => structuredClone(fixture);

test('approved test client identities are unique and have only reserved addresses', () => {
  assert.equal(assertTestClientContract(fixture), fixture);
});

test('fixture validation fails closed for a real address or changed client identity', () => {
  const realAddress = copy();
  realAddress.teams[0].clients[0].email = 'client@example.com';
  assert.throws(() => assertTestClientContract(realAddress), /unsafe/);
  const changedClient = copy();
  changedClient.organisation.slug = 'real-client';
  assert.throws(() => assertTestClientContract(changedClient), /differs/);
});

test('fixture validation rejects duplicate identities', () => {
  const duplicate = copy();
  duplicate.staff[0].id = duplicate.teams[0].clients[0].id;
  assert.throws(() => assertTestClientContract(duplicate), /duplicate/);
});
