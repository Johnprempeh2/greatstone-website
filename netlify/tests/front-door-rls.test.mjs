// Front door as anon, under RLS (GRE-2009, migration 044_front_door_anon). Applies netlify/database/migrations to a
// throwaway real Postgres (lib/postgres.mjs), adds made-up leads, then acts as anon with and without a bound lead to
// prove that a transaction reaches only the lead its claims name: S5 insert, S6 update, the once-only pack and
// Pipedrive claims, and the rate slots. Without the Postgres server binaries the suite is skipped, and says so.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';

const ORG = '11111111-1111-4111-8111-111111111111';
const L = {
  mine: 'f0000000-0000-4000-8000-000000000001', // inserted by anon in the S5 test
  other: 'f0000000-0000-4000-8000-000000000002', // another visitor's lead, fresh
  old: 'f0000000-0000-4000-8000-000000000003', // created two hours ago
  expired: 'f0000000-0000-4000-8000-000000000004', // past the 24-month retention
  race: 'f0000000-0000-4000-8000-000000000005', // for the parallel claim
};
const HASH = 'a'.repeat(64);

let db;

const claims = (lead) => JSON.stringify(lead === undefined ? { role: 'anon' } : { role: 'anon', front_door_lead: lead });

/** Run sql in one transaction as anon, bound to `lead` (or to none), or as the owner when lead is null. */
function as(lead, sql) {
  const pre = lead === null ? '' : `SET LOCAL ROLE anon; SELECT set_config('request.jwt.claims', '${claims(lead)}', true) \\g /dev/null\n`;
  const r = db.psql(`BEGIN;\n${pre}\n${sql}\nCOMMIT;\n`);
  return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() };
}
function ok(lead, sql) {
  const r = as(lead, sql);
  assert.ok(r.ok, `expected success as anon(${lead}): ${r.err}`);
  return r.out;
}
function refused(lead, sql, pattern) {
  const r = as(lead, sql);
  assert.equal(r.ok, false, `expected refusal as anon(${lead}), got: ${r.out}`);
  if (pattern) assert.match(r.err, pattern);
}
const owner = (sql) => ok(null, sql);
const S5 = (id) => `INSERT INTO front_door_leads (id, industry, company_name, brand_words, agents, chat_turns)
  VALUES ('${id}', 'Test industry', 'Test Company', '["calm","clear","kind"]', '[]', 2);`;
const claimPack = (id) => `UPDATE front_door_leads SET pack_sent_at = now() WHERE id = '${id}' AND pack_sent_at IS NULL RETURNING id;`;
const claimCrm = (id) => `UPDATE front_door_leads SET pipedrive_synced_at = now() WHERE id = '${id}' AND pipedrive_synced_at IS NULL RETURNING id;`;

before(async () => {
  if (skip) return;
  db = startPostgres('front-door-rls');
  await db.migrate('003');
  assert.equal(db.psql(`INSERT INTO organisations (id, slug, name) VALUES ('${ORG}', 'test-org', 'Test org');`).status, 0);
  await db.migrate();
  owner(`INSERT INTO front_door_leads (id, org_id, industry, company_name, contact_email, created_at) VALUES
    ('${L.other}', '${ORG}', 'Other industry', 'Other Company', 'other@example.test', now()),
    ('${L.old}', '${ORG}', 'Old industry', 'Old Company', NULL, now() - interval '2 hours'),
    ('${L.expired}', '${ORG}', 'Expired industry', 'Expired Company', NULL, now() - interval '25 months'),
    ('${L.race}', '${ORG}', 'Race industry', 'Race Company', NULL, now());`);
});

after(() => db?.stop());

