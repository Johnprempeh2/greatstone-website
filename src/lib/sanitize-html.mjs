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
