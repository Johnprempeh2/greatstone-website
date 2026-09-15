// A record string that carries its own subheading: "THE WORK ITSELF. Collect easily, analyse
// easily." The uppercase lead-in is a category somebody typed INTO the text, and rendered raw it
// blends into the prose at the same weight and colour, which reads as a mistake (John, 9 Sep).
//
// This is a DISPLAY transform, deliberately not a schema change: the words in the record stay
// exactly as somebody wrote them, and a string this cannot confidently parse passes through
// untouched. The alternative, restructuring OUTCOMES into {group, text}, would re-mint nothing
// (outcomes have no ids) but WOULD rewrite client text to fit our rendering, which is backwards.

/** The leading uppercase phrase, if the string clearly carries one.
 *
 *  Guardrails, each refusing a real way this could eat prose:
 *   - the lead must END with a full stop and be followed by more text, so an all-caps sentence
 *     that IS the whole item is left alone;
 *   - 6 to 32 characters, so "OK." at one end and a genuine shouted sentence at the other
 *     ("ABSA ASKED AND THE ANSWER WAS NO." is 33) both pass through as written;
 *   - uppercase letters, digits and light punctuation only: one lowercase letter anywhere in the
 *     candidate ("GCB does not buy...") and there is no lead.
 */
export function splitLead(s) {
  const text = String(s || '');
  const m = text.match(/^([A-Z][A-Z0-9 ,'&-]{4,30})\.\s+(\S[\s\S]*)$/);
  if (!m) return { lead: null, rest: text };
  return { lead: m[1].trim(), rest: m[2].trim() };
}

/** Consecutive items under one lead become one group; numbering stays global.
 *  Contiguity is observed, never assumed: the same lead appearing again later simply starts a
 *  second group, so a reordered record cannot silently merge two runs. */
export function groupByLead(items) {
  const groups = [];
  (items || []).forEach((raw, i) => {
    const { lead, rest } = splitLead(raw);
    const last = groups[groups.length - 1];
    if (last && last.lead === lead) last.items.push({ n: i + 1, text: rest });
    else groups.push({ lead, start: i + 1, items: [{ n: i + 1, text: rest }] });
  });
  return groups;
}
