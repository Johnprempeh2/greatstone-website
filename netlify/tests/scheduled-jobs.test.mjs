import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';
import { asWorker } from '../functions/lib/worker-db.mjs';
import { makeInquiryIpPurge, PURGE_SQL } from '../functions/inquiry-ip-purge.mjs';
import { makePortalReceiptWorker } from '../functions/portal-receipt-worker.mjs';

function database(rows = []) {
  const calls = [];
  const pool = { connect: async () => ({
    query: async (sql, args) => { calls.push([sql, args]); return { rows: rows.shift() || [] }; },
    release: () => calls.push(['release']),
  }) };
  return { pool, calls };
}

test('scheduled IP purge runs only after a transaction-scoped worker role', async () => {
  const { pool, calls } = database();
  assert.equal(await makeInquiryIpPurge({ pool: () => pool, log: () => {} })(), 0);
  assert.deepEqual(calls.map(([sql]) => sql), ['BEGIN', 'SET LOCAL ROLE service_role',
    "SELECT set_config('request.jwt.claims', $1, true)", PURGE_SQL, 'COMMIT', 'release']);
  assert.equal(JSON.parse(calls[2][1][0]).email_verified, false);
});

test('receipt worker claims due jobs through the scoped worker role', async () => {
  const { pool, calls } = database();
  const result = await makePortalReceiptWorker({ pool: () => pool, env: {}, log: () => {} })();
  assert.deepEqual(result, { claimed: 0, sent: 0, retry: 0, failed: 0, alertFailed: 0 });
  assert.deepEqual(calls.map(([sql]) => sql), ['BEGIN', 'SET LOCAL ROLE service_role',
    "SELECT set_config('request.jwt.claims', $1, true)", 'SELECT * FROM portal_claim_receipt_jobs($1)', 'COMMIT', 'release']);
  assert.deepEqual(calls[3][1], [25]);
});

test('worker database access rolls back and releases its connection on failure', async () => {
  const { pool, calls } = database();
  await assert.rejects(asWorker(pool, () => { throw new Error('failed'); }), /failed/);
  assert.deepEqual(calls.map(([sql]) => sql), ['BEGIN', 'SET LOCAL ROLE service_role',
    "SELECT set_config('request.jwt.claims', $1, true)", 'ROLLBACK', 'release']);
});

test('both schedules run against the migrated schema as the worker role', { skip }, async () => {
  const db = startPostgres('schedules');
  let pool;
  try {
    await db.migrate();
    pool = new pg.Pool({ connectionString: db.url, max: 1 });
    const seed = db.psql(`INSERT INTO organisations(id,slug,name) VALUES ('11111111-1111-4111-8111-111111111111','purge','Test org');
      INSERT INTO service_inquiries(org_id,contact_email,message,ip,created_at) VALUES
      ('11111111-1111-4111-8111-111111111111','old@example.test','x','192.0.2.1',now() - interval '31 days'),
      ('11111111-1111-4111-8111-111111111111','new@example.test','x','192.0.2.2',now() - interval '1 day');
      -- the insert trigger has just purged the old row; put its IP back, as after a quiet month
      UPDATE service_inquiries SET ip = '192.0.2.1' WHERE contact_email = 'old@example.test';`);
    assert.equal(seed.status, 0, seed.stderr);
    assert.equal(await makeInquiryIpPurge({ pool: () => pool, log: () => {} })(), 1);
    assert.equal(db.psql(`SELECT string_agg(coalesce(ip::text,'none'), ',' ORDER BY created_at) FROM service_inquiries`).stdout.trim(),
      'none,192.0.2.2');
    assert.deepEqual(await makePortalReceiptWorker({ pool: () => pool, env: {}, log: () => {} })(),
      { claimed: 0, sent: 0, retry: 0, failed: 0, alertFailed: 0 });
  } finally {
    await pool?.end();
    db.stop();
  }
});
