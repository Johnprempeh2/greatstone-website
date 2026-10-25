import { getSession } from '../lib/better-auth-client.mjs';

export async function portalStore(op, args = {}) {
  try {
    const session = await getSession();
    if (!session) return { data: null, error: { message: 'Sign in required.' } };
    const response = await fetch('/api/portal-store', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op, args }),
    });
    const body = await response.json();
    return response.ok ? { data: body.data, error: null } : { data: null, error: { message: body.error || 'Portal unavailable.' } };
  } catch {
    return { data: null, error: { message: 'Portal unavailable. Please try again.' } };
  }
}
