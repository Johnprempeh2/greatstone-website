// GRE-2653: the three-way quote choice made at sign-off (claims C4/C5 of the interview privacy notice).
//   'none'       the person's words never appear verbatim in any synthesis; their insights still count in themes
//   'anonymous'  quotes may appear, attributed by role and team only
//   'named'      quotes may appear with the person's name
// Nothing is pre-selected. A person who leaves before choosing (NULL) is treated as 'none'.
import { normalise } from './synthesis/invariants.mjs';

export const QUOTE_CHOICES = Object.freeze(['none', 'anonymous', 'named']);
export const WITHHELD = '[quote withheld]';

/** The choice from a request or an old two-way answer; null when it is not one of the three. */
export function parseQuoteChoice(value) {
  if (QUOTE_CHOICES.includes(value)) return value;
  // the source engine's two-way answer
  if (value === 'anonymised') return 'anonymous';
  return null;
}

/** The choice in effect for an employee row: an unmade choice is 'none'. */
export const effectiveQuoteChoice = (employee) => parseQuoteChoice(employee?.quote_choice) ?? 'none';

export const quotesAllowed = (employee) => effectiveQuoteChoice(employee) !== 'none';

/** Named only when the person chose 'named'. */
export const attributionRedacted = (choice) => choice !== 'named';

/**
 * Replace any verbatim span of a withheld person's evidence in every string of a synthesis value. The quote gate
 * already keeps their quotes out; this catches model prose that repeats their words. sources: evidence quotes (and
 * any other text) of people who chose 'none'. Short fragments (under 30 characters or 7 words) are not matched, as
 * the quote gate's own minimum.
 */
export function scrubVerbatim(value, sources) {
  const needles = [...new Set((sources ?? []).map((s) => normalise(String(s ?? ''))))]
    .filter((s) => s.length >= 30 && s.split(' ').length >= 7)
    .sort((a, b) => b.length - a.length);
  if (needles.length === 0) return value;
  const walk = (v) => {
    if (typeof v === 'string') {
      let text = v;
      for (const needle of needles) {
        if (!normalise(text).includes(needle)) continue;
        // match on the normalised form, whitespace-tolerant, case-insensitive
        const pattern = needle.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
        text = text.replace(new RegExp(pattern, 'gi'), WITHHELD);
      }
      return text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value);
}
