// Port: the client side of the interview endpoints (docs/INTERVIEW-ENGINE.md "Endpoints"). The source called
// server actions and read server components; the website calls Netlify Functions with the Better Auth session
// cookie. Everything here is plain fetch, so the pure parts (the SSE frame parser) run under `node --test`.

import { safeRedirect } from './route.mjs';

export const PORTAL_URL = '/api/interview/portal';
export const CHAT_URL = '/api/interview/chat';
export const JOIN_URL = '/api/interview/join';
export const VOICE_START_URL = '/api/interview/voice/start';

/** POST JSON with the session cookie. Returns the Response. */
export function postJson(url, body, init = {}) {
  return fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    ...init,
  });
}

/**
 * Normalise an endpoint reply to `{ data }` or `{ error, status }`. A 401 is `{ error, status: 401,
 * signedOut: true }` so a page can show the sign-in prompt rather than an error.
 */
export async function readEnvelope(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON body; fall through to status handling
  }
  if (res.status === 401) return { error: body?.error || 'Please sign in to continue.', status: 401, signedOut: true };
  // A refusal that carries its own result (enrol answers 400 with { data: { ok: false, message } }) is data.
  if (!res.ok && body && typeof body === 'object' && body.data && !body.error) return { data: body.data, status: res.status };
  if (!res.ok) return { error: body?.error || `Request failed (${res.status})`, status: res.status };
  if (body && typeof body === 'object' && 'error' in body && body.error) return { error: body.error, status: res.status };
  return { data: body && typeof body === 'object' && 'data' in body ? body.data : body };
}

/**
 * One server-action or page-loader call: `POST /api/interview/portal { op, args }` → `{ data }` or `{ error }`.
 * The op's args are the source action's arguments by name (FormData fields become object keys).
 */
export async function portalOp(op, args = {}) {
  try {
    return await readEnvelope(await postJson(PORTAL_URL, { op, args }));
  } catch {
    return { error: 'The connection hiccupped. Please try again.', status: 0 };
  }
}

/** `POST /api/interview/join { op, ... }` → `{ data }` or `{ error }`. */
export async function joinOp(op, body = {}) {
  try {
    return await readEnvelope(await postJson(JOIN_URL, { op, ...body }));
  } catch {
    return { error: 'Something went wrong. Please try again in a moment.', status: 0 };
  }
}

/** The redirect a reply asks for, if it is one the interview may follow (an interview or portal hash). */
export const redirectOf = (data) => (data && typeof data === 'object' ? safeRedirect(data.redirect) : null);

/**
 * Port: `redirect('/interview/x')` / `router.push('/interview/x')` become a hash change. Returns true when it
 * navigated. Setting the same hash fires no hashchange, so the caller's `reload` is used for that case.
 */
export function navigate(hash, reload) {
  if (typeof location === 'undefined' || !hash) return false;
  if (location.hash === hash) {
    if (typeof reload === 'function') reload();
  } else {
    location.hash = hash;
  }
  return true;
}

/** Follow `{ redirect }` from a reply. True when it did. */
export const followRedirect = (data, reload) => {
  const to = redirectOf(data);
  return to ? navigate(to, reload) : false;
};

/**
 * The chat SSE frame parser, lifted out of ChatShell's read loop unchanged so it can be tested: frames are
 * "data: {json}\n\n"; the trailing partial frame is returned as `rest` and carried into the next chunk;
 * a malformed frame is skipped rather than breaking the conversation.
 */
export function parseSseFrames(buffer) {
  const frames = String(buffer).split('\n\n');
  const rest = frames.pop() ?? '';
  const events = [];
  for (const frame of frames) {
    const line = frame.split('\n').find((l) => l.startsWith('data: '));
    if (!line) continue;
    try {
      events.push(JSON.parse(line.slice(6)));
    } catch {
      // Malformed frame: skip rather than break the conversation.
    }
  }
  return { events, rest };
}

/**
 * Read a whole SSE body, calling onEvent for each parsed event as it arrives. `reader` is a
 * ReadableStreamDefaultReader of bytes (res.body.getReader()).
 */
export async function readSse(reader, onEvent) {
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseFrames(buffer);
    buffer = rest;
    for (const e of events) onEvent(e);
  }
}
