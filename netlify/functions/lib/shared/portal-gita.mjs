// The GITA in the portal (GRE-1257; spec GRE-1227 revision 2, section 8). Pure, so `node --test` covers it, and
// shared by the reader (src/portal/DocumentView.jsx) and the receipt email copy (portal-receipt.mjs), so the
// client and the email show the sections in the same order.
//   - readingOrder(): sections in the order of the pack, with the Commercial Perspective last
//   - evidenceMarker(): the Known / Indicated / To validate marker at the start of a paragraph or list item.
//     Authors write the marker as text ("Known: ..." or "[Indicated] ..."); the reader styles it, the author
//     does not.

const COMMERCIAL_TITLE = /^\s*(?:the\s+)?commercial\s+perspective\b/i;
const COMMERCIAL_ID = /^commercial[-_]?perspective$/i;

/** True for the GITA's Commercial Perspective section (by its title or its id). */
export const isCommercialPerspective = (s) =>
  !!s && (COMMERCIAL_TITLE.test(String(s.title || '')) || COMMERCIAL_ID.test(String(s.id || '')));

/** The sections in reading order. In a GITA the Commercial Perspective goes last; the others keep pack order. */
export function readingOrder(kind, sections = []) {
  const list = Array.isArray(sections) ? sections.filter(Boolean) : [];
  if (kind !== 'gita') return list;
  return [...list.filter((s) => !isCommercialPerspective(s)), ...list.filter(isCommercialPerspective)];
}

export const EVIDENCE = { known: 'Known', indicated: 'Indicated', to_validate: 'To validate' };

// "Known:", "Known –", "[Known]" or "[Known]:" at the very start. A bare "Known risks..." is ordinary text.
const MARKER = /^\s*(?:\[\s*(known|indicated|to\s+validate)\s*\]\s*[:–—-]?|(known|indicated|to\s+validate)\s*[:–—-])\s*/i;

/** { key, length } when `text` starts with an evidence marker (length = characters to drop), else null. */
export function evidenceMarker(text) {
  const m = MARKER.exec(String(text || ''));
  if (!m) return null;
  const word = (m[1] || m[2]).toLowerCase().replace(/\s+/g, ' ');
  return { key: word === 'to validate' ? 'to_validate' : word, length: m[0].length };
}
