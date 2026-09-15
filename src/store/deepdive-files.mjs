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
import { isAbsentOrForbidden } from '../lib/pg-absent.mjs';
import { sniff, fileId, FILE_ID_RE, BARE_ID_RE, MAX_FILE_BYTES as CAP } from '../data/deepdive-sniff.mjs';

const base = () => `${import.meta.env.BASE_URL || '/'}deepdive-file`;
const BUCKET = 'deepdive-files';

export const MAX_FILE_BYTES = CAP;

export const ACCEPTED = '.sav,.zsav,.por,.xlsx,.xls,.docx,.doc,.pptx,.ppt,.pdf,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp';

export const prettyBytes = (n) => (n >= 1024 * 1024 ? `${(n / 1048576).toFixed(1)} MB`
  : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} bytes`);

const bare = (id) => String(id).replace(/^a:/, '');
const pathFor = (slug, id) => `${slug}/${bare(id)}`;

/** Is there a durable store for bytes here? Checked once, like the record's own capability probe. */
let CAN = null;
export async function fileBackend() {
  if (CAN) return CAN;
  if (supabase) {
    const { error } = await supabase.storage.from(BUCKET).list('', { limit: 1 });
    if (!error) { CAN = 'supabase'; return CAN; }
    // A bucket that is not there yet, or not readable by this viewer, falls back to the dev
    // endpoint rather than blocking the whole feature on a migration nobody has applied.
    if (!/not found|does not exist|Bucket/i.test(error.message || '')) { CAN = 'supabase'; return CAN; }
  }
  CAN = 'file';
  return CAN;
}
export const resetFileBackend = () => { CAN = null; };

/** Send the bytes. Returns the content id and a suggested label; nothing is recorded against an
 *  item until the practitioner names it. */
export async function uploadFile(slug, file) {
  if (file.size > MAX_FILE_BYTES) {
    // ⚠ The limit is SAID by the same constant it is CHECKED against. It used to read "25 MB" as a
    // literal, so raising the cap would have left the refusal quoting the old number at somebody
    // who had just been told a larger file was fine.
    throw new Error(`${file.name} is ${prettyBytes(file.size)}. The limit is ${prettyBytes(MAX_FILE_BYTES)}.`);
  }
  if (await fileBackend() === 'supabase') return uploadToSupabase(slug, file);
  return uploadToDevServer(slug, file);
}

async function uploadToSupabase(slug, file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) throw new Error('Empty file.');
  // ⚠ SNIFFED FROM THE BYTES, using the SAME table the dev endpoint uses, never from the extension
  // the uploader happened to type. A browser-side check is not a guard on its own, which is why the
  // bucket is private and accepts exactly one content type; this is what stops a mislabelled
  // document being RECORDED as something it is not.
  const kind = sniff(bytes);
  if (!kind) {
    throw new Error('That file type is not accepted. Documents, spreadsheets, statistics data, PDFs, images and plain text only.');
  }
  if (!globalThis.crypto?.subtle) {
    throw new Error('This browser cannot hash the file, so it cannot be stored. Use a secure connection.');
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const id = fileId(hex);
  // Content-addressed, so the same bytes uploaded twice land on the same object. upsert makes that
  // a no-op rather than an error.
  const { error } = await supabase.storage.from(BUCKET).upload(pathFor(slug, id), file, {
    contentType: 'application/octet-stream', upsert: true,
  });
  if (error) throw new Error(`The file could not be stored. ${error.message}`);
  return { id, mime: kind.mime, ext: kind.ext, bytes: bytes.length, suggestedLabel: file.name };
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
  if (await fileBackend() === 'supabase') {
    const { data, error } = await supabase.storage.from(BUCKET).download(pathFor(slug, fileIdIn));
    if (error || !data) throw new Error('That file could not be read.');
    // Re-wrap as octet-stream. The stored type is already octet-stream, but re-typing it here means
    // the download can never inherit a content type from anywhere else later.
    blob = new Blob([await data.arrayBuffer()], { type: 'application/octet-stream' });
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
  if (await fileBackend() === 'supabase') {
    const { error } = await supabase.storage.from(BUCKET).remove([pathFor(slug, fileIdIn)]);
    // Already gone is the outcome the caller wanted.
    if (error && !/not found/i.test(error.message || '')) throw new Error('That file could not be removed.');
    return true;
  }
  const res = await fetch(`${base()}/${encodeURIComponent(bare(fileIdIn))}?slug=${encodeURIComponent(slug)}`,
    { method: 'DELETE' });
  if (!res.ok) throw new Error('That file could not be removed.');
  return true;
}

export const filesFor = (files, itemId) =>
  (files || []).filter((f) => (f.attachedTo || []).includes(itemId));
