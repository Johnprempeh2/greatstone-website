import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const CUSTOMER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECOND = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FOREIGN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STAFF = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
let db, pool;
const query = (sql, values = []) => pool.query(sql, values);

async function as(role, sql, values = [], staff = false) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    if (staff) await client.query("SELECT set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ role: 'authenticated', sub: STAFF })]);
    const result = await client.query(sql, values);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
const events = async (subject) => (await query(
  'SELECT organisation_id,kind,subject_id,label,occurred_at FROM client_activity_outbox WHERE subject_id=$1',
  [subject])).rows;

before(async () => {
  if (skip) return;
  db = startPostgres('enquiry-client-link');
  await db.migrate();
  pool = new pg.Pool({ connectionString: db.url });
  await query("INSERT INTO organisations(id,slug,name) VALUES ($1,'site','Site'),($2,'other','Other')", [ORG, OTHER]);
  await query("INSERT INTO customers(id,org_id,slug,name) VALUES ($1,$2,'first','First'),($3,$2,'second','Second'),($4,$5,'foreign','Foreign')",
    [CUSTOMER, ORG, SECOND, FOREIGN, OTHER]);
  await query("INSERT INTO users(org_id,email,role,auth_subject) VALUES ($1,'staff@example.test','admin',$2)", [ORG, STAFF]);
});
after(async () => { await pool?.end(); db?.stop(); });

test('anonymous rows emit only on first staff link, at the original contact time', { skip }, async () => {
  const enquiryTime = '2026-01-01T12:00:00Z';
  const contactTime = '2026-01-02T13:00:00Z';
  const inquiry = (await query("INSERT INTO service_inquiries(org_id,contact_name,contact_email,message,created_at) VALUES ($1,'Private','private@example.test','Private message',$2) RETURNING id", [ORG, enquiryTime])).rows[0].id;
  const lead = (await query("INSERT INTO front_door_leads(org_id,industry,company_name,contact_at,created_at) VALUES ($1,'Private industry','Private company',$2,$3) RETURNING id", [ORG, contactTime, enquiryTime])).rows[0].id;
  const noContact = (await query("INSERT INTO front_door_leads(org_id,industry,company_name,created_at) VALUES ($1,'Private industry','Private company',$2) RETURNING id", [ORG, enquiryTime])).rows[0].id;
  for (const [table, id] of [['service_inquiries', inquiry], ['front_door_leads', lead], ['front_door_leads', noContact]]) {
    assert.deepEqual(await events(`${table === 'service_inquiries' ? 'service_inquiry' : 'front_door_lead'}:${id}`), []);
    await as('authenticated', `UPDATE ${table} SET customer_id=$1 WHERE id=$2`, [CUSTOMER, id], true);
  }
  for (const [prefix, id, expected] of [['service_inquiry', inquiry, enquiryTime], ['front_door_lead', lead, contactTime], ['front_door_lead', noContact, enquiryTime]]) {
    const rows = await events(`${prefix}:${id}`);
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].organisation_id, rows[0].kind, rows[0].label], [CUSTOMER, 'enquiry.received', 'Enquiry received']);
    assert.equal(rows[0].occurred_at.toISOString(), new Date(expected).toISOString());
    assert(!JSON.stringify(rows).includes('Private'));
  }
  await as('authenticated', 'UPDATE service_inquiries SET customer_id=$1,status=$2 WHERE id=$3', [CUSTOMER, 'contacted', inquiry], true);
  await as('authenticated', "UPDATE service_inquiries SET status='closed' WHERE id=$1", [inquiry], true);
  assert.equal((await events(`service_inquiry:${inquiry}`)).length, 1);
  await assert.rejects(as('authenticated', 'UPDATE service_inquiries SET customer_id=$1 WHERE id=$2', [SECOND, inquiry], true), /cannot be changed/);
  await assert.rejects(as('authenticated', 'UPDATE service_inquiries SET customer_id=NULL WHERE id=$1', [inquiry], true), /cannot be changed/);
  assert.equal((await events(`service_inquiry:${inquiry}`)).length, 1);
  await assert.rejects(as('authenticated', 'UPDATE front_door_leads SET customer_id=$1 WHERE id=$2', [SECOND, lead], true), /cannot be changed/);
  await assert.rejects(as('authenticated', 'UPDATE front_door_leads SET customer_id=NULL WHERE id=$1', [lead], true), /cannot be changed/);
  assert.equal((await events(`front_door_lead:${lead}`)).length, 1);
});

test('foreign client, soft delete, anon write and rollback leave no event', { skip }, async () => {
  const inquiry = (await query('INSERT INTO service_inquiries(org_id,deleted_at) VALUES ($1,now()) RETURNING id', [ORG])).rows[0].id;
  await assert.rejects(as('authenticated', 'UPDATE service_inquiries SET customer_id=$1 WHERE id=$2', [CUSTOMER, inquiry], true), /deleted enquiry/);
  const fresh = (await query('INSERT INTO service_inquiries(org_id) VALUES ($1) RETURNING id', [ORG])).rows[0].id;
  await assert.rejects(as('authenticated', 'UPDATE service_inquiries SET customer_id=$1 WHERE id=$2', [FOREIGN, fresh], true), /tenant/);
  const lead = (await query("INSERT INTO front_door_leads(org_id,industry,company_name) VALUES ($1,'Test','Test') RETURNING id", [ORG])).rows[0].id;
  await assert.rejects(as('authenticated', 'UPDATE front_door_leads SET customer_id=$1 WHERE id=$2', [FOREIGN, lead], true), /tenant/);
  await assert.rejects(as('anon', 'UPDATE service_inquiries SET customer_id=$1 WHERE id=$2', [CUSTOMER, fresh]), /permission denied/);
  await assert.rejects(as('anon', 'UPDATE front_door_leads SET customer_id=$1 WHERE id=$2', [CUSTOMER, lead]), /permission denied/);
  await assert.rejects(as('anon', "SELECT submit_service_inquiry('[]'::jsonb,NULL,NULL,NULL,NULL,$1)", [CUSTOMER]), /does not exist/);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ role: 'authenticated', sub: STAFF })]);
    await client.query('UPDATE service_inquiries SET customer_id=$1 WHERE id=$2', [CUSTOMER, fresh]);
    await client.query('ROLLBACK');
  } finally { client.release(); }
  assert.deepEqual(await events(`service_inquiry:${fresh}`), []);
  assert.equal((await query('SELECT customer_id FROM service_inquiries WHERE id=$1', [fresh])).rows[0].customer_id, null);
  const columns = (await query("SELECT column_name FROM information_schema.columns WHERE table_name='client_activity_outbox'")).rows.map((row) => row.column_name);
  assert.deepEqual(columns.sort(), ['sequence','id','org_id','organisation_id','kind','subject_id','label','occurred_at'].sort());
});

test('a known client on insert emits in the insert transaction', { skip }, async () => {
  const id = (await query('INSERT INTO service_inquiries(org_id,customer_id) VALUES ($1,$2) RETURNING id', [ORG, CUSTOMER])).rows[0].id;
  assert.equal((await events(`service_inquiry:${id}`)).length, 1);
});
