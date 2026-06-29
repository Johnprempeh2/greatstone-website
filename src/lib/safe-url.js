// User-supplied link fields (ctaHref, email) are free text that blocks render straight into an
// href. React does NOT neutralise a `javascript:` URL in href, so an unguarded value is a stored
// XSS sink on the public site. These guards run at render time in the shipped components, so the
// protection travels into the Laravel/Inertia build (server-side validation gates who SAVES, not
// what the rendered href resolves to). Keep them tiny and allocation-free.

// Allow only safe link protocols; anything else (javascript:, data:, vbscript:, ...) → '#'.
const SAFE = /^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i;
export function safeHref(h) {
  // Strip ALL ASCII control chars + spaces (0x00–0x20 and DEL), not just the ends, BEFORE scheme-matching.
  // Browsers ignore tab/newline/leading-control chars when resolving a URL's protocol, so without this a value
  // like `java\tscript:` or `\x01javascript:` (or its &#9;/&#1; entity forms, decoded by the HTML parser before
  // we see it) would slip past the scheme tests and reach the DOM as a live javascript: link (stored XSS).
  const v = (h == null ? '' : String(h)).replace(/[\x00-\x20\x7f]/g, '');
  if (!v) return '#';
  // a bare path/anchor or an allow-listed protocol is fine; everything else is rejected
  if (SAFE.test(v)) return v;
  // protocol-relative or scheme-looking values that aren't allow-listed are unsafe
  return /^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('//') ? '#' : v;
}

// mailto: target from a free-text email field. Strip anything that turns a simple address into a
// header-injection / prefilled-spam link (?, &, newlines, spaces), and only emit mailto: for a
// plausible address; otherwise return '#'.
export function safeMailto(email) {
  const v = (email == null ? '' : String(email)).trim().replace(/[\s?&#]+.*$/, '');
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? 'mailto:' + v : '#';
}
