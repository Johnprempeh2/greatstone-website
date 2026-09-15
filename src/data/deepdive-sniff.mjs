// What a stored document actually IS, decided from its bytes.
//
// ONE COPY, shared by the dev upload endpoint in vite.config.js and by the browser, which uploads
// straight to Supabase Storage and so has to make the same decision itself. A second copy of this
// table is the same mistake this repo has already made three times: the MCP kept its own buildItem,
// its own labelOf and its own descriptor check, and every one of them drifted from the shared rule.
//
// Pure, and no imports, so both a Node middleware and a browser module can load it.
// Signatures are byte arrays, not strings: the originals were written as Latin-1 escapes inside a
// JS string and that is one encoding assumption away from silently matching nothing.
// Works on a Uint8Array; Node callers pass `new Uint8Array(buf)`.

const MAGIC = [
  [[0x24, 0x46, 0x4c, 0x32], 'application/x-spss-sav', 'sav'],   // $FL2
  [[0x24, 0x46, 0x4c, 0x33], 'application/x-spss-sav', 'zsav'],  // $FL3
  [[0x25, 0x50, 0x44, 0x46, 0x2d], 'application/pdf', 'pdf'],    // %PDF-
  [[0x50, 0x4b, 0x03, 0x04], 'application/vnd.openxmlformats-officedocument', 'xlsx'],
  [[0xd0, 0xcf, 0x11, 0xe0], 'application/x-ole-storage', 'xls'],
  [[0x89, 0x50, 0x4e, 0x47], 'image/png', 'png'],
  [[0xff, 0xd8, 0xff], 'image/jpeg', 'jpg'],
  [[0x47, 0x49, 0x46, 0x38], 'image/gif', 'gif'],                // GIF8
  [[0x52, 0x49, 0x46, 0x46], 'image/webp', 'webp'],              // RIFF
];

/** @param {Uint8Array} bytes @returns {{mime:string, ext:string}|null} null means not accepted */
export function sniff(bytes) {
  for (const [sig, mime, ext] of MAGIC) {
    if (bytes.length < sig.length) continue;
    let hit = true;
    for (let i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) { hit = false; break; }
    if (hit) return { mime, ext };
  }
  // Text only if it is genuinely UTF-8; a mislabelled binary must not slip through as CSV.
  const head = bytes.subarray(0, 4096);
  if (!head.length) return null;
  if (head.includes(0)) return null;
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(head); } catch { return null; }
  // ...and only if it is not MARKUP. An SVG or an HTML file is valid UTF-8, so the text branch
  // would otherwise store a script-carrying document as text/plain. Downloads are always
  // octet-stream so it could not execute today, but storing it mislabelled leaves a stored XSS
  // waiting for the first preview feature that trusts the recorded type.
  const start = text.slice(0, 1024).trim().toLowerCase();
  if (/^<(\?xml|!doctype|svg|html)\b/.test(start) || /<script\b/.test(start)) return null;
  return { mime: 'text/plain', ext: 'txt' };
}

/** Content-addressed, so the same bytes attached to two items are one blob with two ties rather
 *  than two copies. Same scheme on both sides: sha256, first 12 hex, prefixed a:. */
export const fileId = (hex) => `a:${hex.slice(0, 12)}`;
export const FILE_ID_RE = /^a:[0-9a-f]{12}$/;
export const BARE_ID_RE = /^[0-9a-f]{12}$/;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
