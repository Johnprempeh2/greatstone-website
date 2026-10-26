import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basketSignature, sentQuoteReference } from './basketCheckout.mjs';

test('cancelled card checkout reuses its sent quote reference for the unchanged basket', () => {
  const lines = [{ variantId: 'tool', qty: 1 }, { serviceSlug: 'advice', qty: 1 }];
  const pending = { signature: basketSignature(lines, 'buyer@example.test'), quoteReference: 'enquiry-1' };
  assert.equal(sentQuoteReference(pending, lines, 'buyer@example.test'), 'enquiry-1');
  assert.equal(sentQuoteReference(pending, lines, 'other@example.test'), '');
  assert.equal(sentQuoteReference(pending, [...lines, { serviceSlug: 'extra', qty: 1 }], 'buyer@example.test'), '');
});
