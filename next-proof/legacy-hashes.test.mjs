import test from 'node:test';
import assert from 'node:assert/strict';
import { isBookingHash, keepLandingQuery, legacyHashDestination } from './legacy-hashes.mjs';

const pages = ['/', '/dev-tools', '/dx-consultancy', '/proof', '/contact', '/method', '/services', '/insights'];

test('old page hashes reach real routes and retain nested anchors', () => {
  assert.equal(legacyHashDestination('#go/dx-consultancy', '/', pages), '/dx-consultancy');
  assert.equal(legacyHashDestination('#go/dx-consultancy/ai-readiness', '/', pages), '/dx-consultancy#ai-readiness');
  assert.equal(legacyHashDestination('#dev-tools', '/', pages), '/dev-tools');
  assert.equal(legacyHashDestination('#book', '/', pages), '/contact');
  assert.equal(legacyHashDestination('#service/business-website-build', '/how-we-help', pages), '/service/business-website-build');
  assert.equal(legacyHashDestination('#service', '/', pages), '/services');
  assert.equal(legacyHashDestination('#enquire/digital-office', '/services', pages), '/contact');
  assert.equal(legacyHashDestination('#breakdown', '/method', pages), '/method');
  assert.equal(legacyHashDestination('#go/ai-market-intelligence', '/insights', pages), '/insights');
});

test('old store and briefing hashes reach their Next routes', () => {
  assert.equal(legacyHashDestination('#product/ironpdf', '/', pages), '/product/ironpdf');
  assert.equal(legacyHashDestination('#/product/ironpdf', '/', pages), '/product/ironpdf');
  assert.equal(legacyHashDestination('#shop/ironsoftware', '/', pages), '/shop/ironsoftware');
  assert.equal(legacyHashDestination('#shop', '/', pages), '/shop');
  assert.equal(legacyHashDestination('#intel', '/', pages), '/insights');
  assert.equal(legacyHashDestination('#intel/weekly-briefing', '/about', pages), '/insights');
  assert.equal(legacyHashDestination('#intel', '/insights', pages), null);
  assert.equal(legacyHashDestination('#go/proof', '/', ['/', '/case-studies']), '/case-studies');
});

test('auth email landings keep their token or verified flag on the way to /account', () => {
  assert.equal(keepLandingQuery(legacyHashDestination('#account', '/', pages), '?token=abc'), '/account?token=abc');
  assert.equal(keepLandingQuery('/account', '?verified=1'), '/account?verified=1');
  assert.equal(keepLandingQuery('/dx-consultancy#ai-readiness', '?utm_source=x'), '/dx-consultancy?utm_source=x#ai-readiness');
  assert.equal(keepLandingQuery('/order-confirmed?session=cs_test_1', '?x=1'), '/order-confirmed?session=cs_test_1');
  assert.equal(keepLandingQuery('/account', ''), '/account');
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

test('old Studio links reach the staff area, not a page editor (GRE-3873)', () => {
  const pages = ['/', '/about'];
  assert.equal(legacyHashDestination('#admin', '/', pages), '/catalogue');
  assert.equal(legacyHashDestination('#admin/editor/home', '/', pages), '/catalogue');
  assert.equal(legacyHashDestination('#admin', '/catalogue', pages), null);
  assert.equal(legacyHashDestination('#administrators', '/', pages), null);
});

test('only the bare #book hash opens the booking popup', () => {
  assert.equal(isBookingHash('#book'), true);
  assert.equal(isBookingHash('#booking'), false);
  assert.equal(isBookingHash('#go/book'), false);
  assert.equal(isBookingHash(''), false);
});
