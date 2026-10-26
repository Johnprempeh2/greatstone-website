// Port of the source's scripts/concurrency-verify.mjs (GRE-2612): several TRULY concurrent chat requests with the
// SAME { sessionId, content, clientTurnId } must leave exactly one user turn, at most one agent turn, no duplicated
// insights (the double-extract bug) and at most one extraction ledger row. The requests run through makeChatHandler
// on a pool of real connections, with a fake model slow enough that they overlap inside the handler.
// Added for the website: concurrent enrolment and start for the LAST seat. Enrolment's seat check is a soft one;
// claim_seat() at start is the hard gate, so exactly one of the racing people gets the seat and a session.
// Both modes; in voice mode two racing voice/start calls for one session leave exactly one working bearer.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODES, account, chat, fakeReplyModel, installFakeExtraction, joinAndStart, joinEnrol, makeHandlers, makeVerify, newCustomer, portal,
  seedRound, skip, startInterviewDb, think, thinkTarget, voiceStart,
} from './lib/interview-harness.mjs';
import { EXTRACTION_MODEL } from '../functions/lib/interview/extraction.mjs';

// A content rich enough to extract an insight even early on (the source script's).
const CONTENT = 'Every single day I spend about three hours manually re-keying invoice data from PDF invoices into Sage by hand. It is easily fifteen hours a week and it is the worst, most error-prone part of my job.';
const SCRIPT = [{ text: CONTENT, slots: { pain_mapping: { top_pains_named: 'filled' } },
  insights: [{ type: 'pain', label: 'Manual re-keying of PDF invoices into Sage', quote: 'I spend about three hours manually re-keying invoice data from PDF invoices into Sage by hand', hours: 15 }] }];

let db;
let extraction;
before(async () => {
  if (skip) return;
  db = await startInterviewDb('interview-regress-concurrency');
  // slow enough that every racing request is inside the handler before the first one finishes extracting
  extraction = installFakeExtraction(SCRIPT, { delayMs: 150 });
});
after(async () => { extraction?.reset(); await db?.stop(); });

const n = (q) => Number(db.sql(q));

