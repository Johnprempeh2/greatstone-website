// GITA evidence markers in the reader (GRE-1257; spec GRE-1227 revision 2, section 8). Runs on section HTML the
// sanitiser has already cleaned. The reader styles the markers, not the author: any class the author wrote is
// dropped, then each paragraph or list item that starts with "Known:", "Indicated:" or "To validate:" (or the
// bracket form) gets the reader's own tag and class. The marker text is replaced by a tag that a screen reader
// reads as "Known:", so the meaning never rests on colour. Browser-only (DOMParser); returns the input without a DOM.
import { EVIDENCE, evidenceMarker } from '../../supabase/functions/_shared/portal-gita.mjs';

// drop the first `n` characters of an element's text, across nested inline nodes, then any inline wrapper left empty
function dropLeadingText(el, n) {
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  let left = n;
  const touched = [];
  for (let t = walker.nextNode(); t && left > 0; t = walker.nextNode()) {
    const take = Math.min(left, t.data.length);
    t.data = t.data.slice(take);
    left -= take;
    touched.push(t);
  }
  for (const t of touched) {
    let p = t.parentNode;
    if (!t.data) t.remove();
    while (p && p !== el && !p.textContent.trim() && !p.querySelector('br')) { const up = p.parentNode; p.remove(); p = up; }
  }
}

export function markEvidence(html) {
  if (!html || typeof DOMParser === 'undefined') return html || '';
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstChild;
  for (const el of root.querySelectorAll('[class]')) el.removeAttribute('class');
  for (const el of root.querySelectorAll('p, li')) {
    const m = evidenceMarker(el.textContent);
    if (!m) continue;
    dropLeadingText(el, m.length);
    const tag = doc.createElement('span');
    tag.className = 'pt-ev-tag';
    tag.textContent = EVIDENCE[m.key];
    const sr = doc.createElement('span');
    sr.className = 'gs-sr-only';
    sr.textContent = ': ';
    tag.appendChild(sr);
    el.insertBefore(tag, el.firstChild);
    el.className = 'pt-ev pt-ev-' + m.key.replace('_', '-');
  }
  return root.innerHTML;
}
