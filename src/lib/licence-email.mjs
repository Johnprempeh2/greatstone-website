import { BRAND_NAME, BRAND_TAGLINE, BRAND_SIGNOFF } from './brand.mjs';
// Builds the "your licence key is ready" email sent when staff issue a key against a customer's order
// (manual fulfilment: Greatstone buys the key from the vendor, uploads it, the customer is told to collect it).
// Pure + framework-free so it runs in both the Deno edge function and node tests. SECURITY: the email never
// contains the key itself (email is not a secure channel, and the order-confirmation email already tells the
// buyer keys live in their account) — it links the customer to their account to view and copy it there.
//
// Matches the order-confirmation email in supabase/functions/stripe-webhook: the CSS wordmark (no remote
// image), dark card, brand lime, British voice. Values are HTML-escaped before interpolation.

const ACCENT = '#c8ff00';
const CARD = '#1f1f1f';
const TEXT = '#f5f5f5';
const MUTED = '#b0b0b0';
const FAINT = '#707070';

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Present one issued line: "Aspose.PDF for .NET · Enterprise ×2" (variant + qty optional).
function itemLabel(it) {
  const name = it.offering_name || it.name || 'Your licence';
  const variant = it.variant_name ? ' · ' + it.variant_name : '';
  const qty = it.qty && it.qty > 1 ? ' ×' + it.qty : '';
  return name + variant + qty;
}

// buildLicenceEmail({ customerName, items:[{offering_name,variant_name,qty,activation}], orderRef, accountUrl })
//   → { subject, html, text }. `items` is the set of keys just issued (1+). accountUrl is where the customer
//   signs in to collect them (defaults to the canonical account route). An item may carry `activation` — its
//   product range's plain-text activation steps (vendors.activation_instructions, migration 0025) — which
//   renders as a "How to activate" block, deduped across items that share the same range.
export function buildLicenceEmail(opts = {}) {
  const items = Array.isArray(opts.items) && opts.items.length ? opts.items : [{ offering_name: 'Your licence' }];
  const many = items.length > 1;
  const name = opts.customerName ? String(opts.customerName).trim() : '';
  const orderRef = opts.orderRef ? String(opts.orderRef) : '';
  const accountUrl = opts.accountUrl || 'https://greatstoneint.com/#account';

  const subject = many ? 'Your Greatstone licence keys are ready' : 'Your Greatstone licence key is ready';
  const greeting = name ? 'Hi ' + escapeHtml(name) + ',' : 'Hello,';
  const lead = many
    ? 'Your licence keys are ready to collect.'
    : 'Your licence key is ready to collect.';
  const orderLine = orderRef
    ? `This is for order <b style="color:${TEXT}">${escapeHtml(orderRef)}</b>.`
    : '';
  const rows = items.map((it) => `<li style="margin:0 0 6px">${escapeHtml(itemLabel(it))}</li>`).join('');

  // "How to activate" blocks: group items that share the same range steps so one range is shown once.
  // Steps are staff-authored plain text (never HTML): escape, then honour line breaks.
  const actGroups = [];
  for (const it of items) {
    const steps = it.activation ? String(it.activation).trim() : '';
    if (!steps) continue;
    const g = actGroups.find((x) => x.steps === steps);
    if (g) g.names.push(itemLabel(it)); else actGroups.push({ steps, names: [itemLabel(it)] });
  }
  const actHtml = actGroups.length ? `<h2 style="font-size:15px;margin:4px 0 8px">How to activate</h2>
    ${actGroups.map((g) => `<div style="background:#262626;border-radius:10px;padding:12px 14px;margin:0 0 12px">
      <div style="font-weight:700;font-size:13px;color:${TEXT};margin-bottom:6px">${escapeHtml(g.names.join(' · '))}</div>
      <div style="font-size:13px;color:${MUTED};line-height:1.6">${escapeHtml(g.steps).replace(/\r?\n/g, '<br>')}</div>
    </div>`).join('')}` : '';

  const html = `<div style="background:${CARD};color:${TEXT};font-family:Arial,Helvetica,sans-serif;padding:28px;max-width:560px;margin:0 auto;border-radius:14px">
    <div style="font-weight:800;font-size:18px;letter-spacing:.04em">GREATST<span style="color:${ACCENT}">O</span>NE</div>
    <h1 style="font-size:20px;margin:18px 0 6px">${many ? 'Your licence keys are ready' : 'Your licence key is ready'}</h1>
    <p style="color:${MUTED};font-size:14px;margin:0 0 8px">${greeting}</p>
    <p style="color:${MUTED};font-size:14px;margin:0 0 14px">${lead} ${orderLine} Sign in to your account to view and access ${many ? 'them' : 'it'} (a key to copy, or a licence file to download). For your security we never send licences by email.</p>
    <ul style="color:${TEXT};font-size:14px;padding-left:18px;margin:0 0 18px">${rows}</ul>
    ${actHtml}<a href="${escapeHtml(accountUrl)}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:800;color:#0e1611;background:${ACCENT};text-decoration:none;border-radius:100px">${many ? 'View your licence keys' : 'View your licence key'}</a>
    <p style="color:${FAINT};font-size:12px;margin-top:22px">Questions? Just reply to this email. ${BRAND_SIGNOFF}</p>
  </div>`;

  const textLines = [
    many ? 'Your Greatstone licence keys are ready' : 'Your Greatstone licence key is ready', '',
    (name ? 'Hi ' + name + ',' : 'Hello,'),
    lead + (orderRef ? ' This is for order ' + orderRef + '.' : ''),
    'Sign in to your account to view and access ' + (many ? 'them' : 'it') + ' (a key to copy, or a licence file to download). We never send licences by email.', '',
    ...items.map((it) => '- ' + itemLabel(it)), '',
    ...actGroups.flatMap((g) => ['How to activate · ' + g.names.join(', '), g.steps, '']),
    (many ? 'View your licence keys: ' : 'View your licence key: ') + accountUrl, '',
    BRAND_SIGNOFF,
  ];

  return { subject, html, text: textLines.join('\n') };
}
