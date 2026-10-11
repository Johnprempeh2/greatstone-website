// The designed PDF of a portal document (GRE-1257). The portal-file edge function checks the document with this
// person's own token (RLS: clients get their own company's published documents, staff their organisation's) and
// returns a signed link that lasts a minute. The link is a download, so the page stays where it is. Used by the
// client reader and by staff "Preview as the client". Throws on failure; the caller says what to do next.
import { supabase } from '../lib/supabase.mjs';

export async function downloadPortalPdf(documentId) {
  const { data, error } = await supabase.functions.invoke('portal-file', { body: { document_id: documentId } });
  if (error || !data || !data.url) throw error || new Error('no link');
  window.location.assign(data.url);
}
