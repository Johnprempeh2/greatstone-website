// Visitor quotes and the buyer's Stripe Customer id, under RLS (GRE-2018, migration 045_visitor_quotes). Applies
// netlify/database/migrations to a throwaway real Postgres (lib/postgres.mjs), adds made-up companies, buyers, staff,
// a catalogue and other people's quotes, then acts as a guest (anon) and as signed-in buyers to prove that a
// transaction reaches only the quote its claims name and only its own company's row. Without the Postgres server
// binaries the suite is skipped, and says so.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';

const ORG = '11111111-1111-4111-8111-111111111111';
const CO = { a: 'c0000000-0000-4000-8000-00000000000a', b: 'c0000000-0000-4000-8000-00000000000b', c: 'c0000000-0000-4000-8000-00000000000c' };
const CU = { a: 'c1000000-0000-4000-8000-00000000000a', b: 'c1000000-0000-4000-8000-00000000000b', c: 'c1000000-0000-4000-8000-00000000000c' };
const U = {
  a: { sub: '00000000-0000-4000-8000-0000000000a1', email: 'buyer.a@example.test' },
  b: { sub: '00000000-0000-4000-8000-0000000000b1', email: 'buyer.b@example.test' },
  c: { sub: '00000000-0000-4000-8000-0000000000c1', email: 'buyer.c@example.test' },
  nobody: { sub: '00000000-0000-4000-8000-0000000000d1', email: 'signed.in@example.test' }, // signed in, no company
  staff: { sub: '00000000-0000-4000-8000-000000000002', email: 'editor@example.test' },
};
const OFF = { pub: '0f000000-0000-4000-8000-000000000001', draft: '0f000000-0000-4000-8000-000000000002' };
const VAR = { pub: '0e000000-0000-4000-8000-000000000001', draft: '0e000000-0000-4000-8000-000000000002' };
const Q = {
  guest: 'a1000000-0000-4000-8000-000000000001', // made by anon below, with its item, in one transaction
  buyer: 'a1000000-0000-4000-8000-000000000002', // made by buyer A below
  spare: 'a1000000-0000-4000-8000-000000000003', // used for refusals only
  otherB: 'a1000000-0000-4000-8000-000000000004', // company B's quote, fresh
  otherGuest: 'a1000000-0000-4000-8000-000000000005', // another guest's quote, fresh
  old: 'a1000000-0000-4000-8000-000000000006', // a guest quote from two hours ago
};

let db;

/** Run sql in one transaction as `who` ('anon', a key of U, or null for the owner), bound to quote `quote`. */
function as(who, quote, sql) {
  let pre = '';
  if (who) {
    const claims = who === 'anon' ? { role: 'anon' } : { ...U[who] };
    if (quote !== undefined) claims.visitor_quote = quote;
    pre = `SET LOCAL ROLE ${who === 'anon' ? 'anon' : 'authenticated'}; SELECT set_config('request.jwt.claims', '${JSON.stringify(claims)}', true) \\g /dev/null\n`;
  }
  const r = db.psql(`BEGIN;\n${pre}\n${sql}\nCOMMIT;\n`);
  return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() };
}
function ok(who, quote, sql) {
  const r = as(who, quote, sql);
  assert.ok(r.ok, `expected success as ${who}(${quote}): ${r.err}`);
  return r.out;
}
function refused(who, quote, sql, pattern) {
  const r = as(who, quote, sql);
  assert.equal(r.ok, false, `expected refusal as ${who}(${quote}), got: ${r.out}`);
  if (pattern) assert.match(r.err, pattern);
}
const owner = (sql) => ok(null, undefined, sql);
const quote = (id, extra = '') => {
  const [cols, vals] = extra ? extra.split(' := ') : ['', ''];
  return `INSERT INTO quotes (id, contact_name, contact_email, message, indicative_total_minor${cols ? `, ${cols}` : ''})
    VALUES ('${id}', 'Test Person', 'person@example.test', 'Test message', 1000${vals ? `, ${vals}` : ''})`;
};
const item = (q, variant = VAR.pub, offering = OFF.pub) => `INSERT INTO quote_items (quote_id, offering_id, variant_id, offering_name, variant_name, qty, list_price_minor, captured_price_minor)
  VALUES ('${q}', '${offering}', '${variant}', 'Test Offering', 'Test Variant', 2, 500, 500);`;
