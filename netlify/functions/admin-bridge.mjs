// GSAM admin bridge (GRE-2323; commerce, write and refund requests GRE-2354): the staff admin API GSAM calls outward.
//   GET /api/admin/v1/health
//   GET /api/admin/v1/<resource>            list: ?customer=&updatedSince=&cursor=&limit= (customer only where a row has one)
//   GET /api/admin/v1/<resource>/<id>       one row (imports/<id> pages its rows with ?limit=&cursor=)
//   GET /api/admin/v1/fx | /payments?from=&to=
//   POST/PATCH/DELETE                       the typed write routes (write key) and refund requests (refund_request
//                                           key), in lib/admin-bridge-write.mjs
// Every request is signed (lib/admin-bridge-auth.mjs). With GSAM_BRIDGE_KEYS empty every call is refused, so the
// function is safe to deploy before a key exists. A failure returns { error: { code } } only (a write conflict adds
// the current row); the detail goes to the site log, never to the caller.
import { getPool } from './lib/db.mjs';
import { BridgeAuthError, SCHEME, parseAllowedIps, parseBridgeKeys, verifyBridgeRequest } from './lib/admin-bridge-auth.mjs';
import { BridgeRequestError, RESOURCE_NAMES, asBridgeReader, bridgeActivityEvents, bridgeFx, bridgeGet, bridgeImport, bridgeList, bridgePayments,
  listOptions, takesCustomer } from './lib/admin-bridge-store.mjs';
import { WRITE_STATUS, asBridgeWriter, runRoute, writeRoute } from './lib/admin-bridge-write.mjs';
import { validateSnapshot } from './lib/deep-dive-client.mjs';

const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const PREFIX = '/api/admin/v1/';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const STATUS = {
  bad_key: 401, expired: 401, bad_signature: 401, replay: 401,
  capability_denied: 403, ip_denied: 403, not_found: 404, bad_request: 400, unavailable: 503, ...WRITE_STATUS,
};
const fail = (code) => Response.json({ error: { code } }, { status: STATUS[code] || 503, headers: HEADERS });

function parts(pathname) {
  if (!pathname.startsWith(PREFIX)) return null;
  try { return pathname.slice(PREFIX.length).split('/').map(decodeURIComponent); } catch { return null; }
}

function readRoute(p) {
  if (p.length === 1 && p[0] === 'health') return { resource: 'health' };
  if (p.length === 1 && p[0] === 'activity-events') return { resource: 'activity-events' };
  if (!RESOURCE_NAMES.includes(p[0])) return null;
  if (p.length === 1) return { resource: p[0] };
  if (p.length === 2 && p[1] && p[0] !== 'fx' && p[0] !== 'payments') return { resource: p[0], id: p[1] };
  return null;
}

/** test or live from the prefix of the site's Stripe key; the key itself never leaves this function. */
export function stripeMode(key = process.env.STRIPE_SECRET_KEY) {
  if (/^(sk|rk)_test_/.test(key || '')) return 'test';
  if (/^(sk|rk)_live_/.test(key || '')) return 'live';
  return 'unset';
}

