// Port of the source's scripts/security-probe.mjs (GRE-2612). The source probed Supabase PostgREST with the browser
// anon key: every sensitive table must give 0 rows, engagement.enrol_token above all (whoever reads it can join any
// round), and the bump_rate / claim_seat RPCs must be denied. The website has no PostgREST; its equivalents are:
//   - the database roles a site function could run as (anon, authenticated, service_role): no access at all to
//     schema `interview`, no function executable;
//   - interview_worker (the only role with grants) with no claims, with a participant's claims for somebody else,
//     and with system claims keyed to another organisation (customer_id): 0 rows of the round, enrol_token never
//     readable by a participant who is not in the round, the per-session voice token hash never readable;
//   - the HTTP surface: unauthenticated calls to chat / portal / join enrol / voice start answer 401 (or 404 when
//     the engine or voice is off), voice think without a valid session bearer answers 401 (404 when voice is off).
// The round under probe is made by the real flows (join, start, chat; in voice mode also voice/start and a spoken
// turn), plus SQL-seeded synthesis, seat and cache rows, so every table has something to leak. Rows are counted,
// never printed, as the source did.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODES, SMOKE_SCRIPT, account, asWorker, chat, installFakeExtraction, joinAndStart, makeHandlers, makeVerify, newCustomer, post,
  seedRound, skip, startInterviewDb, think, thinkTarget, voiceStart,
} from './lib/interview-harness.mjs';

let db;
let extraction;
let TABLES;
let FUNCTIONS;
before(async () => {
  if (skip) return;
  db = await startInterviewDb('interview-regress-probe');
  extraction = installFakeExtraction(SMOKE_SCRIPT);
  TABLES = db.sql(`SELECT string_agg(c.relname, ',' ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'interview' AND c.relkind IN ('r', 'p', 'v', 'm')`).split(',');
  FUNCTIONS = db.sql(`SELECT string_agg(p.oid::regprocedure::text, '|' ORDER BY p.proname) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'interview'`).split('|');
});
after(async () => { extraction?.reset(); await db?.stop(); });

// rate_event holds only counters (bucket key, window, count) and no client data; any worker request may bump it
// (policy worker_all), so it is the one table a claimless worker can see. Allow-listed in the org-scope gate too.
const COUNTERS = 'rate_event';
const count = async (c, table, where = '') => Number((await c.query(`SELECT count(*) AS n FROM interview.${table} ${where}`)).rows[0].n);
const hasColumn = (table, column) => db.sql(`SELECT count(*) FROM information_schema.columns WHERE table_schema = 'interview'
  AND table_name = '${table}' AND column_name = '${column}'`) === '1';

