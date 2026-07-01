// Builds the branded welcome / onboarding email sent when a customer registers. Ben (1 Jul) flagged this as
// a gap: today registration only fires Supabase's account-confirmation email, with no introduction to who
// Greatstone is or what to do next. This is the missing warm first touch: a short brand intro and three
// concrete next steps. Pure + framework-free so it runs in both a Deno edge function and node tests. No
// secrets, no remote images (CSS wordmark), values HTML-escaped. Same chrome as the order + licence emails.
//
// DISPATCH IS GATED: sending this needs a trigger (a Supabase auth hook or a small edge function invoked on
// customer_users insert) plus the Resend secrets. This module is the reviewable, deploy-ready template; the
// wiring is tracked in docs/AUTH-EMAILS.md.
import { escapeHtml } from './licence-email.mjs';

const ACCENT = '#c8ff00';
const CARD = '#1f1f1f';
const TEXT = '#f5f5f5';
const MUTED = '#b0b0b0';
const FAINT = '#707070';

// buildWelcomeEmail({ customerName, company, accountUrl, shopUrl, bookUrl }) → { subject, html, text }
export function buildWelcomeEmail(opts = {}) {
  const name = opts.customerName ? String(opts.customerName).trim() : '';
  const company = opts.company ? String(opts.company).trim() : '';
  const origin = (opts.siteOrigin ? String(opts.siteOrigin) : 'https://greatstonesoftware.co.uk').replace(/\/+$/, '');
  const accountUrl = opts.accountUrl || origin + '/#account';
  const shopUrl = opts.shopUrl || origin + '/#shop';
  const bookUrl = opts.bookUrl || origin + '/#book';

  const subject = 'Welcome to Greatstone';
  const greeting = name ? 'Hi ' + escapeHtml(name) + ',' : 'Hello,';
  const intro = company
    ? 'Thanks for setting up ' + escapeHtml(company) + ' on Greatstone.'
    : 'Thanks for setting up your Greatstone account.';

  // three concrete next steps, each a plain sentence rather than a slogan
  const steps = [
    { t: 'Browse the catalogue', d: 'The developer software we license and support, from the vendors who make it. Find what your team builds on.', href: shopUrl, cta: 'Browse the catalogue' },
    { t: 'Place your first order', d: 'Pay by card, or by purchase order if that suits your procurement. Your licences land in your account, normally within one business day.', href: shopUrl, cta: null },
    { t: 'Book a diagnostic', d: 'Thirty focused minutes on where your time goes and what to fix first. No deck, no obligation.', href: bookUrl, cta: 'Book a diagnostic' },
  ];
  const stepRows = steps.map((s) => `
    <tr><td style="padding:14px 0;border-top:1px solid #333">
      <div style="font-weight:800;font-size:15px;color:${TEXT}">${escapeHtml(s.t)}</div>
      <div style="font-size:14px;color:${MUTED};margin-top:4px;line-height:1.55">${escapeHtml(s.d)}</div>
      ${s.cta ? `<a href="${escapeHtml(s.href)}" style="display:inline-block;margin-top:10px;font-size:13px;font-weight:700;color:${ACCENT};text-decoration:none">${escapeHtml(s.cta)} &rarr;</a>` : ''}
    </td></tr>`).join('');

  const html = `<div style="background:${CARD};color:${TEXT};font-family:Arial,Helvetica,sans-serif;padding:28px;max-width:560px;margin:0 auto;border-radius:14px">
    <div style="font-weight:800;font-size:18px;letter-spacing:.04em">GREATST<span style="color:${ACCENT}">O</span>NE</div>
    <h1 style="font-size:20px;margin:18px 0 6px">Welcome to Greatstone</h1>
    <p style="color:${MUTED};font-size:14px;margin:0 0 6px">${greeting}</p>
    <p style="color:${MUTED};font-size:14px;margin:0 0 18px">${intro} We are the foundation the best teams build on: the licensed software you run, and the help to get more from it. Here is where to start.</p>
    <table style="width:100%;border-collapse:collapse">${stepRows}</table>
    <a href="${escapeHtml(accountUrl)}" style="display:inline-block;margin-top:22px;padding:12px 26px;font-size:14px;font-weight:800;color:#0e1611;background:${ACCENT};text-decoration:none;border-radius:100px">Go to your account</a>
    <p style="color:${FAINT};font-size:12px;margin-top:22px">Questions? Just reply to this email and a real person will help. Greatstone International &middot; The Foundation of Digital Excellence</p>
  </div>`;

  const textLines = [
    'Welcome to Greatstone', '',
    (name ? 'Hi ' + name + ',' : 'Hello,'),
    (company ? 'Thanks for setting up ' + company + ' on Greatstone.' : 'Thanks for setting up your Greatstone account.') +
      ' We are the foundation the best teams build on: the licensed software you run, and the help to get more from it. Here is where to start.', '',
    ...steps.map((s) => '- ' + s.t + ': ' + s.d + (s.cta ? ' (' + s.href + ')' : '')), '',
    'Go to your account: ' + accountUrl, '',
    'Questions? Just reply to this email and a real person will help.',
    'Greatstone International · The Foundation of Digital Excellence',
  ];

  return { subject, html, text: textLines.join('\n') };
}

export default buildWelcomeEmail;