export function makeAdminBridgeHandler({
  pool = getPool,
  keys = parseBridgeKeys(process.env.GSAM_BRIDGE_KEYS, console.error),
  allowedIps = parseAllowedIps(process.env.GSAM_BRIDGE_ALLOWED_IPS),
  now = () => Date.now(),
  log = console.error,
  stripe = () => stripeMode(),
} = {}) {
  return async (req) => {
    const isSnapshot = req.method === 'PUT' && /^\/api\/admin\/v1\/deep-dive\/tenants\/[0-9a-f-]{36}$/i.test(new URL(req.url).pathname);
    const maxBytes = isSnapshot ? MAX_SNAPSHOT_BYTES : MAX_BODY_BYTES;
    if (Number(req.headers.get('content-length')) > maxBytes) return fail('bad_request');
    const body = req.method === 'GET' || req.method === 'HEAD' ? '' : await req.text();
    if (Buffer.byteLength(body) > maxBytes) return fail('bad_request');
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
    const p = parts(url.pathname);
    if (!p) return fail('not_found');
    const isRead = req.method === 'GET';
    const target = isSnapshot && p.length === 3 && p[0] === 'deep-dive' && p[1] === 'tenants'
      ? { capability: 'write', resource: 'deep-dive', run: async (client, ctx, snapshot) => {
        let checked;
        try { checked = validateSnapshot(p[2], snapshot); } catch { throw new BridgeRequestError('bad_request', 'invalid snapshot'); }
        const result = await client.query(`INSERT INTO deep_dive_snapshots (tenant_id, org_id, snapshot)
          VALUES ($1::uuid, $2::uuid, $3::jsonb)
          ON CONFLICT (tenant_id) DO UPDATE SET snapshot=EXCLUDED.snapshot,synced_at=now()
          WHERE deep_dive_snapshots.org_id=EXCLUDED.org_id`, [p[2], ctx.org, JSON.stringify(checked)]);
        if (result.rowCount !== 1) throw new BridgeRequestError('not_found', 'tenant belongs to another organisation');
        return { status: 200, body: { ok: true, tenantId: p[2] }, rowCount: 1, resourceId: p[2] };
      } }
      : isRead ? readRoute(p) : writeRoute(req.method, p);
    if (!target) return fail('not_found');
    // the key's capability must be the route's: a write key cannot ask for a refund, nor a refund key write
    if (!isRead && target.capability !== call.capability) {
      log(`admin-bridge: refused (capability_denied: ${call.capability} key on a ${target.capability} route) kid=${call.kid}`);
      return fail('capability_denied');
    }
    const db = pool();
    if (!db) return fail('unavailable');

    const audit = { ...call, method: req.method, path: (url.pathname + url.search).slice(0, 2048),
      resource: (isRead ? target.resource : p[0]).slice(0, 40), resourceId: isRead ? target.id?.slice(0, 80) ?? null : p[1]?.slice(0, 80) ?? null };
    try {
      if (!isRead) {
        if ([...url.searchParams.keys()].length) return fail('bad_request');
        const out = await asBridgeWriter(db, { ...audit, idempotencyKey: isSnapshot ? call.nonce : call.idempotencyKey,
          current: target.current }, runRoute(target, body));
        return Response.json(out.body, { status: out.status, headers: HEADERS });
      }
      const out = await asBridgeReader(db, audit, async (client) => {
        if (target.resource === 'health') {
          if ([...url.searchParams.keys()].length) throw new BridgeRequestError('bad_request', 'health takes no parameters');
          return { outcome: 'ok', rowCount: 0, body: { ok: true, kid: call.kid, capability: call.capability,
            serverTime: new Date(now()).toISOString(), schema: SCHEME } };
        }
        if (target.resource === 'fx') {
          if ([...url.searchParams.keys()].length) throw new BridgeRequestError('bad_request', 'fx takes no parameters');
          return { outcome: 'ok', rowCount: 1, body: { item: await bridgeFx(client) } };
        }
        if (target.resource === 'activity-events') {
          const page = await bridgeActivityEvents(client, url.searchParams);
          return { outcome: 'ok', rowCount: page.items.length, body: page };
        }
        if (target.resource === 'payments') {
          const report = await bridgePayments(client, url.searchParams, stripe());
          return { outcome: 'ok', rowCount: report.items.length, body: report };
        }
        if (target.id && target.resource === 'imports') {
          const item = await bridgeImport(client, target.id, url.searchParams);
          return { outcome: 'ok', rowCount: 1 + item.rows.items.length, body: { item } };
        }
        if (target.id) {
          if ([...url.searchParams.keys()].length) throw new BridgeRequestError('bad_request', 'get takes no parameters');
          const item = await bridgeGet(client, target.resource, target.id);
          return { outcome: 'ok', rowCount: 1, body: { item } };
        }
        const opts = listOptions(url.searchParams, { customerFilter: takesCustomer(target.resource) });
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
