// Build a minimal, valid iCalendar (.ics) for an all-day engagement, so a client can save their next
// Greatstone touchpoint to any calendar app. `date` is the engagement's occurred_on ('YYYY-MM-DD').
// Pure + deterministic (uid/stamp injectable) so it runs under plain `node --test`. Returns null on a
// bad date so the caller can render nothing rather than a broken file.

const pad2 = (n) => String(n).padStart(2, '0');

// RFC5545 text escaping: backslash, semicolon, comma, and newlines.
const esc = (s) => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// 'YYYY','MM','DD' → the next calendar day as 'YYYYMMDD' (DTEND is exclusive for all-day events).
function nextDayCompact(y, mo, d) {
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d) + 1));
  return `${dt.getUTCFullYear()}${pad2(dt.getUTCMonth() + 1)}${pad2(dt.getUTCDate())}`;
}

export function toIcs({ title, date, description = '', location = '', uid = 'greatstone-event', stamp = '20000101T000000Z' } = {}) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || '').trim());
  if (!m) return null;                       // no valid date → caller shows no "add to calendar"
  const start = m[1] + m[2] + m[3];
  const end = nextDayCompact(m[1], m[2], m[3]);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Greatstone//DX Hub//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:' + esc(uid),
    'DTSTAMP:' + stamp,
    'DTSTART;VALUE=DATE:' + start,
    'DTEND;VALUE=DATE:' + end,
    'SUMMARY:' + esc(title || 'Greatstone session'),
    description ? 'DESCRIPTION:' + esc(description) : null,
    location ? 'LOCATION:' + esc(location) : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n') + '\r\n';         // CRLF line endings per RFC5545
}
