import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWelcomeEmail } from './welcome-email.mjs';

test('welcome email: subject, greeting, brand intro and account CTA', () => {
  const { subject, html, text } = buildWelcomeEmail({
    customerName: 'Jane', company: 'Stonewell & Co.',
    siteOrigin: 'https://greatstoneint.com',
  });
  assert.equal(subject, 'Welcome to Greatstone');
  assert.match(html, /Hi Jane,/);
  assert.match(html, /Stonewell &amp; Co\./);            // company HTML-escaped
  assert.match(html, /href="https:\/\/greatstoneint\.com\/#account"/);
  assert.match(html, /Go to your account/);
  assert.match(text, /Go to your account: https:\/\/greatstoneint\.com\/#account/);
});

test('welcome email: the three next steps are present', () => {
  const { html, text } = buildWelcomeEmail({});
  for (const step of ['Browse the catalogue', 'Place your first order', 'Book a diagnostic']) {
    assert.match(html, new RegExp(step));
    assert.match(text, new RegExp(step));
  }
});

test('welcome email: falls back gracefully with no name or company', () => {
  const { html } = buildWelcomeEmail({});
  assert.match(html, /Hello,/);
  assert.match(html, /Thanks for setting up your Greatstone account\./);
});

test('welcome email: house style — no em dashes anywhere', () => {
  const { html, text } = buildWelcomeEmail({ customerName: 'Jane', company: 'Acme' });
  assert.ok(!html.includes('—'), 'html has an em dash');
  assert.ok(!text.includes('—'), 'text has an em dash');
});

test('welcome email: name is HTML-escaped (no injection)', () => {
  const { html } = buildWelcomeEmail({ customerName: '<script>alert(1)</script>' });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /&lt;script&gt;/);
});
