import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderConfirmationEmail, orderRefLabel } from './order-confirmation-email.mjs';

test('orderRefLabel strips the Stripe prefix + secret tail, leaves migrated refs as-is', () => {
  assert.equal(orderRefLabel('cs_test_a1b2c3d4e5f6g7h8#secret'), 'a1b2c3d4e5f6');
  assert.equal(orderRefLabel('cs_live_ABCDEFGHIJKLMNOP'), 'ABCDEFGHIJKL');
  assert.equal(orderRefLabel('GS-OLD-1001'), 'GS-OLD-1001');
});

test('order confirmation: subject + itemised order + totals + next steps', () => {
  const { subject, html, text } = buildOrderConfirmationEmail({
    customerName: 'Jane', reference: 'cs_test_a1b2c3d4e5f6g7h8',
    items: [{ offering_name: 'Aspose.Total for .NET', variant_name: 'Developer OEM', qty: 2, line_total_minor: 1999800 }],
    subtotalMinor: 1666500, totalMinor: 1999800, currency: 'GBP',
    siteOrigin: 'https://greatstonesoftware.co.uk',
  });
  assert.equal(subject, 'Your Greatstone order a1b2c3d4e5f6');
  assert.match(html, /Thank you, your order is confirmed/);
  assert.match(html, /Aspose\.Total for \.NET · Developer OEM ×2/);
  assert.match(html, /What happens next/);
  assert.match(html, /within one business day/);
  assert.match(html, /href="https:\/\/greatstonesoftware\.co\.uk\/#account"/);
  assert.match(text, /View your order: https:\/\/greatstonesoftware\.co\.uk\/#account/);
});

test('order confirmation: VAT is derived from total minus subtotal, never negative', () => {
  const { html } = buildOrderConfirmationEmail({ reference: 'x', items: [], subtotalMinor: 10000, totalMinor: 12000, currency: 'GBP' });
  assert.match(html, /VAT<\/td><td[^>]*>£20\.00/);         // 12000 - 10000 = 2000 minor = £20.00
  const odd = buildOrderConfirmationEmail({ reference: 'x', items: [], subtotalMinor: 12000, totalMinor: 10000 });
  assert.match(odd.html, /VAT<\/td><td[^>]*>£0\.00/);       // clamped, no negative VAT
});

test('order confirmation: currency symbol follows the currency code', () => {
  const usd = buildOrderConfirmationEmail({ reference: 'x', items: [{ offering_name: 'A', qty: 1, line_total_minor: 5000 }], subtotalMinor: 5000, totalMinor: 5000, currency: 'USD' });
  assert.match(usd.html, /\$50\.00/);
});

test('order confirmation: house style — no em dashes; product name escaped', () => {
  const { html } = buildOrderConfirmationEmail({ reference: 'x', items: [{ offering_name: '<i>x</i>', qty: 1, line_total_minor: 100 }], subtotalMinor: 100, totalMinor: 100 });
  assert.ok(!html.includes('—'));
  assert.ok(!html.includes('<i>x</i>'));
  assert.match(html, /&lt;i&gt;x&lt;\/i&gt;/);
});
