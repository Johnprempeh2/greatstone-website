// Builds the order-confirmation email sent when a Stripe checkout completes (from the stripe-webhook edge
// function). Ben (1 Jul) found the old one "old school": it listed the order but was thin on what happens
// next and when. This rework keeps the itemised order + totals and adds a clear "what happens next" with a
// timeframe and an account CTA. Pure + framework-free so it runs in both the Deno edge function and node
// tests; the webhook keeps an inline MIRROR of this output (like licence-email.mjs ↔ notify-licence-issued).
// No secrets, no remote images, values HTML-escaped.
import { escapeHtml } from './licence-email.mjs';

const ACCENT = '#c8ff00';
const CARD = '#1f1f1f';
const TEXT = '#f5f5f5';
const MUTED = '#b0b0b0';
const FAINT = '#707070';

const SYMBOL = { GBP: '£', USD: '$', EUR: '€' };
// clean human reference from a Stripe session id (drop cs_test_/cs_live_ + the secret tail), matching the
// account history + the confirmation page. A non-Stripe reference is shown as-is (migrated orders).
export function orderRefLabel(reference) {
  const s = String(reference || '');
  return /^cs_(test|live)_/.test(s) ? s.replace(/^cs_(test|live)_/, '').split('#')[0].slice(0, 12) : s;
}

// buildOrderConfirmationEmail({ customerName, reference, items:[{offering_name,variant_name,qty,line_total_minor}],
//   subtotalMinor, totalMinor, currency, accountUrl }) → { subject, html, text }
export function buildOrderConfirmationEmail(opts = {}) {
  const items = Array.isArray(opts.items) ? opts.items : [];
  const name = opts.customerName ? String(opts.customerName).trim() : '';
  const currency = (opts.currency || 'GBP').toUpperCase();
  const sym = SYMBOL[currency] || (currency + ' ');
  const money = (m) => sym + (Number(m || 0) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ref = orderRefLabel(opts.reference);
  const subtotal = Number(opts.subtotalMinor || 0);
  const total = Number(opts.totalMinor || 0);
  const vat = Math.max(0, total - subtotal);
  const origin = (opts.siteOrigin ? String(opts.siteOrigin) : 'https://greatstonesoftware.co.uk').replace(/\/+$/, '');
  const accountUrl = opts.accountUrl || origin + '/#account';

  const greeting = name ? 'Hi ' + escapeHtml(name) + ',' : 'Hello,';
  const itemLabel = (it) => escapeHtml((it.offering_name || 'Item') + (it.variant_name ? ' · ' + it.variant_name : '') + (it.qty && it.qty > 1 ? ' ×' + it.qty : ''));
  const rows = items.map((it) => `<tr><td style="padding:6px 0;color:#cfd3cb;font-size:14px">${itemLabel(it)}</td><td style="padding:6px 0;text-align:right;color:${TEXT};font-size:14px">${money(it.line_total_minor)}</td></tr>`).join('');

  const nextSteps = [
    'Our licensing team issues your licences (keys or files) and they appear in your account, normally within one business day.',
    'We email you the moment they are ready to collect. You do not need to do anything until then.',
    'Need it sooner, or want to pay by purchase order next time? Just reply to this email.',
  ];
  const nextRows = nextSteps.map((s) => `<li style="margin:0 0 8px;line-height:1.55">${escapeHtml(s)}</li>`).join('');

  const html = `<div style="background:${CARD};color:${TEXT};font-family:Arial,Helvetica,sans-serif;padding:28px;max-width:560px;margin:0 auto;border-radius:14px">
    <div style="font-weight:800;font-size:18px;letter-spacing:.04em">GREATST<span style="color:${ACCENT}">O</span>NE</div>
    <h1 style="font-size:20px;margin:18px 0 6px">Thank you, your order is confirmed</h1>
    <p style="color:${MUTED};font-size:14px;margin:0 0 4px">${greeting}</p>
    <p style="color:${MUTED};font-size:14px;margin:0 0 18px">Order reference <b style="color:${TEXT}">${escapeHtml(ref)}</b>. Here is what you ordered.</p>
    <table style="width:100%;border-collapse:collapse">${rows}
      <tr><td style="padding:10px 0 0;border-top:1px solid #333;color:${MUTED};font-size:14px">Subtotal (ex VAT)</td><td style="padding:10px 0 0;border-top:1px solid #333;text-align:right;color:${MUTED};font-size:14px">${money(subtotal)}</td></tr>
      <tr><td style="color:${MUTED};font-size:14px">VAT</td><td style="text-align:right;color:${MUTED};font-size:14px">${money(vat)}</td></tr>
      <tr><td style="padding-top:6px;font-weight:800">Total</td><td style="padding-top:6px;text-align:right;font-weight:800;color:${ACCENT}">${money(total)}</td></tr>
    </table>
    <h2 style="font-size:15px;margin:22px 0 8px">What happens next</h2>
    <ol style="color:${MUTED};font-size:14px;padding-left:18px;margin:0 0 18px">${nextRows}</ol>
    <a href="${escapeHtml(accountUrl)}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:800;color:#0e1611;background:${ACCENT};text-decoration:none;border-radius:100px">View your order</a>
    <p style="color:${FAINT};font-size:12px;margin-top:22px">Questions? Just reply to this email. Greatstone International &middot; The Foundation of Digital Excellence</p>
  </div>`;

  const textLines = [
    'Thank you, your order is confirmed', '',
    (name ? 'Hi ' + name + ',' : 'Hello,'),
    'Order reference ' + ref + '. Here is what you ordered:', '',
    ...items.map((it) => '- ' + (it.offering_name || 'Item') + (it.variant_name ? ' · ' + it.variant_name : '') + (it.qty && it.qty > 1 ? ' ×' + it.qty : '') + '  ' + money(it.line_total_minor)),
    '', 'Subtotal (ex VAT): ' + money(subtotal), 'VAT: ' + money(vat), 'Total: ' + money(total), '',
    'What happens next:',
    ...nextSteps.map((s) => '- ' + s), '',
    'View your order: ' + accountUrl, '',
    'Questions? Just reply to this email.',
    'Greatstone International · The Foundation of Digital Excellence',
  ];

  return { subject: 'Your Greatstone order ' + ref, html, text: textLines.join('\n') };
}

export default buildOrderConfirmationEmail;
