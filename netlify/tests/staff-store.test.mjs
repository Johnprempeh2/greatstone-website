import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { makeStaffStoreHandler } from '../functions/staff-store.mjs';
import { asStaff, staffStore } from '../functions/lib/staff-store.mjs';
import { startPostgres, skip, OWNER } from './lib/postgres.mjs';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const WHO = { id: '00000000-0000-4000-8000-0000000000a1', email: 'staff-a@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' };
const OTHER = { id: '00000000-0000-4000-8000-0000000000b1', email: 'staff-b@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' };
const BUYER = { id: '00000000-0000-4000-8000-0000000000c1', email: 'buyer@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' };

const request = (body, token = 'staff') => new Request('https://example.test/api/staff-store', {
  method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('staff function validates session, operation and missing database', async () => {
  const noDb = makeStaffStoreHandler({ pool: () => null, verify: async (token) => token === 'staff' ? WHO : null });
  assert.equal((await noDb(new Request('https://example.test/api/staff-store'))).status, 405);
  assert.equal((await noDb(request({ kind: 'select', table: 'orders' }, 'bad'))).status, 401);
  assert.equal((await noDb(request({ kind: 'select', table: 'orders' }))).status, 503);
  await assert.rejects(staffStore({ query: () => { throw new Error('query should not run'); } }, { kind: 'select', table: 'pg_user', filters: [] }), /Invalid operation/);
});

test('transaction applies verified identity locally and rolls back a failed request', async () => {
  const commands = [];
  const client = { query: async (sql, values) => { commands.push([sql, values]); return { rows: [] }; }, release: () => commands.push(['release']) };
  await asStaff({ connect: async () => client }, { id: WHO.id, email: WHO.email, email_verified: true }, async () => null);
  assert.deepEqual(commands.map(([sql]) => sql), ['BEGIN', 'SET LOCAL ROLE authenticated', "SELECT set_config('request.jwt.claims', $1, true)", 'COMMIT', 'release']);
  assert.deepEqual(JSON.parse(commands[2][1][0]), { role: 'authenticated', sub: WHO.id, email: WHO.email, email_verified: true });
  commands.length = 0;
  await assert.rejects(asStaff({ connect: async () => client }, { id: WHO.id }, async () => { throw new Error('fail'); }), /fail/);
  assert.deepEqual(commands.slice(-2).map(([sql]) => sql), ['ROLLBACK', 'release']);
});

test('staff catalogue, client and order requests obey migrated RLS', { skip }, async () => {
  const db = startPostgres('staff-store');
  let pool;
  try {
    await db.migrate();
    const seed = db.psql(`INSERT INTO organisations(id,slug,name) VALUES
      ('${ORG_A}','test-a','Test A'), ('${ORG_B}','test-b','Test B');
      INSERT INTO users(org_id,email,role,auth_subject) VALUES
      ('${ORG_A}','${WHO.email}','admin','${WHO.id}'),
      ('${ORG_B}','${OTHER.email}','admin','${OTHER.id}');
      INSERT INTO vendors(org_id,slug,name) VALUES
      ('${ORG_A}','test-vendor-a','Vendor A'), ('${ORG_B}','test-vendor-b','Vendor B');
      INSERT INTO customers(org_id,slug,name) VALUES
      ('${ORG_A}','test-customer-a','Customer A'), ('${ORG_B}','test-customer-b','Customer B');
      INSERT INTO orders(org_id,reference,total_minor) VALUES
      ('${ORG_A}','TEST-A',100), ('${ORG_B}','TEST-B',200);
      INSERT INTO order_items(org_id,order_id,offering_name,qty,unit_price_minor,line_total_minor)
      SELECT org_id,id,'Test Item',1,100,100 FROM orders;
      INSERT INTO front_door_leads(org_id,industry,company_name,agent_package) VALUES
      ('${ORG_A}','testing','Fixture A','{"COMPANY.md":"fixture"}'::jsonb),
      ('${ORG_B}','testing','Fixture B',NULL);
      INSERT INTO service_inquiries(org_id,contact_name) VALUES
      ('${ORG_A}','Fixture A'), ('${ORG_B}','Fixture B');`);
    assert.equal(seed.status, 0, seed.stderr);
    pool = new pg.Pool({ connectionString: db.url, max: 1 });
    const handler = makeStaffStoreHandler({ pool: () => pool, verify: async (token) => token === 'staff' ? WHO : token === 'other' ? OTHER : BUYER });
    const call = async (body, token = 'staff') => {
      const response = await handler(request({ ...body, filters: body.filters || [] }, token));
      return { status: response.status, ...await response.json() };
    };
    assert.deepEqual((await call({ kind: 'select', table: 'vendors', columns: 'id,name' })).data.map((row) => row.name), ['Vendor A']);
    assert.deepEqual((await call({ kind: 'select', table: 'customers', columns: 'name' })).data.map((row) => row.name), ['Customer A']);
    const ownOrders = (await call({ kind: 'select', table: 'orders', columns: 'reference,total_minor,order_items(id,qty)' })).data;
    assert.deepEqual(ownOrders.map((row) => row.reference), ['TEST-A']);
    assert.equal(ownOrders[0].order_items.length, 1);
    assert.equal((await call({ kind: 'select', table: 'orders', columns: 'id' }, 'buyer')).status, 403);
    assert.deepEqual((await call({ kind: 'select', table: 'orders', columns: 'reference' }, 'other')).data.map((row) => row.reference), ['TEST-B']);
    const leads = (await call({ kind: 'select', table: 'front_door_leads', columns: 'id,company_name,status' })).data;
    assert.deepEqual(leads.map((row) => row.company_name), ['Fixture A']);
    assert.deepEqual((await call({ kind: 'select', table: 'front_door_leads', columns: 'agent_package', filters: [{ column: 'id', op: 'eq', value: leads[0].id }], maybeSingle: true })).data.agent_package, { 'COMPANY.md': 'fixture' });
    assert.equal((await call({ kind: 'update', table: 'front_door_leads', values: { status: 'contacted', last_contacted_at: new Date().toISOString() }, filters: [{ column: 'id', op: 'eq', value: leads[0].id }] })).status, 200);
    assert.deepEqual((await call({ kind: 'select', table: 'front_door_leads', columns: 'status' })).data.map((row) => row.status), ['contacted']);
    assert.equal((await call({ kind: 'delete', table: 'front_door_leads', filters: [{ column: 'id', op: 'eq', value: leads[0].id }] })).status, 200);
    assert.deepEqual((await call({ kind: 'select', table: 'front_door_leads', columns: 'id' })).data, []);
    assert.equal((await call({ kind: 'select', table: 'front_door_leads', columns: 'id' }, 'other')).data.length, 1);
    const inquiry = (await call({ kind: 'select', table: 'service_inquiries', columns: 'id,status' })).data;
    assert.equal(inquiry.length, 1);
    assert.equal((await call({ kind: 'update', table: 'service_inquiries', values: { status: 'closed' }, filters: [{ column: 'id', op: 'eq', value: inquiry[0].id }] })).status, 200);
    assert.deepEqual((await call({ kind: 'select', table: 'service_inquiries', columns: 'status' })).data.map((row) => row.status), ['closed']);
    assert.equal((await call({ kind: 'update', table: 'service_inquiries', values: { contact_email: 'changed@example.test' }, filters: [{ column: 'id', op: 'eq', value: inquiry[0].id }] })).status, 400);
    assert.equal((await call({ kind: 'delete', table: 'service_inquiries', filters: [{ column: 'id', op: 'eq', value: inquiry[0].id }] })).status, 400);
    assert.equal((await call({ kind: 'update', table: 'orders', values: { status: 'fulfilled' }, filters: [{ column: 'reference', op: 'eq', value: 'TEST-B' }] })).data, null);
    assert.deepEqual((await call({ kind: 'select', table: 'orders', columns: 'status' })).data.map((row) => row.status), ['pending']);
    assert.equal((await call({ kind: 'select', table: 'orders', columns: 'id;drop table orders' })).status, 400);
    assert.equal((await call({ kind: 'update', table: 'orders', values: { status: 'cancelled' } })).status, 400);
    const selections = [
      ['users', 'id,email,full_name,role,org_id'],
      ['org_settings', 'usd_to_gbp_display_rate,row_version,updated_at'],
      ['offerings', 'id,slug,name,status,featured,short_description,from_price_minor,type,vendor:vendors(name)'],
      ['offering_variants', 'id,offering_id,sku,name,license_type,billing_period,base_price_minor,currency,offering:offerings(slug,name,status,featured,vendor:vendors(name),category:categories(name))'],
      ['customers', 'id,name,slug,domain,created_at,tier:customer_tiers(name)'],
      ['customer_users', 'id,email,full_name,is_primary,role'],
      ['engagements', '*'],
      ['member_invite_requests', 'id,full_name,email,role,status,note,created_at'],
      ['licence_keys', 'id,offering_name,variant_name,licence_key,seats,status,delivered_at,expires_at,download_url,file_path,file_name,order:orders(reference)'],
      ['quotes', 'id,reference,status,contact_company,contact_name,contact_email,contact_phone,po_reference,po_document_path,po_document_name,message,indicative_total_minor,quoted_total_minor,valid_until,currency,created_at,orders(id,invoice_number),quote_items(id,offering_name,variant_name,qty,list_price_minor,captured_price_minor)'],
      ['pricing_rules', 'id,name,active,scope_type,adjustment_type,adjustment_value,adjustment_value_pct,currency,label,pricing_rule_targets(vendor_id,category_id)'],
      ['fx_rate_history', 'old_rate,new_rate,changed_at'],
    ];
    for (const [table, columns] of selections) {
      const result = await call({ kind: 'select', table, columns });
      assert.equal(result.status, 200, `${table}: ${result.error || 'unknown error'}`);
    }
    const added = await call({ kind: 'insert', table: 'vendors', values: { org_id: ORG_A, slug: 'new-vendor', name: 'New Vendor' }, columns: 'id,name', single: true });
    assert.equal(added.status, 200, added.error);
    assert.equal(added.data.name, 'New Vendor');
    const importResult = await call({ kind: 'rpc', name: 'import_skus', args: { p_creates: [], p_updates: [] } });
    assert.equal(importResult.status, 200, importResult.error);
    assert.equal(importResult.data.created, 0);
    const connection = await pool.connect();
    try {
      const { rows } = await connection.query('SELECT current_user AS role, auth.uid() AS subject');
      assert.deepEqual(rows[0], { role: OWNER, subject: null });
    } finally { connection.release(); }
  } finally { await pool?.end(); db.stop(); }
});
