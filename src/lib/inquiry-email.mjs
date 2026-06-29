// Pure composer for the service-inquiry email. The drawer used to inline this; it now lives here so the
// success-state fallback link and the degraded auto-mailto build the IDENTICAL message, and so it is
// unit-testable. STORE-FREE: imports nothing from src/store.js, no React, no JSX. Loads under bare node.
//
// House style: no em-dashes or en-dashes anywhere in the composed text (the old version used ' — '
// separators); a service category renders as 'Name (Category)', and the block header is 'About us:'.

const SAFE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// mailto target from a free-text address, mirroring lib/safe-url.js safeMailto, inlined to stay store-free.
function safeMailtoLocal(email) {
  const v = (email == null ? '' : String(email)).trim().replace(/[\s?&#]+.*$/, '');
  return SAFE_EMAIL.test(v) ? 'mailto:' + v : '#';
}

export function buildInquirySubject(services = []) {
  return services.length === 1
    ? 'Service inquiry · ' + services[0].name
    : 'Services inquiry · ' + services.length + ' services';
}

export function buildInquiryBody(services = [], contact = {}) {
  const { name, email, company, message } = contact;
  const many = services.length !== 1;
  const lines = [
    'I would like to inquire about the following Greatstone service' + (many ? 's' : '') + ':',
    '',
    ...services.map((it, i) => (i + 1) + '. ' + it.name + (it.category ? ' (' + it.category + ')' : '')),
    '',
    'About us:',
  ];
  if (company) lines.push('Company: ' + company);
  if (name) lines.push('Name: ' + name);
  if (email) lines.push('Work email: ' + email);
  lines.push('');
  lines.push('What we are trying to solve:');
  lines.push(message || '');
  return lines.join('\n');
}

// Full 'mailto:…?subject=…&body=…' href, or '#' when the target address is implausible or there are no services.
export function buildInquiryMailto(toEmail, services = [], contact = {}) {
  const to = safeMailtoLocal(toEmail);
  if (to === '#' || !services.length) return '#';
  return to
    + '?subject=' + encodeURIComponent(buildInquirySubject(services))
    + '&body=' + encodeURIComponent(buildInquiryBody(services, contact));
}
