// Supabase client. Works in Vite (import.meta.env) and Node (process.env) so the data layer
// can be unit-run against the live project. The browser uses the ANON key (RLS-gated);
// server/edge code uses the service-role key (never shipped to the client).
import { createClient } from '@supabase/supabase-js';

const ime = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const penv = (typeof process !== 'undefined' && process.env) ? process.env : {};

export const SUPABASE_URL = ime.VITE_SUPABASE_URL || penv.VITE_SUPABASE_URL || '';
const ANON_KEY = ime.VITE_SUPABASE_ANON_KEY || penv.VITE_SUPABASE_ANON_KEY || '';

export function makeClient(key = ANON_KEY, opts = {}) {
  if (!SUPABASE_URL || !key) throw new Error('Supabase env missing (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)');
  return createClient(SUPABASE_URL, key, { auth: { persistSession: true, autoRefreshToken: true }, ...opts });
}

// Default browser client (anon). Server/edge builds a service client explicitly with the secret key.
export const supabase = (SUPABASE_URL && ANON_KEY) ? makeClient(ANON_KEY) : null;
