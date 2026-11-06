import test from 'node:test';
import assert from 'node:assert/strict';
import { currentClientActions } from './home-model.mjs';

test('home actions include only open requests and documents this person can act on', () => {
  const docs = [
    { id: 'a', title: 'Read me', action: 'accept', signatory_email: 'member@example.test' },
    { id: 'b', title: 'Other signer', action: 'accept', signatory_email: 'other@example.test' },
    { id: 'c', title: 'Already accepted', action: 'accept' },
  ];
  const snapshot = { documentRequests: [
    { id: 'd', title: 'Send evidence', status: 'open' },
    { id: 'e', title: 'Received evidence', status: 'received' },
  ] };
  assert.deepEqual(currentClientActions(docs, [{ document_id: 'c' }], 'MEMBER@example.test', snapshot), [
    { id: 'request:d', title: 'Send evidence', detail: 'Send the requested information', href: '#portal/deep-dive' },
    { id: 'document:a', title: 'Read me', detail: 'Read and respond to this document', href: '#portal/doc/a' },
  ]);
});
