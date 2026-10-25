// GSAM admin bridge (GRE-2323): the staff admin API GSAM calls outward. Read-only in this phase.
//   GET /api/admin/v1/health
//   GET /api/admin/v1/<resource>            list: ?customer=&updatedSince=&cursor=&limit= (enquiries: no customer)
//   GET /api/admin/v1/<resource>/<id>       one row
// Every request is signed (lib/admin-bridge-auth.mjs). With GSAM_BRIDGE_KEYS empty every call is refused, so the
// function is safe to deploy before a key exists. A failure returns { error: { code } } only; the detail goes to
// the site log, never to the caller.
import { getPool } from './lib/db.mjs';
import { BridgeAuthError, SCHEME, parseAllowedIps, parseBridgeKeys, verifyBridgeRequest } from './lib/admin-bridge-auth.mjs';
import { BridgeRequestError, RESOURCE_NAMES, asBridgeReader, bridgeGet, bridgeList, listOptions } from './lib/admin-bridge-store.mjs';

const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const PREFIX = '/api/admin/v1/';
const MAX_BODY_BYTES = 64 * 1024;
const STATUS = {
  bad_key: 401, expired: 401, bad_signature: 401, replay: 401,
  capability_denied: 403, ip_denied: 403, not_found: 404, bad_request: 400, unavailable: 503,
};
const fail = (code) => Response.json({ error: { code } }, { status: STATUS[code] || 503, headers: HEADERS });

function route(pathname) {
  if (!pathname.startsWith(PREFIX)) return null;
  const parts = pathname.slice(PREFIX.length).split('/');
  if (parts.length === 1 && parts[0] === 'health') return { resource: 'health' };
  if (!RESOURCE_NAMES.includes(parts[0])) return null;
  if (parts.length === 1) return { resource: parts[0] };
  if (parts.length === 2 && parts[1]) {
    try { return { resource: parts[0], id: decodeURIComponent(parts[1]) }; } catch { return null; }
  }
  return null;
}

export function makeAdminBridgeHandler({
  pool = getPool,
  keys = parseBridgeKeys(process.env.GSAM_BRIDGE_KEYS, console.error),
  allowedIps = parseAllowedIps(process.env.GSAM_BRIDGE_ALLOWED_IPS),
  now = () => Date.now(),
  log = console.error,
} = {}) {
  return async (req) => {
    if (Number(req.headers.get('content-length')) > MAX_BODY_BYTES) return fail('bad_request');
    const body = req.method === 'GET' || req.method === 'HEAD' ? '' : await req.text();
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) return fail('bad_request');
    let call;
    try {
      call = verifyBridgeRequest({ method: req.method, url: req.url, headers: req.headers, body, keys, allowedIps,
        nowSeconds: Math.floor(now() / 1000) });
    } catch (error) {
      if (!(error instanceof BridgeAuthError)) throw error;
      log(`admin-bridge: refused (${error.code}: ${error.message}) kid=${String(req.headers.get('x-gs-bridge-key') || '-').slice(0, 64)}`);
      return fail(error.code);
    }

    const url = new URL(req.url);
    const target = route(url.pathname);
    if (!target) return fail('not_found');
    const db = pool();
    if (!db) return fail('unavailable');

    const audit = { ...call, method: req.method, path: (url.pathname + url.search).slice(0, 2048),
      resource: target.resource, resourceId: target.id ? target.id.slice(0, 80) : null };
    try {
      const out = await asBridgeReader(db, audit, async (client) => {
        if (target.resource === 'health') {
          if ([...url.searchParams.keys()].length) throw new BridgeRequestError('bad_request', 'health takes no parameters');
          return { outcome: 'ok', rowCount: 0, body: { ok: true, kid: call.kid, capability: call.capability,
            serverTime: new Date(now()).toISOString(), schema: SCHEME } };
        }
        if (target.id) {
          if ([...url.searchParams.keys()].length) throw new BridgeRequestError('bad_request', 'get takes no parameters');
          const item = await bridgeGet(client, target.resource, target.id);
          return { outcome: 'ok', rowCount: 1, body: { item } };
        }
        const opts = listOptions(url.searchParams, { customerFilter: target.resource !== 'enquiries' });
        const page = await bridgeList(client, target.resource, opts);
        return { outcome: 'ok', rowCount: page.items.length, body: page };
      });
      return Response.json(out, { headers: HEADERS });
    } catch (error) {
      if (error instanceof BridgeRequestError) return fail(error.code);
      if (error?.code === '23505') { log(`admin-bridge: refused (replay) kid=${call.kid}`); return fail('replay'); }
      if (error?.code === 'GB001') { log(`admin-bridge: refused (expired on the database clock) kid=${call.kid}`); return fail('expired'); }
      log(`admin-bridge: request failed (${error?.code || error?.name || 'error'}) kid=${call.kid}`);
      return fail('unavailable');
    }
  };
}

export default makeAdminBridgeHandler();
export const config = { path: '/api/admin/v1/*' };
