import { supabase } from '../lib/supabase.mjs';

// Auth stays with Supabase; record data goes only through the Netlify RLS bridge.
export async function deepdiveRequest(op, args = {}) {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const response = await fetch('/api/deepdive-plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ op, args }),
  });
  if (!/\bjson\b/i.test(response.headers.get('content-type') || '')) return null;
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || 'Record service unavailable. Please try again.');
    error.status = response.status;
    error.conflict = response.status === 409;
    throw error;
  }
  return body.data;
}
