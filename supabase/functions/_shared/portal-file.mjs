// The designed PDF of a portal document (GRE-1257; spec GRE-1227 revision 2, sections 4 "Storage" and 8). The
// bucket portal-files is private and clients have no storage policy, so a client gets the file only through a
// short-lived signed URL from this handler. The check is the same as RLS because it IS RLS: the document is read
// with the caller's own token, so a client finds only its own company's published documents and staff only
// their own organisation's. Only then does the service role sign the stored path, which the browser never sends.
// Pure apart from the injected deps, so `node --test` covers it; supabase/functions/portal-file runs it.

export const SIGNED_URL_SECONDS = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fileSafe = (s) => String(s || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'document';

/** The name the browser saves the file as: "<title>-v<version>.pdf". */
export const pdfDownloadName = (doc = {}) => `${fileSafe(doc.title)}-v${Number(doc.version) || 1}.pdf`;

/**
 * deps: readDocument(id) → { data: { id, title, version, pdf_path } | null, error } with the caller's token (RLS);
 *       signUrl(path, seconds, downloadName) → { data: { signedUrl }, error } with the service role.
 * Returns { status, body }. Errors say what to do next and hold no path or personal data.
 */
export async function handlePortalFile({ signedIn, documentId, deps }) {
  if (!signedIn) return { status: 401, body: { error: 'Sign in to download this file.' } };
  if (!UUID.test(String(documentId || ''))) return { status: 400, body: { error: 'This link is not complete.' } };
  let doc;
  try {
    const { data, error } = await deps.readDocument(documentId);
    if (error) return { status: 502, body: { error: 'We could not check this document. Try again.' } };
    doc = data;
  } catch {
    return { status: 502, body: { error: 'We could not check this document. Try again.' } };
  }
  if (!doc) return { status: 404, body: { error: 'This document is not in your portal.' } };
  if (!doc.pdf_path) return { status: 404, body: { error: 'This document has no PDF.' } };
  try {
    const { data, error } = await deps.signUrl(doc.pdf_path, SIGNED_URL_SECONDS, pdfDownloadName(doc));
    if (error || !data || !data.signedUrl) return { status: 502, body: { error: 'We could not get the PDF. Try again.' } };
    return { status: 200, body: { url: data.signedUrl, name: pdfDownloadName(doc), expiresIn: SIGNED_URL_SECONDS } };
  } catch {
    return { status: 502, body: { error: 'We could not get the PDF. Try again.' } };
  }
}
