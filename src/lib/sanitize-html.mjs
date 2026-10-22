// Shared allowlist HTML sanitiser for staff-authored engagement content (recaps). Defence-in-depth even
// though authors are staff: the output is re-parsed by React (dangerouslySetInnerHTML), so this must survive
// the round-trip. (a) foreign-content / rawtext containers (svg/math/style/noscript/…) are DROPPED ENTIRELY
// rather than unwrapped — unwrapping them is the classic mutation-XSS vector; (b) any heading is demoted to
// <h5> so a recap can't break the page heading order; (c) the whole pass runs to a fixpoint so a string that
// re-parses differently can't smuggle live nodes through. Browser-only (DOMParser); returns '' without a DOM.
// Extracted from OrgDashboard so the #org client view and the staff "preview as the client sees it" pane
// share ONE sanitiser. The policy (ALLOWED / DROP_ENTIRELY / DEMOTE) and isSafeHref are unit-tested.

export const ALLOWED = new Set(['P', 'H5', 'H6', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'B', 'I', 'A', 'BR', 'BLOCKQUOTE', 'CODE', 'PRE', 'SPAN', 'HR']);
export const DROP_ENTIRELY = new Set(['SCRIPT', 'STYLE', 'SVG', 'MATH', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'TITLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'HEAD', 'FRAME', 'FRAMESET', 'XMP']);
export const DEMOTE = new Set(['H1', 'H2', 'H3', 'H4']); // any body heading sits below the <h4> card title

// only http(s) and mailto links survive; javascript:, data:, vbscript:, leading-space tricks, etc. are neutralised
export const isSafeHref = (url) => /^(https?:|mailto:)/i.test(String(url || '').trim());

function sanitizeOnce(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstChild;
  const walk = (node) => {
    for (const el of Array.from(node.children || [])) {
      const tag = el.tagName;
      if (DROP_ENTIRELY.has(tag)) { el.remove(); continue; }                 // drop the whole subtree
      if (DEMOTE.has(tag)) {                                                  // rename heading → h5
        const h = doc.createElement('h5');
        while (el.firstChild) h.appendChild(el.firstChild);
        el.replaceWith(h); walk(h); continue;
      }
      if (!ALLOWED.has(tag)) { el.replaceWith(...Array.from(el.childNodes)); continue; } // unwrap benign unknown (fixpoint re-cleans promoted children)
      for (const attr of Array.from(el.attributes)) {
        const n = attr.name.toLowerCase();
        if (el.tagName === 'A' && n === 'href') {
          if (!isSafeHref(attr.value)) el.removeAttribute('href');
          continue;
        }
        if (n !== 'class') el.removeAttribute(attr.name);                     // strips on* handlers + everything else
      }
      if (el.tagName === 'A' && el.getAttribute('href')) {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
        el.setAttribute('aria-label', (el.textContent || 'link').trim() + ' (opens in a new tab)');
      }
      walk(el);
    }
  };
  walk(root);
  return root.innerHTML;
}

export function sanitizeHtml(html) {
  if (!html || typeof window === 'undefined') return '';
  let out = String(html);
  for (let i = 0; i < 6; i++) { const next = sanitizeOnce(out); if (next === out) break; out = next; } // fixpoint
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// INLINE profile — for the RichTextField body copy (bold/italic/underline + brand colour/highlight runs).
// Differs from the recap profile above in three security-critical ways: (a) only INLINE marks survive — any
// block/heading/list tag is UNWRAPPED to its text (never a nested <p>/<h2> inside a paragraph); (b) a SPAN
// keeps its class ONLY if every token is in the closed brand-class enum (RT_SPAN_CLASSES) and its style
// attribute is ALWAYS stripped — this is what makes colour brand-constrained and closes the inline-style
// XSS/contrast hole; (c) an <a> href is checked with safe-url.js safeHref (so on-site #/relative + tel: links
// survive, not just http/mailto) and external links are target/rel hardened. b->strong, i->em are aliased to
// the canonical tags so stored HTML stays tiny and predictable.
import { RT_SPAN_CLASSES } from './richtext-marks.mjs';
import { safeHref } from './safe-url.js';

export const ALLOWED_INLINE = new Set(['STRONG', 'EM', 'U', 'SPAN', 'A', 'BR']);
const INLINE_ALIAS = { B: 'STRONG', I: 'EM' }; // canonicalise execCommand output
// block-level tags that mark a LINE boundary: when unwrapped to inline text they become a <br> (so a typed
// Enter or a pasted multi-paragraph keeps its line breaks instead of collapsing onto one line).
const INLINE_BREAK = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE']);

// keep only the brand-enum classes; returns '' if none survive (so the class attribute is dropped)
function keepBrandClasses(value) {
  return String(value || '').split(/\s+/).filter((c) => RT_SPAN_CLASSES.has(c)).join(' ');
}

function sanitizeInlineOnce(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstChild;
  const walk = (node) => {
    for (const el of Array.from(node.children || [])) {
      let tag = el.tagName;
      if (DROP_ENTIRELY.has(tag)) { el.remove(); continue; }                 // drop the whole subtree
      if (INLINE_ALIAS[tag]) {                                               // b->strong, i->em
        const c = doc.createElement(INLINE_ALIAS[tag]);
        while (el.firstChild) c.appendChild(el.firstChild);
        el.replaceWith(c); walk(c); continue;
      }
      if (!ALLOWED_INLINE.has(tag)) {                                        // unwrap block/unknown to its text
        const kids = Array.from(el.childNodes);
        if (INLINE_BREAK.has(tag) && el.previousSibling && (el.textContent || '').trim()) {
          el.replaceWith(doc.createElement('br'), ...kids);                 // keep the line break
        } else {
          el.replaceWith(...kids);
        }
        continue;
      }
      // allowed inline tag: scrub attributes down to the bare safe minimum
      for (const attr of Array.from(el.attributes)) {
        const n = attr.name.toLowerCase();
        if (tag === 'SPAN' && n === 'class') {
          const kept = keepBrandClasses(attr.value);
          if (kept) el.setAttribute('class', kept); else el.removeAttribute('class');
          continue;
        }
        if (tag === 'A' && n === 'href') continue; // handled below
        el.removeAttribute(attr.name);             // strips style, on* handlers, and everything else
      }
      if (tag === 'A') {
        const href = safeHref(el.getAttribute('href'));
        if (href === '#') { el.removeAttribute('href'); }
        else {
          el.setAttribute('href', href);
          if (/^https?:/i.test(href)) {            // external links only get a new tab + rel hardening
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
          }
        }
      }
      walk(el);
    }
  };
  walk(root);
  return root.innerHTML;
}

export function sanitizeInline(html) {
  if (!html || typeof DOMParser === 'undefined') return '';
  let out = String(html);
  for (let i = 0; i < 6; i++) { const next = sanitizeInlineOnce(out); if (next === out) break; out = next; } // fixpoint
  return out;
}