for (const mode of MODES) {
  describe(`concurrency, ${mode.name}`, { skip }, () => {
    let round, dan, h, sid;

    before(async () => {
      round = seedRound(db.sql, { customerId: newCustomer(db.sql, 'Concurrency') });
      dan = account('dan');
      h = makeHandlers({ pool: db.pool, env: mode.env, verify: makeVerify([dan]), replyModel: fakeReplyModel({ delayMs: 50 }) });
      sid = await joinAndStart(h, dan, round);
      assert.equal((await chat(h, dan, { sessionId: sid })).status, 200); // kickoff: one agent turn
    });

    test('4 concurrent identical requests: one user turn, at most one new agent turn, no duplicate insights, one extraction', async () => {
      const CTID = 'concurrency-probe-1';
      const extractionsBefore = extraction.calls.length;
      const fire = () => chat(h, dan, { sessionId: sid, content: CONTENT, clientTurnId: CTID });
      const results = await Promise.all([fire(), fire(), fire(), fire()]); // no await between them
      const statuses = results.map((r) => r.status);

      assert.equal(n(`SELECT count(*) FROM interview.turn WHERE session_id = '${sid}' AND role = 'user' AND client_turn_id = '${CTID}'`), 1,
        'exactly one user turn for the shared clientTurnId');
      const agentTurns = n(`SELECT count(*) FROM interview.turn WHERE session_id = '${sid}' AND role = 'agent'`);
      assert.ok(agentTurns <= 2, `at most one agent turn beyond the kickoff (agent turns = ${agentTurns})`);
      assert.equal(n(`SELECT count(*) FROM (SELECT label, coalesce(evidence_quote, '') q FROM interview.insight WHERE session_id = '${sid}'
        GROUP BY 1, 2 HAVING count(*) > 1) d`), 0, 'NO duplicated insights (double-extract closed)');
      assert.equal(n(`SELECT count(*) FROM interview.insight WHERE session_id = '${sid}'`), 1);
      assert.ok(n(`SELECT count(*) FROM interview.usage_ledger WHERE session_id = '${sid}' AND model = '${EXTRACTION_MODEL}'`) <= 1,
        'extraction ran at most once (one extraction ledger row)');
      assert.equal(extraction.calls.length - extractionsBefore, 1, 'one extraction model call');
      assert.ok(statuses.includes(200), `at least one request was served 200: ${JSON.stringify(statuses)}`);
      // every loser either replayed the finished reply (200) or was told to retry (409 { retry: true }); none failed
      for (const r of results) {
        if (r.status === 409) assert.deepEqual(r.json, { retry: true });
        else assert.equal(r.status, 200, JSON.stringify(r.json ?? r.error));
        assert.equal(r.error, undefined);
      }
      // a client retry after the race replays the one reply
      const retry = await fire();
      assert.equal(retry.status, 200);
      assert.equal(n(`SELECT count(*) FROM interview.turn WHERE session_id = '${sid}' AND role = 'agent'`), agentTurns);
    });

    test('8 concurrent DIFFERENT turns: each is stored once, the session is never corrupted', async () => {
      const results = await Promise.all(Array.from({ length: 8 }, (_, i) =>
        chat(h, dan, { sessionId: sid, content: `Parallel note number ${i} about month end.`, clientTurnId: `par-${i}` })));
      for (const r of results) assert.ok([200, 409].includes(r.status), JSON.stringify(r.json ?? r.error));
      assert.equal(n(`SELECT count(*) FROM interview.turn WHERE session_id = '${sid}' AND role = 'user' AND client_turn_id LIKE 'par-%'`), 8);
      assert.equal(n(`SELECT count(DISTINCT seq) FROM interview.turn WHERE session_id = '${sid}'`),
        n(`SELECT count(*) FROM interview.turn WHERE session_id = '${sid}'`), 'seq stays a total order');
      assert.equal(db.sql(`SELECT taxonomy_state->>'phase' FROM interview.session WHERE id = '${sid}'`), 'warm_up');
    });

    test('concurrent enrol and start for the last seat: claim_seat lets exactly one through', async () => {
      const last = seedRound(db.sql, { customerId: newCustomer(db.sql, 'One seat'), seatTotal: 1 });
      const people = ['ann', 'ben', 'cat', 'dev'].map((x) => account(x));
      const hl = makeHandlers({ pool: db.pool, env: mode.env, verify: makeVerify(people) });
      const enrolled = await Promise.all(people.map((p) => joinEnrol(hl, p, last.token)));
      const inRound = enrolled.filter((r) => r.body.data?.ok).length;
      // enrolment's own seat check is soft (it counts invited people); at least one gets in, and a late one is refused
      assert.ok(inRound >= 1, JSON.stringify(enrolled.map((r) => r.body)));
      for (const r of enrolled.filter((x) => !x.body.data?.ok)) assert.match(r.body.data.message, /places for this round are currently taken/);
      const members = people.filter((_, i) => enrolled[i].body.data?.ok);
      const started = await Promise.all(members.map((p) => portal(hl, p, 'start', { dataConsent: true })));
      const redirects = started.map((s) => s.body.data?.redirect);
      assert.equal(redirects.filter((r) => r === '#portal/interview/session').length, 1, JSON.stringify(redirects));
      assert.equal(redirects.filter((r) => r === '#portal/interview?seats=exhausted').length, members.length - 1, JSON.stringify(redirects));
      assert.equal(n(`SELECT count(*) FROM interview.employee WHERE engagement_id = '${last.id}' AND status IN ('started', 'completed')`), 1);
      assert.equal(n(`SELECT count(*) FROM interview.session s JOIN interview.employee e ON e.id = s.employee_id WHERE e.engagement_id = '${last.id}'`), 1);
      // a late enrol after the seat is spoken for is refused outright
      const late = account('eve');
      const he = makeHandlers({ pool: db.pool, env: mode.env, verify: makeVerify([late]) });
      const refused = await joinEnrol(he, late, last.token);
      assert.equal(refused.status, 400);
      assert.match(refused.body.data.message, /places for this round are currently taken/);
    });

    test('a double-start race opens one session (the one-active-session index), both land on it', async () => {
      const r = seedRound(db.sql, { customerId: newCustomer(db.sql, 'Double start') });
      const zoe = account('zoe');
      const hz = makeHandlers({ pool: db.pool, env: mode.env, verify: makeVerify([zoe]) });
      assert.equal((await joinEnrol(hz, zoe, r.token)).status, 200);
      const both = await Promise.all([portal(hz, zoe, 'start', { dataConsent: true }), portal(hz, zoe, 'start', { dataConsent: true })]);
      assert.deepEqual(both.map((b) => b.body.data.redirect), ['#portal/interview/session', '#portal/interview/session']);
      assert.equal(n(`SELECT count(*) FROM interview.session WHERE user_id = '${zoe.id}'`), 1);
      assert.equal(n(`SELECT count(*) FROM interview.outbox WHERE engagement_id = '${r.id}' AND idempotency_key LIKE '%:session_start'`), 1);
    });

    test(`racing voice/start calls ${mode.voice ? 'leave exactly one working bearer' : 'are all 404 with voice off'}`, async () => {
      const both = await Promise.all([voiceStart(h, dan, sid), voiceStart(h, dan, sid), voiceStart(h, dan, sid)]);
      if (!mode.voice) {
        assert.deepEqual(both.map((b) => b.status), [404, 404, 404]);
        return;
      }
      assert.deepEqual(both.map((b) => b.status), [200, 200, 200]);
      const targets = both.map((b) => thinkTarget(b.body.settings));
      assert.equal(new Set(targets.map((t) => t.authorization)).size, 3, 'a fresh bearer per start');
      const answers = [];
      for (const t of targets) answers.push((await think(h, t, null)).status);
      assert.equal(answers.filter((s) => s === 200).length, 1, `only the last stored bearer works: ${answers}`);
      assert.equal(answers.filter((s) => s === 401).length, 2);
    });
  });
}
