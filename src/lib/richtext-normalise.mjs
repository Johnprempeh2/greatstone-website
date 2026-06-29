// Pure string helpers for the inline rich-text path. STORE-FREE (no DOM, no React) so they are node-tested.
// These canonicalise the EDGES of the rich-text lifecycle: upgrading a legacy plain-text value to safe inline
// HTML on load, and the legacy **bold** convention to <strong>. DOM-level tag aliasing (b->strong, i->em) and
// the safety allowlist are the sanitiser's job (sanitize-html.mjs sanitizeInline); these are the regex edges.

// Escape a plain string so it is safe to treat as HTML text (the only angle brackets left are ones we add).
export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// **bold** -> <strong>bold</strong> on an ALREADY-ESCAPED string. Single-line, non-nested, matching the old
// emphasize.jsx regex exactly, so legacy Chapter/StatStrip seed copy upgrades losslessly.
export function applyLegacyBold(escaped) {
  return String(escaped).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
}

// Does a stored value already look like authored rich HTML (has a tag), vs a legacy plain string?
export function looksLikeHtml(s) {
  return typeof s === 'string' && /<[a-z][\s\S]*>/i.test(s);
}

// A legacy plain-text value -> safe inline HTML (escape first, then upgrade ** emphasis). Used to coerce old
// drafts/seed strings for the RichTextField and the <RichText> renderer without ever trusting raw input.
export function plainToRichHtml(s) {
  return applyLegacyBold(escapeHtml(s));
}

// Rich HTML -> plain text (tags removed, basic entities decoded). For places that need a STRING not markup:
// the FAQ JSON-LD answer text, a search index, an aria-label. Legacy ** markers are also dropped.
export function stripTags(html) {
  return String(html == null ? '' : html)
    .replace(/<[^>]*>/g, '')
    .replace(/\*\*/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .trim();
}
