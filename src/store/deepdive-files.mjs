// Documents attached to an item.
//
// NOT a new item kind. The record already has EVIDENCE, whose whole purpose is what we hold, what is
// still missing, how we know, and what it bears on. Every evidence row in the live record sits at
// "partial" because there has never been a way to actually hold anything: one of them is literally
// "The SPSS work itself". Attaching a file is the move from partial to held, which shortens the
// "bring with you" list a practitioner carries into a session. That is the feature.
//
// The manifest lives in the STATE document beside findings, for the same reason: the plan is
// regenerated from the Investigation Plan and a document uploaded three weeks in must survive that.
//
// THE UPLOADER'S FILENAME IS NOT IN THE MANIFEST. The state document is fetched whole by anything
// that reads visibility, so a name like "GCB_vs_Ecobank_pricing_draft.xlsx" arriving off a
// practitioner's disk would ride into a document a client's browser downloads entire, past the
// visibility flag. The practitioner types a label instead, seeded from the filename where they can
// see and change it first. The raw name stays in a sidecar only the download route reads.
import { supabase } from '../lib/supabase.mjs';
import { FILE_ID_RE, BARE_ID_RE, MAX_FILE_BYTES as CAP } from '../data/deepdive-sniff.mjs';

const base = () => `${import.meta.env.BASE_URL || '/'}deepdive-file`;
const api = () => '/api/deepdive-file';

export const MAX_FILE_BYTES = CAP;

export const ACCEPTED = '.sav,.zsav,.por,.xlsx,.xls,.docx,.doc,.pptx,.ppt,.pdf,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp';

export const prettyBytes = (n) => (n >= 1024 * 1024 ? `${(n / 1048576).toFixed(1)} MB`
  : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} bytes`);

const bare = (id) => String(id).replace(/^a:/, '');

/** Is there a durable store for bytes here? Checked once, like the record's own capability probe. */
export async function fileBackend() {
  return import.meta.env?.PROD ? 'netlify' : 'file';
}
export const resetFileBackend = () => {};

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in to use files.');
  return { authorization: `Bearer ${session.access_token}` };
}

/** Send the bytes. Returns the content id and a suggested label; nothing is recorded against an
 *  item until the practitioner names it. */
export async function uploadFile(slug, file) {
  if (file.size > MAX_FILE_BYTES) {
    // ⚠ The limit is SAID by the same constant it is CHECKED against. It used to read "25 MB" as a
    // literal, so raising the cap would have left the refusal quoting the old number at somebody
    // who had just been told a larger file was fine.
    throw new Error(`${file.name} is ${prettyBytes(file.size)}. The limit is ${prettyBytes(MAX_FILE_BYTES)}.`);
  }
  if (await fileBackend() === 'netlify') return uploadToNetlify(slug, file);
  return uploadToDevServer(slug, file);
}

async function uploadToNetlify(slug, file) {
  const headers = { ...await authHeaders(), 'content-type': 'application/octet-stream',
    'x-file-name': btoa(String.fromCharCode(...new TextEncoder().encode(file.name))) };
  const response = await fetch(`${api()}?slug=${encodeURIComponent(slug)}`, { method: 'POST', headers, body: file });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || 'The file could not be stored.');
  return result;
}

async function uploadToDevServer(slug, file) {
  const res = await fetch(`${base()}?slug=${encodeURIComponent(slug)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      // base64 so a filename with any character cannot break the header or become a path
      'x-file-name': btoa(String.fromCharCode(...new TextEncoder().encode(file.name))),
    },
    body: file,
  }).catch(() => null);
  if (!res) throw new Error('Nothing here can store a file. Run the dev server.');
  let out = null;
  try { out = await res.json(); } catch { out = null; }
  if (!res.ok) throw new Error(out?.error || `Upload failed (${res.status}).`);
  return out;
}

/** Hand the browser a download. Never a plain <a href>: on the dev path that is a top-level
 *  navigation, which sends no Origin and would quietly retire one of the three arms of the
 *  middleware's check; and on either path the bytes must arrive as an opaque blob we name
 *  ourselves rather than as something the browser decides how to render. */
export async function downloadFile(slug, fileIdIn, label) {
  if (!FILE_ID_RE.test(String(fileIdIn)) && !BARE_ID_RE.test(String(fileIdIn))) {
    throw new Error('Bad file id.');
  }
  let blob;
  if (await fileBackend() === 'netlify') {
    const res = await fetch(`${api()}?slug=${encodeURIComponent(slug)}&id=${bare(fileIdIn)}`, { headers: await authHeaders() });
    if (!res.ok) throw new Error('That file could not be read.');
    blob = new Blob([await res.arrayBuffer()], { type: 'application/octet-stream' });
  } else {
    const res = await fetch(`${base()}/${encodeURIComponent(bare(fileIdIn))}?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) throw new Error('That file could not be read.');
    blob = await res.blob();
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  // The PRACTITIONER'S label, never the uploader's own filename: the record says what a document
  // is, not what it was called on somebody's disk.
  a.href = url; a.download = label || 'document';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function deleteFile(slug, fileIdIn) {
  if (await fileBackend() === 'netlify') {
    const res = await fetch(`${api()}?slug=${encodeURIComponent(slug)}&id=${bare(fileIdIn)}`,
      { method: 'DELETE', headers: await authHeaders() });
    if (!res.ok) throw new Error('That file could not be removed.');
    return true;
  }
  const res = await fetch(`${base()}/${encodeURIComponent(bare(fileIdIn))}?slug=${encodeURIComponent(slug)}`,
    { method: 'DELETE' });
  if (!res.ok) throw new Error('That file could not be removed.');
  return true;
}

export const filesFor = (files, itemId) =>
  (files || []).filter((f) => (f.attachedTo || []).includes(itemId));
