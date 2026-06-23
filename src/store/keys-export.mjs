// Pure CSV serialization for the customer's "download all licence keys" export (client-side Blob download,
// no backend). RFC-4180-style quoting: a field is wrapped in double-quotes when it contains a comma, a quote,
// or a newline, with inner quotes doubled. No React deps so it runs under `node --test`.

const HEADERS = ['Product', 'Variant', 'Licence key', 'Seats', 'Status', 'Expires', 'Order'];

function csvField(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function keysToCsv(keys) {
  const rows = (Array.isArray(keys) ? keys : []).filter(Boolean).map(k => [
    k.offering_name,
    k.variant_name,
    k.licence_key,
    k.seats,
    k.status,
    k.expires_at ? String(k.expires_at).slice(0, 10) : '',
    (k.order && k.order.reference) || '',
  ].map(csvField).join(','));
  return [HEADERS.join(','), ...rows].join('\r\n');
}