const setStripe = (company, id) =>
  `UPDATE customers SET stripe_customer_id = '${id}' WHERE id = '${company}' AND stripe_customer_id IS NULL RETURNING stripe_customer_id;`;

before(async () => {
  if (skip) return;
  db = startPostgres('visitor-quote-rls');
  await db.migrate('003');
  assert.equal(db.psql(`INSERT INTO organisations (id, slug, name) VALUES ('${ORG}', 'test-org', 'Test org');`).status, 0);
  await db.migrate();
  owner(`
    INSERT INTO customers (id, org_id, slug, name, stripe_customer_id) VALUES
      ('${CO.a}', '${ORG}', 'test-co-a', 'Test Company A', NULL),
      ('${CO.b}', '${ORG}', 'test-co-b', 'Test Company B', 'cus_TestCompanyB'),
      ('${CO.c}', '${ORG}', 'test-co-c', 'Test Company C', NULL);
    INSERT INTO customer_users (id, org_id, customer_id, email, full_name, auth_subject, is_primary) VALUES
      ('${CU.a}', '${ORG}', '${CO.a}', '${U.a.email}', 'Test Buyer A', '${U.a.sub}', true),
      ('${CU.b}', '${ORG}', '${CO.b}', '${U.b.email}', 'Test Buyer B', '${U.b.sub}', true),
      ('${CU.c}', '${ORG}', '${CO.c}', '${U.c.email}', 'Test Buyer C', '${U.c.sub}', true);
    INSERT INTO users (org_id, email, full_name, role, auth_subject) VALUES ('${ORG}', '${U.staff.email}', 'Test Editor', 'editor', '${U.staff.sub}');
    INSERT INTO offerings (id, org_id, type, slug, name, status) VALUES
      ('${OFF.pub}', '${ORG}', 'service', 'test-published', 'Test Published', 'published'),
      ('${OFF.draft}', '${ORG}', 'service', 'test-draft', 'Test Draft', 'draft');
    INSERT INTO offering_variants (id, org_id, offering_id, name, base_price_minor, currency) VALUES
      ('${VAR.pub}', '${ORG}', '${OFF.pub}', 'Test Variant', 500, 'GBP'),
      ('${VAR.draft}', '${ORG}', '${OFF.draft}', 'Draft Variant', 500, 'GBP');
    INSERT INTO quotes (id, org_id, reference, customer_id, customer_user_id, contact_email, quoted_total_minor, created_at) VALUES
      ('${Q.otherB}', '${ORG}', 'Q-TEST-B', '${CO.b}', '${CU.b}', '${U.b.email}', 9900, now()),
      ('${Q.otherGuest}', '${ORG}', 'Q-TEST-G', NULL, NULL, 'guest@example.test', NULL, now()),
      ('${Q.old}', '${ORG}', 'Q-TEST-OLD', NULL, NULL, 'old@example.test', NULL, now() - interval '2 hours');
    INSERT INTO quote_items (org_id, quote_id, offering_id, variant_id, offering_name, qty) VALUES
      ('${ORG}', '${Q.otherB}', '${OFF.pub}', '${VAR.pub}', 'Test Offering', 1);`);
});

after(() => db?.stop());

