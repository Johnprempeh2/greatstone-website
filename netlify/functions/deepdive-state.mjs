import { userFromRequest, authIdentity } from './lib/better-auth.mjs';
import { getPool } from './lib/db.mjs';
import { asStaff } from './lib/staff-store.mjs';
import { deepdiveState } from './lib/deepdive-state.mjs';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const FILE = /^a:[0-9a-f]{12}$/;
const OPS = new Set(['load', 'items', 'release', 'replace', 'findings', 'attach', 'detach']);
const array = (value, max) => Array.isArray(value) && value.length <= max;

function valid(op, args) {
  if (!OPS.has(op) || !args || typeof args !== 'object' || Array.isArray(args) || !SLUG.test(args.slug || '')) return false;
  if (op === 'items') return array(args.items, 1000) && array(args.entries, 1000) &&
    args.items.every((r) => typeof r.item_id === 'string' && r.item_id.length <= 200 &&
      ['open', 'active', 'done', 'blocked'].includes(r.status) && ['internal', 'shared'].includes(r.visibility) && typeof r.note === 'string');
  if (op === 'release') return typeof args.id === 'string' && array(args.entries, 1);
  if (op === 'replace') return typeof args.release === 'boolean' && array(args.keepIds, 5000) && array(args.entries, 1000);
  if (op === 'findings') return array(args.findings, 4000) && array(args.removedIds, 4000) && array(args.entries, 1000) &&
    args.findings.every((f) => typeof f.id === 'string' && typeof f.text === 'string');
  if (op === 'attach') return FILE.test(args.file?.id || '') && typeof args.file.label === 'string' &&
    args.file.label.trim().length > 0 && array(args.file.attachedTo, 5000) && array(args.entries, 1);
  if (op === 'detach') return FILE.test(args.id || '') && typeof args.last === 'boolean' && array(args.ties, 5000) && array(args.entries, 1);
  return true;
}

export function makeDeepdiveStateHandler({ pool = getPool, query = deepdiveState, verify, log = console.error } = {}) {
  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
    const { op, args = {} } = body || {};
    if (JSON.stringify(body).length > 2_000_000 || !valid(op, args)) return json({ error: 'Invalid record request.' }, 400);
    try {
      const user = await userFromRequest(req, verify);
      if (!user?.id || !UUID.test(user.id)) return json({ error: 'Session expired. Sign in again.' }, 401);
      const db = pool();
      if (!db) return json({ error: 'Record service unavailable.' }, 503);
      const data = await asStaff(db, authIdentity(user),
        (client) => query(client, op, args));
      if (data?.forbidden) return json({ error: 'Record access denied.' }, 403);
      return json({ data });
    } catch (error) {
      if (error instanceof RangeError || ['22P02', '23514'].includes(error?.code)) return json({ error: 'Invalid record request.' }, 400);
      if (error?.code === '42501') return json({ error: 'Record access denied.' }, 403);
      log('deepdive-state: request failed (' + (error?.code || error?.name || 'error') + ')');
      return json({ error: 'Record service unavailable. Please try again.' }, 503);
    }
  };
}

export default makeDeepdiveStateHandler();
export const config = { path: '/api/deepdive-state' };