test('S5: anon inserts only the lead its claims name, and only the S5 columns', { skip }, () => {
  refused(undefined, S5(L.mine), /row-level security/); // no lead bound
  refused(L.other, S5(L.mine), /row-level security/); // bound to a different id
  refused(L.mine, `INSERT INTO front_door_leads (id, industry, company_name, org_id) VALUES ('${L.mine}', 'x', 'y', '${ORG}');`, /permission denied/);
  refused(L.mine, `INSERT INTO front_door_leads (id, industry, company_name, status) VALUES ('${L.mine}', 'x', 'y', 'closed');`, /permission denied/);
  refused(L.mine, `INSERT INTO front_door_leads (id, industry, company_name, contact_email) VALUES ('${L.mine}', 'x', 'y', 'a@b.test');`, /permission denied/);
  refused(L.mine, `INSERT INTO front_door_leads (id, industry, company_name, pack_sent_at) VALUES ('${L.mine}', 'x', 'y', now());`, /permission denied/);
  assert.equal(ok(L.mine, `${S5(L.mine).slice(0, -1)} RETURNING id;`), L.mine);
  // the org comes from the column default, not from the visitor
  assert.equal(owner(`SELECT org_id || ' ' || status FROM front_door_leads WHERE id = '${L.mine}';`), `${ORG} new`);
});

test('anon reads only its bound lead, only the S6 columns, and nothing unbound', { skip }, () => {
  assert.equal(ok(undefined, 'SELECT count(*) FROM front_door_leads;'), '0');
  assert.equal(ok('not-a-uuid', 'SELECT count(*) FROM front_door_leads;'), '0');
  assert.equal(ok(L.mine, 'SELECT id FROM front_door_leads;'), L.mine);
  assert.equal(ok(L.mine, `SELECT count(*) FROM front_door_leads WHERE id = '${L.other}';`), '0');
  refused(L.other, 'SELECT contact_email FROM front_door_leads;', /permission denied/);
  refused(L.mine, 'SELECT brand_words FROM front_door_leads;', /permission denied/);
  refused(L.mine, 'SELECT * FROM front_door_leads;', /permission denied/);
  // an old lead is out of reach even when bound
  assert.equal(ok(L.old, 'SELECT count(*) FROM front_door_leads;'), '0');
});

test('S6: anon updates only its bound, recent lead, and only the contact, claim and CRM columns', { skip }, () => {
  const contact = `contact_name = 'Test Person', contact_email = 'person@example.test', contact_role = 'Test role',
    contact_at = now(), consent_given = true, consent_at = now(), consent_version = 'front-door-consent-v1'`;
  assert.equal(ok(L.mine, `UPDATE front_door_leads SET ${contact} WHERE id = '${L.mine}' RETURNING id, company_name, alert_sent_at;`), `${L.mine}|Test Company|`);
  // another lead: no row matches, and it is unchanged
  assert.equal(ok(L.mine, `UPDATE front_door_leads SET contact_email = 'hijack@example.test' WHERE id = '${L.other}' RETURNING id;`), '');
  assert.equal(ok(L.mine, `UPDATE front_door_leads SET contact_email = 'hijack@example.test' WHERE true RETURNING id;`), L.mine);
  assert.equal(owner(`SELECT contact_email FROM front_door_leads WHERE id = '${L.other}';`), 'other@example.test');
  assert.equal(ok(undefined, `UPDATE front_door_leads SET contact_email = 'x@example.test' RETURNING id;`), '');
  assert.equal(ok(L.old, `UPDATE front_door_leads SET contact_email = 'x@example.test' RETURNING id;`), '');
  assert.equal(owner(`SELECT coalesce(contact_email, '-') FROM front_door_leads WHERE id = '${L.old}';`), '-');
  // staff and S5 columns stay out of reach, and the id cannot move to another lead
  refused(L.mine, `UPDATE front_door_leads SET status = 'closed' WHERE id = '${L.mine}';`, /permission denied/);
  refused(L.mine, `UPDATE front_door_leads SET last_contacted_at = now() WHERE id = '${L.mine}';`, /permission denied/);
  refused(L.mine, `UPDATE front_door_leads SET company_name = 'Changed' WHERE id = '${L.mine}';`, /permission denied/);
  refused(L.mine, `UPDATE front_door_leads SET org_id = gen_random_uuid() WHERE id = '${L.mine}';`, /permission denied/);
  refused(L.mine, `UPDATE front_door_leads SET id = '${L.other}' WHERE id = '${L.mine}';`, /permission denied/);
  refused(L.mine, `DELETE FROM front_door_leads WHERE id = '${L.mine}';`, /permission denied/);
  ok(L.mine, `UPDATE front_door_leads SET alert_sent_at = now() WHERE id = '${L.mine}';`);
});

