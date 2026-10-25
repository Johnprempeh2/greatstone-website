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
