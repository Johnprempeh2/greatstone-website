import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyHashDestination } from './legacy-hashes.mjs';

const pages = ['/', '/dev-tools', '/dx-consultancy', '/proof', '/contact', '/method', '/services', '/insights'];

test('old page hashes reach real routes and retain nested anchors', () => {
  assert.equal(legacyHashDestination('#go/dx-consultancy', '/', pages), '/dx-consultancy');
  assert.equal(legacyHashDestination('#go/dx-consultancy/ai-readiness', '/', pages), '/dx-consultancy#ai-readiness');
  assert.equal(legacyHashDestination('#dev-tools', '/', pages), '/dev-tools');
  assert.equal(legacyHashDestination('#book', '/', pages), '/contact');
  assert.equal(legacyHashDestination('#service/business-website-build', '/how-we-help', pages), '/services');
  assert.equal(legacyHashDestination('#enquire/digital-office', '/services', pages), '/contact');
  assert.equal(legacyHashDestination('#breakdown', '/method', pages), '/method');
  assert.equal(legacyHashDestination('#go/ai-market-intelligence', '/insights', pages), '/insights');
});

test('real anchors and unknown hashes stay on their page', () => {
  assert.equal(legacyHashDestination('#choose', '/', pages, (id) => id === 'choose'), null);
  assert.equal(legacyHashDestination('#unknown', '/', pages), null);
  assert.equal(legacyHashDestination('#go/missing', '/', pages), null);
});

test('private Vite hashes reach the matching Next routes', () => {
  assert.equal(legacyHashDestination('#account', '/', pages), '/account');
  assert.equal(legacyHashDestination('#order-confirmed?session=cs_test_123abc', '/', pages),
    '/order-confirmed?session=cs_test_123abc');
  assert.equal(legacyHashDestination('#org', '/account', pages), '/org');
  assert.equal(legacyHashDestination('#org/e/01234567-89ab-cdef-0123-456789abcdef', '/account', pages),
    '/org#org/e/01234567-89ab-cdef-0123-456789abcdef');
  assert.equal(legacyHashDestination('#portal/doc/01234567-89ab-cdef-0123-456789abcdef', '/account', pages),
    '/portal/doc/01234567-89ab-cdef-0123-456789abcdef');
  assert.equal(legacyHashDestination('#catalogue/orders', '/account', pages), '/catalogue/orders');
  assert.equal(legacyHashDestination('#invoice/01234567-89ab-cdef-0123-456789abcdef', '/account', pages),
    '/invoice/01234567-89ab-cdef-0123-456789abcdef');
});
