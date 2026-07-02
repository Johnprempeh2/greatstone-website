import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLicenceEmail, escapeHtml } from './licence-email.mjs';

test('escapeHtml neutralises HTML-significant characters', () => {
  assert.equal(escapeHtml('<b>"x"&\'y\'</b>'), '&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;');
  assert.equal(escapeHtml(null), '');
});

test('single key: singular subject + copy, links to the account', () => {
  const { subject, html, text } = buildLicenceEmail({
    customerName: 'Acme Ltd', orderRef: 'GS-1002',
    items: [{ offering_name: 'Aspose.PDF for .NET', variant_name: 'Developer', qty: 1 }],
    accountUrl: 'https://greatstoneint.com/#account',
  });
  assert.equal(subject, 'Your Greatstone licence key is ready');
  assert.match(html, /Your licence key is ready/);
  assert.match(html, /Aspose\.PDF for \.NET · Developer/);
  assert.match(html, /href="https:\/\/greatstoneint\.com\/#account"/);
  assert.match(text, /View your licence key: https:\/\/greatstoneint\.com\/#account/);
});

test('multiple keys: plural subject + copy', () => {
  const { subject, html } = buildLicenceEmail({
    items: [{ offering_name: 'A' }, { offering_name: 'B' }],
  });
  assert.equal(subject, 'Your Greatstone licence keys are ready');
  assert.match(html, /View your licence keys/);
});

test('qty > 1 renders a ×N suffix; qty 1 does not', () => {
  const two = buildLicenceEmail({ items: [{ offering_name: 'A', qty: 2 }] });
  assert.match(two.html, /A ×2/);
  const one = buildLicenceEmail({ items: [{ offering_name: 'A', qty: 1 }] });
  assert.ok(!/×/.test(one.html));
});

test('SECURITY: the key value is never placed in the email', () => {
  // even if a caller wrongly passes a licence_key field, the builder only ever renders offering/variant/qty
  const { html, text } = buildLicenceEmail({ items: [{ offering_name: 'A', licence_key: 'SECRET-KEY-123' }] });
  assert.ok(!html.includes('SECRET-KEY-123'));
  assert.ok(!text.includes('SECRET-KEY-123'));
  assert.match(html, /never send licences by email/);
});

test('product names are HTML-escaped (no injection through offering_name)', () => {
  const { html } = buildLicenceEmail({ items: [{ offering_name: '<script>alert(1)</script>' }] });
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
});

test('self-contained: wordmark present, no remote image, single canonical domain by default', () => {
  const { html } = buildLicenceEmail({ items: [{ offering_name: 'A' }] });
  assert.match(html, /GREATST<span[^>]*>O<\/span>NE/);
  assert.ok(!/<img/.test(html));
  assert.match(html, /greatstoneint\.com/);
  assert.ok(!/greatstonesoftware\.co\.uk/.test(html)); // the old domain never appears (2 Jul: greatstoneint.com is permanent)
});

test('activation steps render as a How-to-activate block, deduped across a shared range', () => {
  const { html, text } = buildLicenceEmail({
    items: [
      { offering_name: 'Aspose.PDF', activation: 'Step 1\nStep 2' },
      { offering_name: 'Aspose.Words', activation: 'Step 1\nStep 2' }, // same range → one block
      { offering_name: 'IronPDF', activation: 'Paste the key in Settings' },
    ],
  });
  assert.match(html, /How to activate/);
  assert.equal((html.match(/Step 1<br>Step 2/g) || []).length, 1); // deduped, line breaks honoured
  assert.match(html, /Aspose\.PDF · Aspose\.Words/);               // the shared block names both products
  assert.match(html, /Paste the key in Settings/);
  assert.match(text, /How to activate · Aspose\.PDF, Aspose\.Words/);
  assert.match(text, /Paste the key in Settings/);
});

test('activation steps are HTML-escaped and absent items render no block', () => {
  const inj = buildLicenceEmail({ items: [{ offering_name: 'A', activation: '<img src=x onerror=alert(1)>' }] });
  assert.ok(!/<img/.test(inj.html));
  assert.match(inj.html, /&lt;img/);
  const none = buildLicenceEmail({ items: [{ offering_name: 'A' }] });
  assert.ok(!/How to activate/.test(none.html));
});

test('missing items falls back to a generic single-key email without throwing', () => {
  const { subject, html } = buildLicenceEmail({});
  assert.equal(subject, 'Your Greatstone licence key is ready');
  assert.match(html, /Your licence/);
});
