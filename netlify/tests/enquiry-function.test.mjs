// The `enquiry` Netlify Function (GRE-1794) end to end on a local Netlify Database, with Resend and Turnstile
// faked at fetch. The new path for what supabase/functions/_shared/enquiry.test.mjs covers with fakes: saved and
// alerted, Turnstile, the per-IP limit, the honeypot, and the lead kept by the alert when the database is
// down. Every database transaction the function opens runs as `anon`, never as the owner.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { NetlifyDB } from '@netlify/database-dev';
import pg from 'pg';
import { makeEnquiryHandler } from '../functions/lib/enquiry-handler.mjs';

const MIGRATIONS = fileURLToPath(new URL('../database/migrations', import.meta.url));
const ENV = { RESEND_API_KEY: 're_test', RESEND_FROM: 'Greatstone <alerts@example.test>', ENQUIRY_ALERT_TO: 'owner@example.test', APP_SITE_ORIGIN: 'https://example.test/' };
const BODY = { name: 'Jane Stonewell', company: 'Stonewell & Co.', email: 'jane@stonewell.co', size_band: '11 to 50', message: 'Interest: GS Agentic Manager\n\nThe reports', page: '/contact', attribution: { first: { utm_source: 'linkedin', utm_campaign: 'r1' }, last: null } };

let local, pool, ipSeq = 0;
before(async () => {
  local = new NetlifyDB({ logger: () => {} });
  const url = await local.start();
  await local.applyMigrations(MIGRATIONS, '001_enquiry_inbox'); // PGlite has no citext or pg_trgm (002 on)
  pool = new pg.Pool({ connectionString: url, max: 1 });
});
after(async () => { await pool?.end(); await local?.stop(); });

// A pool that records every statement, to prove each transaction switches to anon before its first query.
function watched(p) {
  const txs = [];
  return {
    txs,
    connect: async () => {
      const client = await p.connect();
      const tx = [];
      txs.push(tx);
      return { query: (sql, params) => { tx.push(String(sql)); return client.query(sql, params); }, release: () => client.release() };
    },
  };
}

function fakeFetch({ resend = 200, turnstile = true } = {}) {
  const calls = { resend: [], turnstile: [] };
  const impl = async (url, init) => {
    if (url === 'https://api.resend.com/emails') {
      calls.resend.push(JSON.parse(init.body));
      if (resend === 'down') throw new TypeError('fetch failed');
      return { ok: resend === 200, status: resend, json: async () => ({}) };
    }
    if (String(url).startsWith('https://challenges.cloudflare.com/')) {
      calls.turnstile.push(init.body.get('response'));
      if (turnstile === 'down') throw new TypeError('fetch failed');
      return { ok: true, json: async () => ({ success: turnstile === true }) };
    }
    throw new Error('unexpected fetch ' + url);
  };
  return { calls, impl };
}

const post = (body) => new Request('https://example.test/api/enquiry', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body),
});
async function send(body, { env = ENV, getPool = () => pool, fetch = fakeFetch(), ip } = {}) {
  const logs = [];
  const res = await makeEnquiryHandler({ env, getPool, fetchImpl: fetch.impl, log: (l, m) => logs.push([l, m]) })(post(body), { ip: ip || '203.0.113.' + (++ipSeq) });
  return { status: res.status, body: await res.json(), calls: fetch.calls, logs };
}
const row = async (ref) => (await pool.query('SELECT * FROM service_inquiries WHERE id::text LIKE $1', [ref + '%'])).rows[0];

