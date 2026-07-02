// Generates the branded Supabase Auth email templates from one shared shell, so every auth email
// (confirm signup, reset password, magic link, invite, email change) is byte-for-byte consistent.
// Run `node supabase/templates/_build.mjs` after editing the shell or copy below.
//
// Design notes:
// - Table-based, fully inline-styled, ~560px: the only HTML email layout that survives Gmail/Outlook/Apple Mail.
// - Brand logo is a self-contained CSS TEXT wordmark (GREATSTONE with a lime "O"), NOT a hosted image.
//   The previous hosted PNG pointed at the interim host (greatstone-home.netlify.app) — it would break in
//   every transactional email the moment that host is retired or the domain cuts over, and images are
//   blocked by default in many clients anyway. A styled text wordmark renders everywhere, never 404s, and
//   needs no remote dependency. This is the pre-launch resilience fix.
// - Site + contact live in single SITE / CONTACT constants below, so the domain is one edit at cutover.
// - Lime button carries DARK text (#0e1611), per the brand rule "never white text on lime".
// - Every email shows the raw action URL as a fallback for clients that strip the button.
// - Voice: British English, sentence case, no em-dashes, no banned words.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));

// {{ .ConfirmationURL }} is Supabase's action link for confirm/recovery/magic-link/invite/email-change.
const ACTION = '{{ .ConfirmationURL }}';
// Body/footer text colour: passes WCAG AA (~5.9:1 on the #1f1f1f card). #707070 (3.3:1) failed.
const MUTED = '#9a9a9a';
const LINK = '#aeb4ad';

// Single canonical domain + contact. Nothing else in the templates hardcodes a host.
// SITE: greatstoneint.com is the permanent domain (decided 2 Jul; no move to greatstonesoftware.co.uk).
// CONTACT stays on the old domain until John confirms a mailbox exists at the new one (it must RECEIVE).
const SITE = 'https://greatstoneint.com';
const CONTACT = 'dx@greatstonesoftware.co.uk';

// VML roundrect width must fit the CTA text (Outlook ignores the <a>'s padding, so the modern button
// and the Outlook button are built separately; this sizes the Outlook one).
const ctaWidth = (cta) => Math.round(cta.length * 8.5 + 56);

const shell = ({ preheader, heading, body, cta, safety }) => `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${heading} · Greatstone</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
  .gs-btn{ -webkit-text-fill-color:#0e1611 }
</style>
</head>
<body bgcolor="#141414" style="margin:0;padding:0;background:#141414;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#141414;font-size:1px;line-height:1px">${preheader}&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#141414" style="background:#141414">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="#1f1f1f" style="width:100%;max-width:560px;background:#1f1f1f;border-radius:16px;border:1px solid #2c2c2c">
<tr><td style="padding:32px 32px 0">
<a href="${SITE}" style="text-decoration:none;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:23px;line-height:1;font-weight:800;letter-spacing:3px;color:#f5f5f5">GREATST<span style="color:#c8ff00">O</span>NE</a>
</td></tr>
<tr><td style="padding:18px 32px 0">
<h1 style="font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.25;font-weight:800;color:#f5f5f5;margin:0 0 10px">${heading}</h1>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#b0b0b0;margin:0 0 24px">${body}</p>
</td></tr>
<tr><td style="padding:0 32px">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${ACTION}" style="height:46px;v-text-anchor:middle;width:${ctaWidth(cta)}px;" arcsize="50%" stroke="f" fillcolor="#c8ff00"><w:anchorlock/><center style="color:#0e1611;font-family:Arial,sans-serif;font-size:15px;font-weight:800">${cta}</center></v:roundrect><![endif]-->
<!--[if !mso]><!-- -->
<a class="gs-btn" href="${ACTION}" style="display:inline-block;padding:13px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:800;color:#0e1611;background:#c8ff00;text-decoration:none;border-radius:100px">${cta}</a>
<!--<![endif]-->
</td></tr>
<tr><td style="padding:24px 32px 0">
<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:${MUTED};margin:0 0 6px">If the button doesn't work, paste this link into your browser:</p>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;margin:0;word-break:break-all;overflow-wrap:break-word"><a href="${ACTION}" style="color:${LINK}">${ACTION}</a></p>
</td></tr>
<tr><td style="padding:26px 32px 32px">
<div style="border-top:1px solid #2c2c2c;padding-top:18px">
<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};margin:0 0 4px">${safety}</p>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};margin:0">Questions? <a href="mailto:${CONTACT}" style="color:${LINK}">${CONTACT}</a> · Greatstone International · The Foundation of Digital Excellence</p>
</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

const templates = {
  confirmation: {
    subject: 'Confirm your Greatstone account',
    preheader: 'One tap confirms your account and you are in.',
    heading: 'Confirm your account',
    body: 'Welcome to the Greatstone software store. Confirm this email to activate your account, then your order history, saved cards and faster checkout all live in one place.',
    cta: 'Confirm my account',
    safety: "If you didn't create a Greatstone account, you can safely ignore this email and nothing will change.",
  },
  recovery: {
    subject: 'Reset your Greatstone password',
    preheader: 'Choose a new password for your account.',
    heading: 'Reset your password',
    body: 'We received a request to reset the password on your Greatstone account. Choose a new one below. For your security, the link is only valid for a short time.',
    cta: 'Reset my password',
    safety: "If you didn't request this, you can safely ignore this email and your password stays the same.",
  },
  magic_link: {
    subject: 'Your Greatstone sign-in link',
    preheader: 'Your one-tap sign-in link, no password needed.',
    heading: 'Your sign-in link',
    body: 'Tap below to sign in to your Greatstone account. No password needed. For your security, the link is only valid for a short time.',
    cta: 'Sign in to Greatstone',
    safety: "If you didn't ask to sign in, you can safely ignore this email.",
  },
  invite: {
    subject: "You're invited to Greatstone",
    preheader: 'Set up your Greatstone account.',
    heading: "You're invited",
    body: 'You have been invited to the Greatstone software store. Set up your account below to see your catalogue, pricing and order history in one place.',
    cta: 'Accept the invitation',
    safety: "If you weren't expecting this invitation, you can safely ignore this email.",
  },
  email_change: {
    subject: 'Confirm your new email address',
    preheader: 'Confirm the new email on your account.',
    heading: 'Confirm your new email',
    // {{ .NewEmail }} names the address being switched to, so a recipient (this email goes to both the
    // old and new address under secure email change) can see exactly what they're confirming.
    body: 'We received a request to change the email on your Greatstone account to {{ .NewEmail }}. Confirm below to make the switch.',
    cta: 'Confirm new email',
    safety: "If you didn't request this change, please contact us and ignore this email.",
  },
};

for (const [name, t] of Object.entries(templates)) {
  writeFileSync(join(DIR, `${name}.html`), shell(t));
  console.log('wrote', `${name}.html`, '·', JSON.stringify(t.subject));
}
console.log('\nSubjects (for config.toml / dashboard):');
for (const [name, t] of Object.entries(templates)) console.log(`  ${name}: ${t.subject}`);
