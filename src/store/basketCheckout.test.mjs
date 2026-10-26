import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basketSignature, sentBasketQuote, sentQuoteReference } from './basketCheckout.mjs';

test('cancelled card checkout reuses its sent quote reference for the unchanged basket', () => {
  const lines = [{ variantId: 'tool', qty: 1 }, { serviceSlug: 'advice', qty: 1 }];
  const pending = { signature: basketSignature(lines, 'buyer@example.test'), quoteReference: 'enquiry-1' };
  assert.equal(sentQuoteReference(pending, lines, 'buyer@example.test'), 'enquiry-1');
  assert.equal(sentQuoteReference(pending, lines, 'other@example.test'), '');
  assert.equal(sentQuoteReference(pending, [...lines, { serviceSlug: 'extra', qty: 1 }], 'buyer@example.test'), '');
});

test('cancelled return recognises a sent quote without asking for contact again', () => {
  const lines = [{ variantId: 'tool', qty: 1 }, { serviceSlug: 'advice', qty: 1 }];
  const pending = { signature: basketSignature(lines, 'buyer@example.test'), quoteReference: 'enquiry-1' };
  assert.deepEqual(sentBasketQuote(pending, lines), { reference: 'enquiry-1', email: 'buyer@example.test' });
  assert.equal(sentBasketQuote(pending, [...lines, { serviceSlug: 'extra', qty: 1 }]), null);
  assert.equal(sentBasketQuote({ ...pending, signature: 'bad data' }, lines), null);
});
