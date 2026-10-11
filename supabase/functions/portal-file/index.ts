// Portal PDF download (Supabase Edge Function, Deno). GRE-1257; spec GRE-1227 revision 2, sections 4 and 8.
// A signed-in client (or staff, for preview) asks for the designed PDF of one document and gets a signed URL that
// lasts 60 seconds. The document is read with the caller's own token, so RLS decides who may have it; the stored
// path is signed with the service role only after that. Logic: ../_shared/portal-file.mjs (covered by node --test).
// Secrets: none of its own; SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are set by Supabase.
// Deploy: supabase functions deploy portal-file --no-verify-jwt (it checks the caller itself with getUser()).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handlePortalFile } from '../_shared/portal-file.mjs';

const SUPA_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const admin = createClient(SUPA_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const userClient = createClient(SUPA_URL, ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let signedIn = false;
  if (token && token !== ANON_KEY) {
    try { signedIn = !!(await userClient.auth.getUser(token)).data.user; } catch { signedIn = false; }
  }
  let documentId = '';
  try { documentId = String((await req.json())?.document_id || ''); } catch { /* handled as an incomplete link */ }
  const out = await handlePortalFile({
    signedIn,
    documentId,
    deps: {
      readDocument: (id: string) =>
        userClient.from('portal_documents').select('id, title, version, pdf_path').eq('id', id).maybeSingle(),
      signUrl: (path: string, seconds: number, download: string) =>
        admin.storage.from('portal-files').createSignedUrl(path, seconds, { download }),
    },
  });
  return json(out.body, out.status);
});
