// A DATE column is a calendar day, not an instant. `engagements.occurred_on`, `quotes.valid_until` and
// `maturity_assessments.assessed_on` arrive as 'YYYY-MM-DD', and `new Date('2026-04-01')` parses that as
// UTC midnight — so reading or formatting it on the LOCAL clock shows the day before for any viewer west
// of UTC (and buckets it into the previous month). Parse date-only values at LOCAL midnight instead, so
// the day a client sees is the day that was recorded, wherever they're sitting.
//
// TIMESTAMPTZ values ('…Z', '…+00:00' — placed_at, created_at, expires_at) are real instants and pass
// through untouched: those SHOULD render in the viewer's own zone. Anything else (Date, epoch ms, junk,
// null) is handed to Date unchanged, so callers keep their existing Invalid-Date guards.
// No React / DOM / Supabase deps, so it runs under plain `node --test`.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function asLocalDate(value) {
  if (typeof value === 'string') {
    const s = value.trim();
    if (DATE_ONLY.test(s)) return new Date(s + 'T00:00:00');
  }
  return new Date(value);
}