test('guest: inserts only the quote its claims name, and only the request columns', { skip }, () => {
  refused('anon', undefined, `${quote(Q.guest)};`, /row-level security/); // no quote bound
  refused('anon', Q.spare, `${quote(Q.guest)};`, /row-level security/); // bound to a different id
  refused('anon', 'not-a-uuid', `${quote(Q.guest)};`, /row-level security/);
  for (const col of [`status := 'won'`, `reference := 'Q-MINE'`, `org_id := '${ORG}'`, `customer_id := '${CO.b}'`,
    `quoted_total_minor := 1`, `assigned_to := NULL`, `created_at := now() + interval '1 year'`, `metadata := '{}'`]) {
    refused('anon', Q.guest, `${quote(Q.guest, col)};`, /permission denied/);
  }
  // the request-quote flow: the quote, read back, then its item, all in one transaction
  const [id, ref] = ok('anon', Q.guest, `${quote(Q.guest, `source, po_reference := 'enquiry_basket', 'PO-1'`)} RETURNING id, reference;
    ${item(Q.guest)}`).split('|');
  assert.equal(id, Q.guest);
  assert.match(ref, /^Q-\d{4}-\d{6}$/); // from 014's trigger, not the visitor
  assert.equal(owner(`SELECT org_id || ' ' || status || ' ' || source || ' ' || coalesce(customer_id::text, '-') FROM quotes WHERE id = '${Q.guest}';`),
    `${ORG} new enquiry_basket -`);
});

test('guest: adds items only to the quote it made in this transaction, only for a published variant', { skip }, () => {
  const fresh = (sql) => `${quote(Q.spare)};\n${sql}`;
  refused('anon', Q.spare, fresh(item(Q.spare, VAR.draft, OFF.draft)), /row-level security/); // unpublished
  refused('anon', Q.spare, fresh(item(Q.spare, VAR.pub, OFF.draft)), /row-level security/); // variant of another offering
  refused('anon', Q.spare, fresh(item(Q.otherGuest)), /row-level security/); // another visitor's quote
  refused('anon', Q.spare, fresh(`INSERT INTO quote_items (org_id, quote_id, offering_name) VALUES ('${ORG}', '${Q.spare}', 'x');`), /permission denied/);
  // a quote made in another transaction is out of reach, even its own, and even when the claim names it
  refused('anon', Q.guest, item(Q.guest), /row-level security/);
  refused('anon', Q.otherGuest, item(Q.otherGuest), /row-level security/);
  refused('anon', Q.old, item(Q.old), /row-level security/);
  refused('anon', undefined, item(Q.guest), /row-level security/);
  assert.equal(owner(`SELECT count(*) FROM quotes WHERE id = '${Q.spare}';`), '0'); // every refusal rolled back
  assert.equal(owner(`SELECT count(*) || ' ' || min(org_id::text) FROM quote_items WHERE quote_id = '${Q.guest}';`), `1 ${ORG}`);
  assert.equal(owner(`SELECT count(*) FROM quote_items WHERE quote_id = '${Q.otherGuest}';`), '0');
});

test('guest: reads back only id, reference and created_at of the quote it just made, and changes nothing', { skip }, () => {
  assert.equal(ok('anon', undefined, 'SELECT count(*) FROM quotes;'), '0');
  assert.equal(ok('anon', Q.spare, `${quote(Q.spare)};\nSELECT id FROM quotes;\nROLLBACK;`), Q.spare);
  for (const bound of [Q.guest, Q.otherGuest, Q.otherB, Q.old]) assert.equal(ok('anon', bound, 'SELECT count(*) FROM quotes;'), '0');
  refused('anon', Q.guest, 'SELECT contact_email FROM quotes;', /permission denied/);
  refused('anon', Q.guest, 'SELECT * FROM quotes;', /permission denied/);
  refused('anon', Q.guest, 'SELECT count(*) FROM quote_items;', /permission denied/);
  refused('anon', Q.guest, `UPDATE quotes SET message = 'changed' WHERE id = '${Q.guest}';`, /permission denied/);
  refused('anon', Q.guest, `UPDATE quotes SET po_document_path = '${Q.guest}/x.pdf' WHERE id = '${Q.guest}';`, /permission denied/);
  refused('anon', Q.guest, `DELETE FROM quotes WHERE id = '${Q.guest}';`, /permission denied/);
  refused('anon', Q.guest, `DELETE FROM quote_items WHERE quote_id = '${Q.guest}';`, /permission denied/);
});

