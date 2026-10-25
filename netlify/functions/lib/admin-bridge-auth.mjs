// GSAM admin bridge, request signing (GRE-2323). GSAM signs each request with an Ed25519 private key it keeps as a
// company secret; the site holds only the public keys, in GSAM_BRIDGE_KEYS, so a leak of the site's settings cannot
// forge a request. The canonical string and the check order are the contract in contracts/gs-bridge-v1/, the same
// file in both repos: change it in both pull requests or neither. Reads sign gs-bridge-v1; write and refund_request
// keys sign gs-bridge-v2, which adds the idempotency key as a last line (GRE-2354).
import { createHash, createPublicKey, verify } from 'node:crypto';

export const SCHEME = 'gs-bridge-v1';
export const SCHEME_V2 = 'gs-bridge-v2';
export const WINDOW_SECONDS = 60;
// Capability comes from the key only: a read key cannot write, and a write key cannot GET.
export const CAPABILITY_METHODS = { read: ['GET'], write: ['POST', 'PATCH', 'DELETE', 'PUT'], refund_request: ['POST'] };
const CAPABILITY_SCHEME = { read: SCHEME, write: SCHEME_V2, refund_request: SCHEME_V2 };
const CAPABILITIES = new Set(['read', 'write', 'refund_request']);

const KID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const NONCE = /^[A-Za-z0-9_-]{22}$/; // 128 bits, base64url, no padding
// system: GSAM's own scheduled reads (the enquiry pull), with no person or agent behind them
const ACTOR = /^(agent|user|system):[A-Za-z0-9_-]{1,64}$/;
const RUN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;

export class BridgeAuthError extends Error {
  constructor(code, detail) {
    super(detail || code);
    this.code = code;
  }
}

const sha256hex = (bytes) => createHash('sha256').update(bytes).digest('hex');
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

/** The query string, sorted by name then value, each part percent-encoded. Empty when there is none. */
export function canonicalQuery(searchParams) {
  const pairs = [...searchParams].sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0));
  return pairs.map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
}

/** The string GSAM signs: one field per line, joined by "\n". v2 adds the idempotency key as the last line. */
export function canonicalString({ scheme = SCHEME, method, host, path, query = '', time, nonce, actor, run, bodySha256,
  idempotencyKey }) {
  const lines = [scheme, method.toUpperCase(), host.toLowerCase(), query ? `${path}?${query}` : path, String(time), nonce,
    actor, run || '-', bodySha256];
  return (scheme === SCHEME_V2 ? [...lines, idempotencyKey] : lines).join('\n');
}

/**
 * GSAM_BRIDGE_KEYS: a JSON list of { kid, capability, publicKey, notAfter? }. publicKey is the raw 32-byte Ed25519
 * key, base64url. An entry that does not parse is left out and named in the log, so one typo cannot open a hole.
 */
export function parseBridgeKeys(raw, log = () => {}) {
  if (!raw) return new Map();
  let list;
  try { list = JSON.parse(raw); } catch { log('admin-bridge: GSAM_BRIDGE_KEYS is not JSON; no key accepted'); return new Map(); }
  if (!Array.isArray(list)) { log('admin-bridge: GSAM_BRIDGE_KEYS is not a list; no key accepted'); return new Map(); }
  const keys = new Map();
  for (const entry of list) {
    const kid = entry?.kid;
    try {
      if (typeof kid !== 'string' || !KID.test(kid)) throw new Error('bad kid');
      if (!CAPABILITIES.has(entry.capability)) throw new Error('bad capability');
      if (typeof entry.publicKey !== 'string' || !B64URL.test(entry.publicKey)) throw new Error('bad publicKey');
      const notAfter = entry.notAfter == null ? null : Date.parse(entry.notAfter);
      if (Number.isNaN(notAfter)) throw new Error('bad notAfter');
      const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: entry.publicKey }, format: 'jwk' });
      if (keys.has(kid)) throw new Error('duplicate kid');
      keys.set(kid, { kid, capability: entry.capability, key, notAfter });
    } catch (error) {
      log(`admin-bridge: GSAM_BRIDGE_KEYS entry ${typeof kid === 'string' ? kid.slice(0, 64) : '?'} ignored (${error.message})`);
    }
  }
  return keys;
}