for (const mode of MODES) {
  describe(`security probe, ${mode.name}`, { skip }, () => {
    let h, A, B, alice, bob, outsider, sessionA, sessionB, bearerA;

    before(async () => {
      const CA = newCustomer(db.sql, 'Probe client A');
      const CB = newCustomer(db.sql, 'Probe client B');
      A = seedRound(db.sql, { customerId: CA });
      B = seedRound(db.sql, { customerId: CB });
      alice = account('alice');
      bob = account('bob');
      outsider = account('mallory');
      h = makeHandlers({ pool: db.pool, env: mode.env, verify: makeVerify([alice, bob, outsider]) });
      sessionA = await joinAndStart(h, alice, A);
      sessionB = await joinAndStart(h, bob, B);
      assert.equal((await chat(h, alice, { sessionId: sessionA })).status, 200);
      assert.equal((await chat(h, alice, { sessionId: sessionA, content: SMOKE_SCRIPT[2].text, clientTurnId: 'p1' })).status, 200);
      assert.equal((await chat(h, bob, { sessionId: sessionB })).status, 200);
      if (mode.voice) {
        const vs = await voiceStart(h, alice, sessionA);
        assert.equal(vs.status, 200);
        const target = thinkTarget(vs.body.settings);
        bearerA = target.authorization;
        assert.equal((await think(h, target, SMOKE_SCRIPT[3].text)).status, 200);
      }
      // the rest of the tables, as the bridge and the pipeline would fill them
      db.sql(`SET search_path TO interview, public;
        INSERT INTO synthesis (engagement_id) VALUES ('${A.id}');
        INSERT INTO synthesis_cache (engagement_id, kind, key, fingerprint, payload, model) VALUES ('${A.id}', 'session', '${sessionA}', 'f', '{}', 'm');
        INSERT INTO synthesis_run (engagement_id, actor) VALUES ('${A.id}', 'gsam');
        INSERT INTO seat_request (engagement_id, requested_by, seats) SELECT '${A.id}', id, 1 FROM employee WHERE user_id = '${alice.id}';
        INSERT INTO seat_purchase (engagement_id, seats, purchased_by) SELECT '${A.id}', 1, id FROM employee WHERE user_id = '${alice.id}';
        INSERT INTO memory_blob (person_id, customer_id, blob, opted_in, expires_at)
          SELECT person_id, '${CA}', '{"role_title":"Clerk"}', true, now() + interval '1 year' FROM person WHERE auth_user_id = '${alice.id}';`);
      for (const t of TABLES.filter((x) => x !== 'person' && x !== COUNTERS)) {
        assert.ok(Number(db.sql(`SELECT count(*) FROM interview.${t} WHERE customer_id = '${CA}'`)) > 0, `seed: ${t} has round A rows`);
      }
    });

    test('anon, authenticated and service_role read nothing: permission denied on every interview table', () => {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        assert.equal(db.sql(`SELECT count(*) FROM pg_roles WHERE rolname = '${role}'`), '1', `${role} exists in the test database`);
        assert.equal(db.sql(`SELECT has_schema_privilege('${role}', 'interview', 'USAGE')`), 'f', role);
        for (const table of TABLES) {
          const r = db.pgc.psql(`BEGIN; SET LOCAL ROLE ${role}; SELECT count(*) FROM interview.${table}; COMMIT;`);
          assert.notEqual(r.status, 0, `${role} read ${table}`);
          assert.match(r.stderr, /permission denied/);
        }
        // the source's critical probe, spelled out: the enrolment token
        const tok = db.pgc.psql(`BEGIN; SET LOCAL ROLE ${role}; SELECT enrol_token FROM interview.engagement; COMMIT;`);
        assert.notEqual(tok.status, 0);
      }
    });

    test('no interview function is executable by anon, authenticated, service_role or PUBLIC; the RPC probes are denied', () => {
      assert.ok(FUNCTIONS.length >= 10, FUNCTIONS.join(' '));
      for (const role of ['anon', 'authenticated', 'service_role']) {
        for (const fn of FUNCTIONS) assert.equal(db.sql(`SELECT has_function_privilege('${role}', '${fn}', 'EXECUTE')`), 'f', `${role} ${fn}`);
        for (const call of [`interview.bump_rate('attacker', 60, 1)`, `interview.claim_seat('00000000-0000-0000-0000-000000000000')`]) {
          const r = db.pgc.psql(`BEGIN; SET LOCAL ROLE ${role}; SELECT ${call}; COMMIT;`);
          assert.notEqual(r.status, 0, `${role} ran ${call}`);
          assert.match(r.stderr, /permission denied/);
        }
      }
      // PUBLIC holds no EXECUTE on any of them (acl has no "=X" entry)
      assert.equal(db.sql(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'interview' AND (p.proacl IS NULL OR array_to_string(p.proacl, ',') ~ '(^|,)=[^/]*X')`), '0');
      // the worker gets the engine's entry points only: no trigger function, no scope helper
      const workerCan = FUNCTIONS.filter((fn) => db.sql(`SELECT has_function_privilege('interview_worker', '${fn}', 'EXECUTE')`) === 't')
        .map((fn) => fn.replace(/^interview\./, '').replace(/\(.*$/, '')).sort();
      assert.deepEqual(workerCan, ['bump_rate', 'claim_customer_id', 'claim_email', 'claim_first_admin', 'claim_seat', 'claim_user_id',
        'create_engagement', 'engagement_spend', 'is_system'].sort());
    });

    test('interview_worker with no claims: 0 rows from every table (counters aside)', async () => {
      await asWorker(db.pool, null, async (c) => {
        for (const t of TABLES.filter((x) => x !== COUNTERS)) assert.equal(await count(c, t), 0, t);
        assert.equal((await c.query(`SELECT enrol_token FROM interview.engagement`)).rows.length, 0);
        // a SECURITY DEFINER entry point that would leak or write is refused without system claims
        await assert.rejects(c.query(`SELECT interview.create_engagement($1, 'x', 1, '{}', 'tok-x', now(), 'a@a.test', '{}')`, [A.customerId]),
          /system calls only/);
      });
      // nor with a forged role or scope claim
      for (const claims of [{ role: 'service_role' }, { scope: 'admin' }, { scope: 'participant', sub: '' }, { scope: 'participant', email: alice.email }]) {
        await asWorker(db.pool, claims, async (c) => {
          for (const t of TABLES.filter((x) => x !== COUNTERS)) assert.equal(await count(c, t), 0, `${JSON.stringify(claims)} ${t}`);
        });
      }
    });

    test('participant claims of a person who is not in the round: 0 of its rows, enrol_token never readable', async () => {
      const claimsOf = (u) => ({ role: 'interview_worker', scope: 'participant', sub: u.id, email: u.email, email_verified: true });
      // an account on no round at all
      await asWorker(db.pool, claimsOf(outsider), async (c) => {
        for (const t of TABLES.filter((x) => x !== COUNTERS)) assert.equal(await count(c, t), 0, `outsider ${t}`);
      });
      // bob is in round B only: round A (and alice) are invisible to him, though his own round is not
      await asWorker(db.pool, claimsOf(bob), async (c) => {
        for (const t of TABLES.filter((x) => x !== COUNTERS && hasColumn(x, 'customer_id'))) {
          assert.equal(await count(c, t, `WHERE customer_id = '${A.customerId}'`), 0, `bob reads round A ${t}`);
        }
        assert.equal((await c.query(`SELECT enrol_token FROM interview.engagement WHERE id = $1`, [A.id])).rows.length, 0);
        assert.equal((await c.query(`SELECT enrol_token FROM interview.engagement WHERE enrol_token = $1`, [A.token])).rows.length, 0);
        assert.equal(await count(c, 'person', `WHERE auth_user_id = '${alice.id}'`), 0);
        assert.equal((await c.query(`SELECT voice_token_hash FROM interview.session WHERE id = $1`, [sessionA])).rows.length, 0);
        // positive control: the probe is not vacuous
        assert.equal(await count(c, 'session'), 1);
        assert.equal((await c.query(`SELECT enrol_token FROM interview.engagement WHERE id = $1`, [B.id])).rows[0].enrol_token, B.token);
        // and he cannot write into round A either
        const wrote = await c.query(`UPDATE interview.session SET resumable = false WHERE id = $1`, [sessionA]);
        assert.equal(wrote.rowCount, 0);
        await assert.rejects(c.query(`INSERT INTO interview.turn (session_id, role, content) VALUES ($1, 'user', 'x')`, [sessionA]),
          /row-level security|does not match/);
      });
      // the same address on a different account does not make alice's rows his (the email is not the identity)
      await asWorker(db.pool, { ...claimsOf(outsider), email: alice.email }, async (c) => {
        for (const t of ['employee', 'session', 'turn', 'insight', 'consent_event', 'memory_blob', 'person']) assert.equal(await count(c, t), 0, t);
      });
    });

    test('system claims keyed to another organisation: 0 rows of round A', async () => {
      const otherOrg = { role: 'interview_worker', scope: 'system', org: '90000000-0000-4000-8000-0000000000aa', customer_id: B.customerId };
      await asWorker(db.pool, otherOrg, async (c) => {
        for (const t of TABLES.filter((x) => hasColumn(x, 'customer_id'))) {
          assert.equal(await count(c, t, `WHERE customer_id = '${A.customerId}'`), 0, `system(B) reads round A ${t}`);
        }
        assert.equal((await c.query(`SELECT enrol_token FROM interview.engagement WHERE id = $1`, [A.id])).rows.length, 0);
        assert.ok(await count(c, 'session') >= 1, 'positive control: its own organisation is visible');
      });
      await asWorker(db.pool, { ...otherOrg, customer_id: A.customerId }, async (c) => {
        assert.ok(await count(c, 'turn') > 0, 'positive control: system(A) sees round A');
      });
    });

    test('HTTP: unauthenticated calls to chat, portal, join enrol and voice start are refused', async () => {
      const chatRes = await h.chat(post('/api/interview/chat', { body: { sessionId: sessionA, content: 'let me in' } }));
      assert.equal(chatRes.status, 401);
      for (const op of ['interview-page', 'session-page', 'start', 'signoff-page', 'results', 'confirm-signoff']) {
        const r = await h.portal(post('/api/interview/portal', { body: { op, args: { sessionId: sessionA } } }));
        assert.equal(r.status, 401, op);
      }
      const enrol = await h.join(post('/api/interview/join', { body: { op: 'enrol', token: A.token, name: 'Eve' } }));
      assert.equal(enrol.status, 401);
      // a bearer the session layer does not know is the same as none
      const forged = await h.chat(post('/api/interview/chat', { body: { sessionId: sessionA }, headers: { authorization: 'Bearer tok:ba-forged' } }));
      assert.equal(forged.status, 401);
      const vs = await h.voiceStart(post('/api/interview/voice/start', { body: { sessionId: sessionA } }));
      assert.equal(vs.status, mode.voice ? 401 : 404, 'voice/start: 401 when voice is on, 404 when it is off');
      // the public join info exposes no personal data and never the token
      const info = await (await h.join(post('/api/interview/join', { body: { op: 'info', token: A.token } }))).json();
      const text = JSON.stringify(info);
      assert.equal(info.data.valid, true);
      assert.ok(!text.includes(alice.email) && !text.includes(A.token) && !text.includes(alice.id), text);
      const bad = await (await h.join(post('/api/interview/join', { body: { op: 'info', token: 'not-a-real-token-at-all' } }))).json();
      assert.deepEqual(bad.data, { valid: false, expired: false });
      // nothing was written by any of it
      assert.equal(db.sql(`SELECT count(*) FROM interview.turn WHERE content = 'let me in'`), '0');
    });

    test(`HTTP: voice think without a valid session bearer is ${mode.voice ? '401' : '404'}`, async () => {
      const url = `https://site.test/api/interview/voice/think?session=${sessionA}`;
      const expect = mode.voice ? 401 : 404;
      const cases = [
        { url, authorization: null },
        { url, authorization: 'Bearer not-the-token' },
        { url, authorization: 'Basic abc' },
        { url: 'https://site.test/api/interview/voice/think', authorization: bearerA ?? 'Bearer x' },
        { url: 'https://site.test/api/interview/voice/think?session=1%27%20or%201%3D1', authorization: bearerA ?? 'Bearer x' },
        // alice's real bearer on bob's session
        { url: `https://site.test/api/interview/voice/think?session=${sessionB}`, authorization: bearerA ?? 'Bearer x' },
      ];
      for (const c of cases) {
        const r = await think(h, c, 'speak for me');
        assert.equal(r.status, expect, `${c.url} ${c.authorization}`);
        assert.equal(r.isSse, false);
      }
      const get = await h.voiceThink(new Request(url, { method: 'GET', headers: { authorization: bearerA ?? 'Bearer x' } }));
      assert.equal(get.status, expect);
      assert.equal(db.sql(`SELECT count(*) FROM interview.turn WHERE content = 'speak for me'`), '0');
    });

    test('the kill switch: with INTERVIEW_ENABLED off every interviewee endpoint answers 404', async () => {
      const off = makeHandlers({ pool: db.pool, env: { ...mode.env, INTERVIEW_ENABLED: '0' }, verify: makeVerify([alice]) });
      assert.equal((await off.chat(post('/api/interview/chat', { user: alice, body: { sessionId: sessionA } }))).status, 404);
      assert.equal((await off.portal(post('/api/interview/portal', { user: alice, body: { op: 'session-page' } }))).status, 404);
      assert.equal((await off.join(post('/api/interview/join', { body: { op: 'info', token: A.token } }))).status, 404);
      assert.equal((await off.voiceStart(post('/api/interview/voice/start', { user: alice, body: { sessionId: sessionA } }))).status, 404);
      assert.equal((await think(off, { url: `https://site.test/api/interview/voice/think?session=${sessionA}`, authorization: bearerA ?? 'Bearer x' }, 'x')).status, 404);
    });
  });
}