test('signed-in buyer: a quote for their own company only, with the staff columns closed', { skip }, () => {
  const mine = `customer_id, customer_user_id := '${CO.a}', '${CU.a}'`;
  refused('a', Q.spare, `${quote(Q.spare, `customer_id, customer_user_id := '${CO.b}', '${CU.b}'`)};`, /row-level security/);
  refused('a', Q.spare, `${quote(Q.spare, `customer_id, customer_user_id := '${CO.a}', '${CU.b}'`)};`, /row-level security/);
  refused('a', Q.spare, `${quote(Q.spare, `customer_id := '${CO.a}'`)};`, /row-level security/); // contact left out
  refused('nobody', Q.spare, `${quote(Q.spare, `customer_id, customer_user_id := '${CO.a}', '${CU.a}'`)};`, /row-level security/);
  for (const col of [`status := 'won'`, `reference := 'Q-MINE'`, `quoted_total_minor := 1`, `valid_until := current_date`,
    `metadata := '{"x":1}'`, `source := 'admin'`, `deleted_at := now()`, `po_document_path := 'elsewhere/x.pdf'`]) {
    refused('a', Q.spare, `${quote(Q.spare, col)};`, /visitors may only send a new quote/);
  }
  const out = ok('a', Q.buyer, `${quote(Q.buyer, `${mine.split(' := ')[0]}, created_at, po_document_path, po_document_name := ${mine.split(' := ')[1]}, now() + interval '1 year', '${Q.buyer}/po.pdf', 'po.pdf'`)} RETURNING id;
    ${item(Q.buyer)}`);
  assert.equal(out, Q.buyer);
  // created_at is the server's, so a visitor cannot make a quote look new later
  assert.equal(owner(`SELECT created_at <= now() FROM quotes WHERE id = '${Q.buyer}';`), 't');
  // without the claim it shows in the buyer's account through customer_self, beside nothing of B's
  assert.equal(ok('a', undefined, 'SELECT id FROM quotes ORDER BY id;'), Q.buyer);
  assert.equal(ok('a', undefined, 'SELECT count(*) FROM quote_items;'), '1');
  // a signed-in user with no company still sends a plain quote
  ok('nobody', Q.spare, `${quote(Q.spare)};`);
  owner(`DELETE FROM quotes WHERE id = '${Q.spare}';`);
});

test("signed-in buyer: cannot read, add to or change other people's quotes", { skip }, () => {
  assert.equal(ok('a', Q.buyer, `SELECT count(*) FROM quotes WHERE id IN ('${Q.otherB}', '${Q.otherGuest}', '${Q.guest}');`), '0');
  assert.equal(ok('a', Q.buyer, `SELECT count(*) FROM quote_items WHERE quote_id = '${Q.otherB}';`), '0');
  refused('a', Q.buyer, item(Q.otherB), /row-level security/);
  refused('a', Q.otherB, item(Q.otherB), /row-level security/); // naming B's quote in the claim gives nothing
  assert.equal(ok('a', Q.otherB, `SELECT count(*) FROM quotes WHERE id = '${Q.otherB}';`), '0');
  assert.equal(ok('a', Q.buyer, `UPDATE quotes SET quoted_total_minor = 1 WHERE id IN ('${Q.buyer}', '${Q.otherB}') RETURNING id;`), '');
  assert.equal(ok('a', Q.buyer, `DELETE FROM quotes WHERE id IN ('${Q.buyer}', '${Q.otherB}') RETURNING id;`), '');
  assert.equal(owner(`SELECT quoted_total_minor FROM quotes WHERE id = '${Q.otherB}';`), '9900');
  assert.equal(owner(`SELECT count(*) FROM quotes WHERE id = '${Q.buyer}';`), '1');
});

test('staff keep full quote access; the visitor guard does not apply to them', { skip }, () => {
  ok('staff', undefined, `INSERT INTO quotes (id, org_id, reference, status, quoted_total_minor, contact_email)
    VALUES ('${Q.spare}', '${ORG}', 'Q-STAFF', 'quoted', 1200, 'staff.quote@example.test');`);
  assert.equal(ok('staff', undefined, `UPDATE quotes SET status = 'won' WHERE id = '${Q.spare}' RETURNING status;`), 'won');
  assert.equal(ok('staff', undefined, 'SELECT count(*) >= 5 FROM quotes;'), 't');
  owner(`DELETE FROM quotes WHERE id = '${Q.spare}';`);
});

