import { getSession } from '../lib/better-auth-client.mjs';
export async function deepdiveRequest(op, args = {}, path = '/api/deepdive-plan') {
  if (!await getSession()) return null;
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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

export async function deepdiveStateRequest(op, args = {}) {
  const data = await deepdiveRequest(op, args, '/api/deepdive-state');
  if (data === null) throw new Error('Record service unavailable. Sign in and try again.');
  return data;
}