test('an enquiry is saved as anon, alerts the owner, and is marked alerted', async () => {
  const w = watched(pool);
  const out = await send(BODY, { getPool: () => w });
  assert.equal(out.status, 200);
  assert.equal(out.body.ok, true);
  assert.match(out.body.ref, /^[0-9a-f]{8}$/);
  const r = await row(out.body.ref);
  assert.equal(r.contact_email, 'jane@stonewell.co');
  assert.equal(r.size_band, '11 to 50');
  assert.equal(r.source, 'contact');
  assert.equal(r.attribution.page, '/contact');
  assert.ok(r.alert_sent_at, 'alert_sent_at set');
  assert.equal(out.calls.resend.length, 1);
  assert.equal(out.calls.resend[0].subject, 'New enquiry: Stonewell & Co., 11 to 50');
  assert.deepEqual(out.calls.resend[0].to, ['owner@example.test']);
  assert.match(out.calls.resend[0].text, /https:\/\/example\.test\/#catalogue\/inquiries/);
  assert.equal(w.txs.length, 3, 'count, save, mark alerted');
  for (const tx of w.txs) assert.deepEqual(tx.slice(0, 2), ['BEGIN', 'SET LOCAL ROLE anon'], 'never as owner');
});

test('Turnstile: with a secret set, no token or a failed check is refused and nothing is kept', async () => {
  const env = { ...ENV, TURNSTILE_SECRET_KEY: 'secret' };
  const n = async () => (await pool.query('SELECT count(*)::int AS n FROM service_inquiries')).rows[0].n;
  const before = await n();
  const none = await send(BODY, { env });
  assert.equal(none.status, 403);
  assert.equal(none.body.ok, false);
  const failed = await send({ ...BODY, turnstile: 'bad' }, { env, fetch: fakeFetch({ turnstile: false }) });
  assert.equal(failed.status, 403);
  assert.equal(failed.calls.resend.length, 0);
  assert.equal(await n(), before);
  const passed = await send({ ...BODY, turnstile: 'good' }, { env });
  assert.equal(passed.status, 200);
  assert.deepEqual(passed.calls.turnstile, ['good']);
  // a Cloudflare outage must not cost a real lead (the per-IP limit still applies)
  const outage = await send({ ...BODY, turnstile: 'tok' }, { env, fetch: fakeFetch({ turnstile: 'down' }) });
  assert.equal(outage.status, 200);
  assert.ok(outage.logs.some(([l, m]) => l === 'error' && /Turnstile unreachable/.test(m)));
});

test('Turnstile: with no secret set, the check is skipped and one warning is logged per handler', async () => {
  const fetch = fakeFetch({ turnstile: false }); // would refuse every token if it were ever asked
  const logs = [];
  const handler = makeEnquiryHandler({ env: ENV, getPool: () => pool, fetchImpl: fetch.impl, log: (l, m) => logs.push([l, m]) });
  const go = async (body, ip) => { const res = await handler(post(body), { ip }); return { status: res.status, body: await res.json() }; };

  const first = await go(BODY, '192.0.2.1');
  const second = await go({ ...BODY, turnstile: 'ignored' }, '192.0.2.2');
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.ok((await row(first.body.ref)).alert_sent_at, 'saved and alerted with no token');
  assert.ok(await row(second.body.ref), 'a stray token does not matter');
  assert.equal(fetch.calls.turnstile.length, 0, 'Cloudflare is never called');
  assert.equal(logs.filter(([l, m]) => l === 'warn' && /Turnstile is off/.test(m)).length, 1, 'one warning, not one per enquiry');

  // what stands in for it: the honeypot, the field caps (size band at 40), and the per-IP limit
  assert.deepEqual(await go({ ...BODY, email: 'bot2@example.test', website: 'x' }, '192.0.2.3'), { status: 200, body: { ok: true } });
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM service_inquiries WHERE contact_email = 'bot2@example.test'")).rows[0].n, 0);
  const long = await go({ ...BODY, size_band: 'x'.repeat(500) }, '192.0.2.4');
  assert.equal((await row(long.body.ref)).size_band.length, 40);
  for (let i = 0; i < 10; i++) assert.equal((await go(BODY, '192.0.2.5')).status, 200);
  assert.equal((await go(BODY, '192.0.2.5')).status, 429);
  assert.equal(logs.filter(([, m]) => /Turnstile is off/.test(m)).length, 1);
});

test('ten enquiries per IP a day; the eleventh is refused with 429', async () => {
  const ip = '198.51.100.200';
  for (let i = 0; i < 10; i++) assert.equal((await send(BODY, { ip })).status, 200);
  const eleventh = await send(BODY, { ip });
  assert.equal(eleventh.status, 429);
  assert.equal(eleventh.calls.resend.length, 0);
});

test('honeypot: answered ok, nothing saved, no alert, no Turnstile call', async () => {
  const out = await send({ ...BODY, email: 'bot@example.test', website: 'http://spam' }, { env: { ...ENV, TURNSTILE_SECRET_KEY: 'secret' } });
  assert.deepEqual([out.status, out.body], [200, { ok: true }]);
  assert.equal(out.calls.resend.length + out.calls.turnstile.length, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM service_inquiries WHERE contact_email = 'bot@example.test'")).rows[0].n, 0);
});

test('no database: the alert carries the whole enquiry and the visitor sees the confirmation', async () => {
  for (const getPool of [() => null, () => { throw new Error('MissingDatabaseConnectionError'); }]) {
    const out = await send(BODY, { getPool });
    assert.equal(out.status, 200);
    assert.deepEqual(out.body, { ok: true, ref: '' });
    assert.match(out.calls.resend[0].subject, /^Enquiry NOT SAVED: /);
    assert.match(out.calls.resend[0].text, /jane@stonewell\.co/);
  }
});

test('database down and Resend down: 503, so the page shows the contact address', async () => {
  const broken = { connect: async () => { throw Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }); } };
  const out = await send(BODY, { getPool: () => broken, fetch: fakeFetch({ resend: 'down' }) });
  assert.equal(out.status, 503);
  assert.equal(out.body.ok, false);
  assert.ok(out.logs.some(([, m]) => /LOST/.test(m)));
  assert.ok(!out.logs.some(([, m]) => /jane@stonewell/.test(m)), 'no visitor details in the logs');
});

test('bad input: GET is 405, broken JSON 400, no email 400', async () => {
  const handler = makeEnquiryHandler({ env: ENV, getPool: () => pool, fetchImpl: fakeFetch().impl, log: () => {} });
  assert.equal((await handler(new Request('https://example.test/api/enquiry'), {})).status, 405);
  assert.equal((await send('{not json')).status, 400);
  assert.equal((await send({ ...BODY, email: 'nope' })).status, 400);
});
