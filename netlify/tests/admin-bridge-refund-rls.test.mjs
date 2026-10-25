// GSAM admin bridge, refund-request capability under RLS (GRE-2354, migration 049_gsam_bridge_commerce). On a
// throwaway real Postgres (lib/postgres.mjs) it proves: gsam_bridge_refund cannot SELECT or write any table; a request
// over the refundable amount fails, counting the open requests; an agent's decision fails and a person's runs once; a
// refund the Stripe webhook records marks approved requests done, oldest decision first, from totals, so a repeated or
// late webhook gives the same result. No Stripe call exists on this path. Without the Postgres server binaries the
// suite is skipped, and says so.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPostgres, skip } from './lib/postgres.mjs';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const O = { a: 'f3000000-0000-4000-8000-00000000000a', b: 'f3000000-0000-4000-8000-00000000000b',
  c: 'f3000000-0000-4000-8000-00000000000c', other: 'f3000000-0000-4000-8000-0000000000ff' };
const SHA = 'd'.repeat(64);

let db;
let n = 0;
const nonce = () => `r${String(++n).padStart(21, '0')}`;

/** Run sql in one committed transaction as gsam_bridge_refund with an open refund audit row, as the site does. */
function as(sql, { actor = 'agent:ridge', role = 'gsam_bridge_refund', open = true, end = 'COMMIT' } = {}) {
  const k = nonce();
  const opened = open
    ? `SELECT audit_id FROM admin_bridge_begin_refund('stg-refund-1', '${k}', extract(epoch FROM now())::bigint, '${actor}', '9ef9feeb-d13b-450d-b404-89a39e406161', 'POST', '/r', '${k.replace('r', 'i')}', '${SHA}') \\gset
       SELECT set_config('request.jwt.claims', json_build_object('role', 'gsam_bridge', 'cap', 'refund_request', 'org', '${ORG}', 'kid', 'stg-refund-1', 'audit', :'audit_id')::text, true) \\g /dev/null\n`
    : '';
  const r = db.psql(`BEGIN;\nSET LOCAL ROLE ${role};\n${opened}${sql}\n${end};\n`);
  return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() };
}
function ok(sql, opts) {
  const r = as(sql, opts);
  assert.ok(r.ok, `expected success: ${r.err}`);
  return r.out;
}
function refused(sql, pattern, opts) {
  const r = as(sql, { end: 'ROLLBACK', ...opts });
  assert.equal(r.ok, false, `expected refusal, got: ${r.out}`);
  if (pattern) assert.match(r.err, pattern);
}
const owner = (sql) => { const r = db.psql(sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const request = (order, amount, opts) => JSON.parse(ok(`SELECT bridge_request_refund('${order}', ${amount}, 'Charged twice');`, opts)).id;
const decide = (id, decision = 'approved') => ok(`SELECT bridge_refund_decision('${id}', '${decision}', 'gsam-approval-1');`, { actor: 'user:john' });
// what the Stripe webhook does on charge.refunded (stripe-webhook.mjs recordRefund), as service_role
const webhook = (intent, refunded) => owner(`BEGIN; SET LOCAL ROLE service_role;
  UPDATE orders SET refunded_minor = ${refunded}, status = CASE WHEN ${refunded} >= total_minor AND ${refunded} > 0 THEN 'refunded' ELSE status END
   WHERE stripe_payment_intent = '${intent}' AND deleted_at IS NULL; COMMIT;`);
const statuses = (order) => owner(`SELECT string_agg(amount_minor || ':' || status, ' ' ORDER BY created_at, id) FROM refund_requests WHERE order_id = '${order}';`);

before(async () => {
  if (skip) return;
  db = startPostgres('admin-bridge-refund-rls');
  await db.migrate('003');
  owner(`INSERT INTO organisations (id, slug, name, created_at) VALUES ('${ORG}', 'greatstone', 'Greatstone', now() - interval '1 day'),
    ('${OTHER}', 'other', 'Other org', now());`);
  await db.migrate();
  owner(`INSERT INTO orders (id, org_id, reference, status, total_minor, stripe_payment_intent) VALUES
    ('${O.a}', '${ORG}', 'O-A', 'confirmed', 1000, 'pi_a'), ('${O.b}', '${ORG}', 'O-B', 'confirmed', 1000, 'pi_b'),
    ('${O.c}', '${ORG}', 'O-C', 'confirmed', 1000, 'pi_c'), ('${O.other}', '${OTHER}', 'O-X', 'confirmed', 1000, 'pi_x');`);
});

after(() => db?.stop());

test('gsam_bridge_refund has no table grant and cannot SELECT or write any table', { skip }, () => {
  assert.equal(owner(`SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'gsam_bridge_refund';`), '0');
  assert.equal(owner(`SELECT count(*) FROM information_schema.column_privileges WHERE grantee = 'gsam_bridge_refund';`), '0');
  assert.equal(owner(`SELECT rolcanlogin || ' ' || rolbypassrls FROM pg_roles WHERE rolname = 'gsam_bridge_refund';`), 'false false');
  for (const t of ['orders', 'order_items', 'refund_requests', 'customers', 'offerings', 'vendors', 'org_settings', 'users',
    'admin_bridge_audit', 'admin_bridge_idempotency', 'admin_bridge_change', 'admin_bridge_nonce']) {
    refused(`SELECT count(*) FROM ${t};`, /permission denied/);
    refused(`DELETE FROM ${t};`, /permission denied/);
  }
  refused(`UPDATE orders SET refunded_minor = 1000 WHERE id = '${O.a}';`, /permission denied/);
  refused(`INSERT INTO refund_requests (org_id, order_id, amount_minor, currency, reason, requested_by)
    VALUES ('${ORG}', '${O.a}', 1, 'GBP', 'x', 'agent:x');`, /permission denied/);
  // nor may it call the write functions, or the write role call the refund ones
  refused(`SELECT bridge_convert_quote('${O.a}');`, /permission denied for function/);
  refused(`SELECT bridge_request_refund('${O.a}', 1, 'x');`, /permission denied for function/, { role: 'gsam_bridge_write', open: false });
});

test('a request records one row and moves no money; one over the refundable amount fails', { skip }, () => {
  const out = JSON.parse(ok(`SELECT bridge_request_refund('${O.a}', 600, 'Charged twice');`));
  assert.deepEqual({ status: out.status, amount: out.amount_minor, by: out.requested_by, run: out.gsam_run_id, currency: out.currency, org: out.org_id },
    { status: 'requested', amount: 600, by: 'agent:ridge', run: '9ef9feeb-d13b-450d-b404-89a39e406161', currency: 'GBP', org: undefined });
  assert.equal(owner(`SELECT refunded_minor || ' ' || status FROM orders WHERE id = '${O.a}';`), '0 confirmed');
  // 1000 total, 600 already requested: 401 does not fit, 400 does
  refused(`SELECT bridge_request_refund('${O.a}', 401, 'More');`, /more than the order has left to refund/);
  request(O.a, 400);
  refused(`SELECT bridge_request_refund('${O.a}', 1, 'More');`, /more than the order has left/);
  refused(`SELECT bridge_request_refund('${O.a}', 0, 'Zero');`, /above zero/);
  refused(`SELECT bridge_request_refund('${O.a}', 1, '');`, /reason/);
  refused(`SELECT bridge_request_refund('${O.other}', 1, 'Other org');`, /order not found/);
  // with no open refund audit row there is no actor and no org
  refused(`SELECT bridge_request_refund('${O.b}', 1, 'x');`, /no open bridge audit row/, { open: false });
});

test('only a person decides, once, and only approved or rejected', { skip }, () => {
  const id = request(O.b, 300);
  refused(`SELECT bridge_refund_decision('${id}', 'approved', 'x');`, /people only/);
  refused(`SELECT bridge_refund_decision('${id}', 'approved', 'x');`, /people only/, { actor: 'system:pull' });
  refused(`SELECT bridge_refund_decision('${id}', 'done', 'x');`, /approved or rejected/, { actor: 'user:john' });
  const out = JSON.parse(decide(id, 'rejected'));
  assert.deepEqual([out.status, out.decided_by, out.gsam_approval_ref], ['rejected', 'user:john', 'gsam-approval-1']);
  refused(`SELECT bridge_refund_decision('${id}', 'approved', 'x');`, /already rejected/, { actor: 'user:john' });
  // a rejected request no longer counts toward the refundable amount
  request(O.b, 1000);
});

test('a refund the webhook records marks approved requests done, oldest decision first, from totals', { skip }, () => {
  const big = request(O.c, 500);
  const small = request(O.c, 200);
  const later = request(O.c, 100);
  decide(big);
  decide(small);
  decide(later);
  // 300 refunded: the oldest decision (500) does not fit, so nothing jumps it
  webhook('pi_c', 300);
  assert.equal(statuses(O.c), '500:approved 200:approved 100:approved');
  // 700: 500 then 200 fit; 100 is left approved (partly covered requests stay approved)
  webhook('pi_c', 700);
  assert.equal(statuses(O.c), '500:done 200:done 100:approved');
  // the same webhook again changes nothing
  webhook('pi_c', 700);
  assert.equal(statuses(O.c), '500:done 200:done 100:approved');
  webhook('pi_c', 800);
  assert.equal(statuses(O.c), '500:done 200:done 100:done');
  // a refund made with no request leaves the rest unallocated
  webhook('pi_c', 1000);
  assert.equal(owner(`SELECT o.refunded_minor - sum(r.amount_minor) FROM orders o JOIN refund_requests r ON r.order_id = o.id AND r.status = 'done'
    WHERE o.id = '${O.c}' GROUP BY o.refunded_minor;`), '200');
  assert.equal(owner(`SELECT status FROM orders WHERE id = '${O.c}';`), 'refunded');
});

test('approving after the refund already happened in Stripe marks the request done at once', { skip }, () => {
  owner(`INSERT INTO orders (id, org_id, reference, status, total_minor, stripe_payment_intent)
    VALUES ('f3000000-0000-4000-8000-0000000000dd', '${ORG}', 'O-D', 'confirmed', 1000, 'pi_d');`);
  webhook('pi_d', 250);
  const id = request('f3000000-0000-4000-8000-0000000000dd', 250);
  assert.equal(JSON.parse(decide(id)).status, 'done');
});