test('once-only claims: the pack and the Pipedrive push are claimed once, and a release reopens them', { skip }, () => {
  assert.equal(ok(L.mine, claimPack(L.mine)), L.mine);
  assert.equal(ok(L.mine, claimPack(L.mine)), ''); // taken
  ok(L.mine, `UPDATE front_door_leads SET pack_sent_at = NULL WHERE id = '${L.mine}';`); // Resend failed
  assert.equal(ok(L.mine, claimPack(L.mine)), L.mine);

  assert.equal(ok(L.mine, claimCrm(L.mine)), L.mine);
  assert.equal(ok(L.mine, claimCrm(L.mine)), '');
  ok(L.mine, `UPDATE front_door_leads SET pipedrive_person_id = 101, pipedrive_deal_id = 202 WHERE id = '${L.mine}';`);
  assert.equal(owner(`SELECT pipedrive_person_id || '/' || pipedrive_deal_id FROM front_door_leads WHERE id = '${L.mine}';`), '101/202');

  // a claim cannot be made, or released, on someone else's lead
  assert.equal(ok(L.mine, claimPack(L.other)), '');
  assert.equal(owner(`SELECT pack_sent_at IS NULL FROM front_door_leads WHERE id = '${L.other}';`), 't');
});

test('two parallel pack claims on one lead: exactly one wins', { skip }, async () => {
  const open = async () => {
    const c = new pg.Client({ connectionString: db.url });
    await c.connect();
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE anon');
    await c.query("SELECT set_config('request.jwt.claims', $1, true)", [claims(L.race)]);
    return c;
  };
  const [a, b] = [await open(), await open()];
  try {
    const first = await a.query(claimPack(L.race));
    const second = b.query(claimPack(L.race)); // waits on a's row lock
    await new Promise((r) => setTimeout(r, 100));
    await a.query('COMMIT');
    const late = await second;
    await b.query('COMMIT');
    assert.equal(first.rowCount + late.rowCount, 1);
  } finally {
    await a.end();
    await b.end();
  }
});

test('rate slots: anon takes three a day, can give one back, and never sees the table', { skip }, () => {
  const take = `SELECT coalesce(front_door_take_slot('${HASH}', 3)::text, 'none');`;
  const slots = [ok(undefined, take), ok(undefined, take), ok(undefined, take)];
  for (const s of slots) assert.match(s, /^[0-9a-f-]{36}$/);
  assert.equal(ok(undefined, take), 'none');
  ok(undefined, `SELECT front_door_release_slot('${slots[0]}');`);
  assert.match(ok(undefined, take), /^[0-9a-f-]{36}$/);
  refused(undefined, `SELECT front_door_take_slot('not-a-hash', 3);`, /invalid ip hash/);
  refused(undefined, 'SELECT count(*) FROM front_door_rate;', /permission denied/);
  refused(undefined, `INSERT INTO front_door_rate (ip_hash) VALUES ('${'b'.repeat(64)}');`, /permission denied/);
  refused(undefined, 'DELETE FROM front_door_rate;', /permission denied/);
  assert.equal(owner(`SELECT count(*) FROM front_door_rate WHERE ip_hash = '${HASH}';`), '3');
});

test('retention: anon can run the purge, which deletes only leads past 24 months', { skip }, () => {
  assert.equal(ok(undefined, 'SELECT front_door_purge();'), '1');
  assert.equal(owner(`SELECT count(*) FROM front_door_leads WHERE id = '${L.expired}';`), '0');
  assert.equal(owner(`SELECT count(*) FROM front_door_leads WHERE id = '${L.other}';`), '1');
});

test('anon sees no organisation rows; front_door_org() gives only the id', { skip }, () => {
  assert.equal(ok(undefined, 'SELECT count(*) FROM organisations;'), '0');
  assert.equal(ok(undefined, 'SELECT front_door_org();'), ORG);
});
