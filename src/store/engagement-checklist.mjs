// Pure "ready to share" checklist for a staff engagement — what the client will see and whether it's complete
// before staff make it visible. Mirrors the 0013 chk_engagement_content constraint (recaps/deliverables need
// inline content OR a link) so a Share-on-save can't fail server-side. No React deps → runs under `node --test`.

export const NEEDS_CONTENT = new Set(['recap', 'deliverable']);

const nonEmpty = (s) => !!(s && String(s).trim());

// Returns [{ key, label, ok }] — the items the client-facing engagement must satisfy to be share-ready.
export function shareChecklist({ kind, title, occurredOn, externalUrl, bodyHtml } = {}) {
  const items = [
    { key: 'title', label: 'Has a title', ok: nonEmpty(title) },
    { key: 'date', label: 'Has a date', ok: nonEmpty(occurredOn) },
  ];
  if (NEEDS_CONTENT.has(kind)) {
    items.push({ key: 'content', label: 'Has a recap link or inline content', ok: nonEmpty(externalUrl) || nonEmpty(bodyHtml) });
  }
  return items;
}

export function isShareReady(eng) {
  return shareChecklist(eng).every(i => i.ok);
}