/** Exact client IPs from GSAM_BRIDGE_ALLOWED_IPS, comma-separated. Empty means no allow-list. */
export function parseAllowedIps(raw) {
  return new Set(String(raw || '').split(',').map((s) => s.trim()).filter(Boolean));
}

/**
 * Checks a request in the contract's order and returns { kid, capability, nonce, time, actor, run, bodySha256,
 * idempotencyKey } or throws a BridgeAuthError. The nonce (and a v2 call's idempotency key) is claimed later, in the
 * database transaction (admin_bridge_begin*), together with a second window check on the database clock.
 */
export function verifyBridgeRequest({ method, url, headers, body = '', keys, allowedIps, nowSeconds }) {
  const h = (name) => headers.get(name);
  const kid = h('x-gs-bridge-key');
  const entry = kid ? keys.get(kid) : null;
  if (!entry) throw new BridgeAuthError('bad_key', 'unknown kid');
  if (entry.notAfter != null && nowSeconds * 1000 > entry.notAfter) throw new BridgeAuthError('bad_key', 'key past notAfter');
  const allowed = CAPABILITY_METHODS[entry.capability] || [];
  if (!allowed.includes(method.toUpperCase())) throw new BridgeAuthError('capability_denied', `${entry.capability} cannot ${method}`);

  const timeRaw = h('x-gs-bridge-time');
  const time = /^\d{1,12}$/.test(timeRaw || '') ? Number(timeRaw) : NaN;
  if (!Number.isFinite(time) || Math.abs(nowSeconds - time) > WINDOW_SECONDS) throw new BridgeAuthError('expired', 'time outside the window');

  const nonce = h('x-gs-bridge-nonce') || '';
  const actor = h('x-gs-bridge-actor') || '';
  const run = h('x-gs-bridge-run') || null;
  const signature = h('x-gs-bridge-signature') || '';
  // GRE-2439's whole-snapshot PUT uses the original v1 signature, without a write idempotency header.
  // Existing commerce writes retain v2. The route itself is checked again by admin-bridge.mjs.
  const deepDivePut = entry.capability === 'write' && method.toUpperCase() === 'PUT' &&
    /^\/api\/admin\/v1\/deep-dive\/tenants\/[0-9a-f-]{36}$/i.test(new URL(url).pathname);
  const scheme = deepDivePut ? SCHEME : CAPABILITY_SCHEME[entry.capability];
  // the key of one logical write: the same on every retry, so a retry after a timeout cannot write twice
  const idempotencyKey = scheme === SCHEME_V2 ? h('x-gs-bridge-idempotency-key') || '' : null;
  if (!NONCE.test(nonce) || !ACTOR.test(actor) || (run !== null && !RUN.test(run)) || !B64URL.test(signature)
    || (idempotencyKey !== null && !NONCE.test(idempotencyKey))) {
    throw new BridgeAuthError('bad_signature', 'malformed bridge headers');
  }
  const u = new URL(url);
  const bodySha256 = sha256hex(typeof body === 'string' ? Buffer.from(body, 'utf8') : body);
  const message = canonicalString({
    scheme, method, host: u.host, path: u.pathname, query: canonicalQuery(u.searchParams), time, nonce, actor, run,
    bodySha256, idempotencyKey,
  });
  const sig = Buffer.from(signature, 'base64url');
  if (sig.length !== 64 || !verify(null, Buffer.from(message, 'utf8'), entry.key, sig)) {
    throw new BridgeAuthError('bad_signature', 'signature does not verify');
  }

  if (allowedIps && allowedIps.size) {
    const ip = h('x-nf-client-connection-ip') || '';
    if (!allowedIps.has(ip)) throw new BridgeAuthError('ip_denied', 'client ip not on GSAM_BRIDGE_ALLOWED_IPS');
  }
  return { kid, capability: entry.capability, nonce, time, actor, run, bodySha256, idempotencyKey };
}
