// Port of the source's scripts/adversarial-chat.mjs (GRE-2612): an attack battery against the chat endpoint, now
// /api/interview/chat through makeChatHandler with the Better Auth session faked through `verify` (the source used
// its dev-only x-test-employee-email header). Auth and ownership, malformed input, idempotency edge cases, plus the
// hard token cap (429) and the per-session rate limit. Cheap by design: a fake model, and only a few cases reach it.
// Both modes; in voice mode the same ownership battery runs against voice/start.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODES, account, asWorker, chat, installFakeExtraction, joinAndStart, joinEnrol, makeHandlers, makeVerify, newCustomer, post,
  seedRound, skip, startInterviewDb, voiceStart,
} from './lib/interview-harness.mjs';

let db;
let extraction;
before(async () => {
  if (skip) return;
  db = await startInterviewDb('interview-regress-adversarial');
  extraction = installFakeExtraction([]);
});
after(async () => { extraction?.reset(); await db?.stop(); });

const userTurns = (sid, where = '') => Number(db.sql(`SELECT count(*) FROM interview.turn WHERE session_id = '${sid}' AND role = 'user' ${where}`));

for (const mode of MODES) {
  describe(`adversarial chat, ${mode.name}`, { skip }, () => {
    let h, round, owner, other, nobody, unverified, capped, sid, otherSid, cappedSid;

    before(async () => {
      round = seedRound(db.sql, { customerId: newCustomer(db.sql, 'Adversarial') });
      owner = account('dan');
      other = account('amara'); // a different employee of the same round: must NOT reach owner's session
      nobody = account('nobody'); // a verified account on no round
      unverified = account('ursula', { verified: false });
      capped = account('carl');
      h = makeHandlers({ pool: db.pool, env: mode.env, verify: makeVerify([owner, other, nobody, unverified, capped]) });
      sid = await joinAndStart(h, owner, round);
      otherSid = await joinAndStart(h, other, round);
      cappedSid = await joinAndStart(h, capped, round);
      assert.equal((await chat(h, owner, { sessionId: sid })).status, 200); // kickoff
    });

    test('cross-user session access is denied (404, the session is not theirs), and nothing is written', async () => {
      const before = userTurns(sid);
      const x = await chat(h, other, { sessionId: sid, content: 'let me in' });
      assert.ok(x.status === 404 || x.status === 403, `status ${x.status}`);
      assert.equal(x.status, 404);
      assert.equal(userTurns(sid), before);
      assert.equal(userTurns(otherSid), 0, 'nor is it written into the attacker\'s own session');
    });

    test('a verified account with no employee row is 403; an unverified email is 403; no session is 401', async () => {
      assert.equal((await chat(h, nobody, { sessionId: sid, content: 'hi' })).status, 403);
      const u = await chat(h, unverified, { sessionId: sid, content: 'hi' });
      assert.equal(u.status, 403);
      assert.match(u.json.error, /verify your email/);
      assert.equal((await chat(h, null, { sessionId: sid, content: 'hi' })).status, 401);
      // the portal and the join answer an unverified email the same way
      assert.equal((await h.portal(post('/api/interview/portal', { user: unverified, body: { op: 'session-page' } }))).status, 403);
      const j = await joinEnrol(h, unverified, round.token);
      assert.deepEqual([j.status, j.body.unverified], [403, true]);
    });

    test('malformed input: bad JSON 400, missing or non-string sessionId 400, non-uuid ids 404 (never a 500)', async () => {
      const raw = async (body) => (await h.chat(post('/api/interview/chat', { user: owner, raw: body }))).status;
      assert.equal(await raw('{not json'), 400);
      assert.equal(await raw(''), 400);
      assert.equal((await chat(h, owner, { content: 'hi' })).status, 400);
      assert.equal((await chat(h, owner, { sessionId: 42, content: 'hi' })).status, 400);
      assert.equal((await chat(h, owner, { sessionId: ['x'], content: 'hi' })).status, 400);
      for (const bad of ['not-a-uuid', "' OR 1=1 --", `${sid}x`, sid.replace(/-/g, '')]) {
        assert.equal((await chat(h, owner, { sessionId: bad, content: 'hi' })).status, 404, bad);
      }
      assert.equal((await chat(h, owner, { sessionId: '00000000-0000-0000-0000-0000000000ff', content: 'hi' })).status, 404);
      // the portal and the join refuse unknown ops and malformed bodies
      assert.equal((await h.portal(post('/api/interview/portal', { user: owner, raw: '{nope' }))).status, 400);
      assert.equal((await h.portal(post('/api/interview/portal', { user: owner, body: { op: '__proto__' } }))).status, 400);
      assert.equal((await h.portal(post('/api/interview/portal', { user: owner, body: { op: 'start', args: [] } }))).status, 400);
      assert.equal((await h.join(post('/api/interview/join', { user: owner, body: { op: 'drop' } }))).status, 400);
      // a non-string content is a kickoff/recovery, not an error: the last turn is the agent's, so it replays
      const calls = h.replyModel.calls.length;
      const obj = await chat(h, owner, { sessionId: sid, content: { $gt: '' } });
      assert.equal(obj.status, 200);
      assert.equal(h.replyModel.calls.length, calls, 'a redundant kickoff replays the last reply with no model call');
    });

    test('oversize input: the portal and join bodies are capped; a long clientTurnId is truncated to 100 chars', async () => {
      const big = 'x'.repeat(20_000);
      assert.equal((await h.portal(post('/api/interview/portal', { user: owner, body: { op: 'session-page', args: { big } },
        headers: { 'content-length': String(big.length + 50) } }))).status, 400);
      assert.equal((await h.join(post('/api/interview/join', { user: owner, body: { op: 'enrol', token: round.token, name: big },
        headers: { 'content-length': String(big.length + 50) } }))).status, 400);
      const ctid = 'c'.repeat(5000);
      const r = await chat(h, owner, { sessionId: sid, content: 'A long key should not be stored whole.', clientTurnId: ctid });
      assert.equal(r.status, 200);
      assert.equal(db.sql(`SELECT length(client_turn_id) FROM interview.turn WHERE session_id = '${sid}' AND client_turn_id LIKE 'ccc%'`), '100');
      // a sign-off correction is capped at 2000 characters (complete/actions.ts MAX_CORRECTION_CHARS)
    });

    // The source /api/chat had no cap; the port refuses a message over 8000 characters (413), as portal and join bodies are capped.
    test('oversize content is refused before it is stored or sent to a model', async () => {
      const huge = `${'I spend hours keying invoices. '.repeat(7000)}`;
      const r = await chat(h, owner, { sessionId: sid, content: huge, clientTurnId: 'huge-1' });
      assert.ok(r.status === 400 || r.status === 413, `status ${r.status}`);
    });

    test('idempotency: reusing a clientTurnId with different content dedupes to the FIRST turn and replays its reply', async () => {
      const ctid = 'adv-reuse-1';
      const first = await chat(h, owner, { sessionId: sid, content: 'FIRST content stored', clientTurnId: ctid });
      assert.equal(first.status, 200);
      const calls = h.replyModel.calls.length;
      const extractions = extraction.calls.length;
      const second = await chat(h, owner, { sessionId: sid, content: 'SECOND content should be ignored', clientTurnId: ctid });
      assert.equal(second.status, 200);
      assert.equal(second.reply, first.reply, 'the finished reply is replayed');
      assert.equal(second.meta.userTurnId, first.meta.userTurnId);
      assert.equal(h.replyModel.calls.length, calls, 'no model call for the replay');
      assert.equal(extraction.calls.length, extractions, 'no second extraction for the replay');
      const rows = db.sql(`SELECT string_agg(content, '|') FROM interview.turn WHERE session_id = '${sid}' AND role = 'user' AND client_turn_id = '${ctid}'`);
      assert.equal(rows, 'FIRST content stored', 'one turn, first content kept');
      assert.equal(userTurns(sid, `AND content LIKE 'SECOND%'`), 0, 'ignored content not stored as a separate turn');
      // the same clientTurnId in ANOTHER session is that session's own key, not a collision
      const elsewhere = await chat(h, other, { sessionId: otherSid, content: 'Mine, not a replay', clientTurnId: ctid });
      assert.equal(elsewhere.status, 200);
      assert.equal(userTurns(otherSid, `AND client_turn_id = '${ctid}'`), 1);
    });

    test('hard token cap: a session at 1.5x its token budget answers 429 complete and writes nothing', async () => {
      db.sql(`INSERT INTO interview.usage_ledger (session_id, engagement_id, model, input_tokens, output_tokens, cost_pence)
        VALUES ('${cappedSid}', '${round.id}', 'claude-sonnet-4-6', 590000, 10000, 1)`);
      const calls = h.replyModel.calls.length;
      const r = await chat(h, capped, { sessionId: cappedSid, content: 'Still going, keep talking.' });
      assert.equal(r.status, 429);
      assert.equal(r.json.complete, true);
      assert.match(r.json.error, /length limit/);
      assert.equal(userTurns(cappedSid), 0);
      assert.equal(h.replyModel.calls.length, calls);
      // just under the cap still talks (the steering line wraps up instead)
      const under = makeHandlers({ pool: db.pool, env: { ...mode.env, CHAT_HARD_BUDGET_RATIO: '2' }, verify: makeVerify([capped]) });
      assert.equal((await chat(under, capped, { sessionId: cappedSid })).status, 200);
    });

    test('rate limit: past CHAT_RATE_SESSION_PER_MIN in a minute answers 429 before any model work', async () => {
      const rl = account('rita');
      const hr = makeHandlers({ pool: db.pool, env: { ...mode.env, CHAT_RATE_SESSION_PER_MIN: '2' }, verify: makeVerify([rl]) });
      const rsid = await joinAndStart(hr, rl, round);
      // five requests against a limit of two: even if a one-minute window boundary falls between them, at least three
      // land in one window, so at least one is refused
      const statuses = [];
      for (let i = 0; i < 5; i++) statuses.push((await chat(hr, rl, { sessionId: rsid, content: `quick message ${i}`, clientTurnId: `rl-${i}` })).status);
      assert.ok(statuses.includes(429), JSON.stringify(statuses));
      assert.ok(statuses.filter((s) => s === 200).length <= 4, JSON.stringify(statuses));
      assert.equal(userTurns(rsid), statuses.filter((s) => s === 200).length, 'a refused request stores no turn');
    });

    test(`voice/start ownership: ${mode.voice ? 'another user\'s session 404, bad input 400/404' : 'always 404 with voice off'}`, async () => {
      const x = await voiceStart(h, other, sid);
      assert.equal(x.status, 404);
      assert.equal((await voiceStart(h, nobody, sid)).status, mode.voice ? 403 : 404);
      assert.equal((await voiceStart(h, unverified, sid)).status, mode.voice ? 403 : 404);
      assert.equal((await voiceStart(h, owner, 'not-a-uuid')).status, 404);
      const badJson = await h.voiceStart(post('/api/interview/voice/start', { user: owner, raw: '{nope' }));
      assert.equal(badJson.status, mode.voice ? 400 : 404);
      assert.equal(db.sql(`SELECT count(*) FROM interview.session WHERE id = '${sid}' AND voice_token_hash IS NOT NULL`), '0');
      if (mode.voice) assert.equal(h.grant.calls.length, 0, 'no Deepgram grant is minted for a refused caller');
    });

    // Found while porting the probe's claim_seat RPC check: claim_seat() is SECURITY DEFINER, so it now checks that
    // p_employee_id is the caller's own row (participant) or in the caller's organisation (bridge).
    test('claim_seat refuses a participant claiming a seat for somebody else\'s employee row', async () => {
        const victim = account('vic');
        const hv = makeHandlers({ pool: db.pool, env: mode.env, verify: makeVerify([victim]) });
        assert.equal((await joinEnrol(hv, victim, round.token)).status, 200);
        const victimEmployee = db.sql(`SELECT id FROM interview.employee WHERE user_id = '${victim.id}'`);
        const attacker = { role: 'interview_worker', scope: 'participant', sub: other.id, email: other.email, email_verified: true };
        await assert.rejects(asWorker(db.pool, attacker, (c) => c.query('SELECT interview.claim_seat($1)', [victimEmployee])));
        assert.equal(db.sql(`SELECT status FROM interview.employee WHERE id = '${victimEmployee}'`), 'invited');
      });
  });
}