test('stripe_customer_id: a buyer sets it once, on their own company only', { skip }, () => {
  assert.equal(ok('a', undefined, setStripe(CO.a, 'cus_TestCompanyA')), 'cus_TestCompanyA');
  assert.equal(ok('a', undefined, setStripe(CO.a, 'cus_TestCompanyA')), ''); // already set: a retry is a no-op
  refused('a', undefined, `UPDATE customers SET stripe_customer_id = 'cus_Other' WHERE id = '${CO.a}';`, /set the Stripe Customer id once/);
  refused('a', undefined, `UPDATE customers SET stripe_customer_id = NULL WHERE id = '${CO.a}';`, /set the Stripe Customer id once/);
  // another company's row: no row matches, and it is unchanged
  assert.equal(ok('a', undefined, `UPDATE customers SET stripe_customer_id = 'cus_Hijack' WHERE id = '${CO.c}' RETURNING id;`), '');
  assert.equal(owner(`SELECT coalesce(stripe_customer_id, '-') FROM customers WHERE id = '${CO.c}';`), '-');
  // only a Stripe id, and never one another company holds
  refused('c', undefined, setStripe(CO.c, 'not-a-stripe-id'), /set the Stripe Customer id once/);
  refused('c', undefined, setStripe(CO.c, 'cus_TestCompanyB'), /uq_customers_stripe/);
  // the other guarded columns stay closed in the same statement
  refused('c', undefined, `UPDATE customers SET stripe_customer_id = 'cus_TestCompanyC', slug = 'mine' WHERE id = '${CO.c}';`, /set the Stripe Customer id once/);
  refused('c', undefined, `UPDATE customers SET stripe_customer_id = 'cus_TestCompanyC', tier_id = NULL, billing_currency = 'USD' WHERE id = '${CO.c}';`, /set the Stripe Customer id once/);
  // a guest and a signed-in user without a company reach no customer row
  assert.equal(ok('anon', undefined, `UPDATE customers SET stripe_customer_id = 'cus_Anon' RETURNING id;`), '');
  assert.equal(ok('anon', undefined, 'SELECT count(*) FROM customers;'), '0');
  assert.equal(ok('nobody', undefined, `UPDATE customers SET stripe_customer_id = 'cus_Nobody' RETURNING id;`), '');
  assert.equal(owner(`SELECT string_agg(coalesce(stripe_customer_id, '-'), ',' ORDER BY slug) FROM customers;`), 'cus_TestCompanyA,cus_TestCompanyB,-');
});

test('stripe_customer_id: two parallel saves for one company, exactly one wins', { skip }, async () => {
  const open = async () => {
    const c = new pg.Client({ connectionString: db.url });
    await c.connect();
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE authenticated');
    await c.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(U.c)]);
    return c;
  };
  const [x, y] = [await open(), await open()];
  try {
    const first = await x.query(setStripe(CO.c, 'cus_TestCompanyC'));
    const second = y.query(setStripe(CO.c, 'cus_TestCompanyC')); // waits on x's row lock
    await new Promise((r) => setTimeout(r, 100));
    await x.query('COMMIT');
    const late = await second;
    await y.query('COMMIT');
    assert.equal(first.rowCount + late.rowCount, 1);
  } finally {
    await x.end();
    await y.end();
  }
  assert.equal(owner(`SELECT stripe_customer_id FROM customers WHERE id = '${CO.c}';`), 'cus_TestCompanyC');
});

test('the webhook role (service_role) still writes any customer row', { skip }, () => {
  owner(`BEGIN; SET LOCAL ROLE service_role; UPDATE customers SET stripe_customer_id = 'cus_Webhook' WHERE id = '${CO.c}'; COMMIT;`);
  assert.equal(owner(`SELECT stripe_customer_id FROM customers WHERE id = '${CO.c}';`), 'cus_Webhook');
});
