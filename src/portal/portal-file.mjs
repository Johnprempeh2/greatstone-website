// The Netlify function reads the document through this person's claims and returns its private PDF.
import { supabase } from '../lib/supabase.mjs';

export async function portalFileStatus() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in required.');
  const response = await fetch('/api/portal-file', { headers: { authorization: `Bearer ${session.access_token}` } });
  if (!response.ok) throw new Error('File storage status unavailable.');
  return response.json();
}

export async function downloadPortalPdf(documentId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in to download this file.');
  const response = await fetch('/api/portal-file', { method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ document_id: documentId }) });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'The PDF is unavailable. Try again.');
  const url = URL.createObjectURL(await response.blob());
  const name = /filename="([a-z0-9._-]+)"/i.exec(response.headers.get('content-disposition') || '')?.[1] || 'document.pdf';
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
