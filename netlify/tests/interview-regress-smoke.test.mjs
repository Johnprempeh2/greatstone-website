// Port of the source's scripts/interview-smoke.mjs (GRE-2612): a scripted end-to-end interview. The source drove
// /api/chat on a dev server with the x-test-employee-email bypass and seeded the session in SQL. Here the person
// arrives as the website does it: a verified website account joins the round by its token (domain check, seat),
// consents and starts, then the chat is driven through the kickoff and the source's eight scripted turns with a fake
// model until the phases reach sign_off and the session closes; the sign-off read-back is confirmed. Then the checks:
// slot fill, phase advancement, insights, usage_ledger, outbox, consent, and R11 (every row carries the round's
// organisation id and the account's user id).
// Both modes: typed only must complete the whole interview on its own (the Indago fallback); voice on also proves
// voice/start's Settings and the think endpoint (one spoken turn, input_mode 'voice'). A round saved with
// branding_config.voice=false is typed only even when VOICE_ENABLED=1.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODES, SMOKE_SCRIPT, account, chat, installFakeExtraction, joinAndStart, joinEnrol, makeHandlers, makeVerify, newCustomer, portal,
  seedRound, skip, startInterviewDb, think, thinkTarget, voiceStart, post,
} from './lib/interview-harness.mjs';
import { hashSessionToken } from '../functions/lib/interview/voice/session-token.mjs';
import { EXTRACTION_MODEL } from '../functions/lib/interview/extraction.mjs';

let db;
let extraction;
before(async () => {
  if (skip) return;
  db = await startInterviewDb('interview-regress-smoke');
  extraction = installFakeExtraction(SMOKE_SCRIPT);
});
after(async () => { extraction?.reset(); await db?.stop(); });

const PHASES = ['warmup', 'day_in_life', 'pain_mapping', 'automation', 'sign_off'];

for (const mode of MODES) {
  describe(`interview smoke, ${mode.name}`, { skip }, () => {
    let h, round, dan, outsider, wrongDomain, sessionId, customerId, spokenSid;
    const metas = [];

    before(() => {
      customerId = newCustomer(db.sql, `Smoke ${mode.voice ? 'voice' : 'typed'}`);
      round = seedRound(db.sql, { customerId, seatTotal: 3 });
      dan = account('dan');
      outsider = account('olive', { domain: 'elsewhere.test' });
      wrongDomain = outsider;
      h = makeHandlers({ pool: db.pool, env: mode.env, verify: makeVerify([dan, outsider]) });
    });

    test('join: the domain check refuses another domain; a verified work account enrols and takes a seat', async () => {
      const refused = await joinEnrol(h, wrongDomain, round.token);
      assert.equal(refused.status, 400);
      assert.match(refused.body.data.message, /work email \(a example\.test address\)/);
      const info = await h.join(post('/api/interview/join', { body: { op: 'info', token: round.token } }));
      const infoBody = await info.json();
      assert.equal(infoBody.data.valid, true);
      assert.equal(infoBody.data.clientName, 'Example Ltd');

      const welcome = await joinEnrol(h, dan, round.token);
      assert.deepEqual([welcome.status, welcome.body.data.ok, welcome.body.data.redirect], [200, true, '#portal/interview']);
      const page = await portal(h, dan, 'interview-page');
      assert.equal(page.body.data.screen, 'welcome');
      assert.equal(page.body.data.voiceEnabled, mode.voice, 'interview-page offers voice only when voice is on');

      // no consent, no session
      assert.equal((await portal(h, dan, 'start', {})).body.data.redirect, '#portal/interview?consent=required');
      sessionId = await joinAndStart(h, dan, round); // the re-clicked link is a no-op; start consents and claims the seat
      assert.equal(db.sql(`SELECT status FROM interview.employee WHERE user_id = '${dan.id}'`), 'started');
      assert.equal(db.sql(`SELECT count(*) FROM interview.employee WHERE engagement_id = '${round.id}' AND status IN ('started','completed')`), '1');
    });

    test(`session-page says voiceEnabled ${mode.voice}; voice/start ${mode.voice ? 'returns Settings with the stubbed grant' : 'is 404'}`, async () => {
      const page = await portal(h, dan, 'session-page');
      assert.equal(page.body.data.sessionId, sessionId);
      assert.equal(page.body.data.voiceEnabled, mode.voice);
      const vs = await voiceStart(h, dan, sessionId);
      if (!mode.voice) {
        assert.equal(vs.status, 404);
        assert.equal(h.grant.calls.length, 0, 'no Deepgram grant is ever asked for in typed-only mode');
        assert.equal(db.sql(`SELECT coalesce(voice_token_hash, '-') || ' ' || is_voice FROM interview.session WHERE id = '${sessionId}'`), '- false');
        return;
      }
      assert.equal(vs.status, 200, JSON.stringify(vs.body));
      assert.equal(vs.body.deepgramToken, 'dg-grant-1');
      assert.equal(vs.body.expiresIn, 30);
      assert.deepEqual(h.grant.calls, ['dg-fake-key-for-tests']);
      assert.equal(vs.body.settings.type, 'Settings');
      assert.equal(vs.body.settings.mip_opt_out, true);
      assert.equal(vs.body.settings.agent.speak.provider.model, 'aura-2-draco-en');
      const target = thinkTarget(vs.body.settings);
      assert.equal(target.url, `https://site.test/api/interview/voice/think?session=${sessionId}`);
      const bearer = target.authorization.replace(/^Bearer /, '');
      assert.equal(db.sql(`SELECT voice_token_hash || ' ' || is_voice FROM interview.session WHERE id = '${sessionId}'`),
        `${hashSessionToken(bearer)} true`, 'only the hash of the per-session bearer is stored');
      assert.ok(!JSON.stringify(vs.body).includes('dg-fake-key-for-tests'), 'the Deepgram key never reaches the browser');
    });

    test('drive the interview: kickoff + scripted turns until the phases reach sign_off and the session closes', async () => {
      const kickoff = await chat(h, dan, { sessionId });
      assert.equal(kickoff.status, 200);
      assert.equal(kickoff.meta.phase, 'warmup');
      assert.equal(kickoff.meta.userTurnId, null);
      assert.ok(kickoff.reply.length > 0);
      assert.equal(kickoff.done.complete, false);

      let target = null;
      if (mode.voice) target = thinkTarget((await voiceStart(h, dan, sessionId)).body.settings);
      for (const [i, entry] of SMOKE_SCRIPT.entries()) {
        if (mode.voice && i === 0) {
          // the warm-up answer is spoken: Deepgram calls think with the session bearer
          const spoken = await think(h, target, entry.text);
          assert.equal(spoken.status, 200);
          assert.equal(spoken.isSse, true);
          assert.equal(spoken.frames.at(-1), '[DONE]');
          assert.ok(spoken.spoken.trim().length > 0);
          metas.push({ turn: 1, phase: db.sql(`SELECT phase FROM interview.session WHERE id = '${sessionId}'`), complete: false });
          continue;
        }
        const turn = await chat(h, dan, { sessionId, content: entry.text, clientTurnId: `smoke-${i + 1}` });
        assert.equal(turn.status, 200, JSON.stringify(turn.json ?? turn.error));
        assert.equal(turn.error, undefined);
        metas.push({ turn: i + 1, phase: turn.done.phase, changed: turn.meta.phaseChanged, complete: turn.done.complete });
      }
      assert.deepEqual(metas.map((m) => m.phase), ['day_in_life', 'pain_mapping', 'pain_mapping', 'automation', 'sign_off', 'sign_off', 'sign_off', 'sign_off']);
      assert.deepEqual(metas.map((m) => m.complete), [false, false, false, false, false, false, false, true]);
      // every phase visited, in order
      assert.deepEqual([...new Set(['warmup', ...metas.map((m) => m.phase)])], PHASES);
    });

    test('state after the run: every slot filled, phase sign_off, session ended, employee completed', async () => {
      const s = JSON.parse(db.sql(`SELECT json_build_object('phase', phase, 'ended', ended_at IS NOT NULL, 'resumable', resumable,
        'score', completion_score, 'state', taxonomy_state) FROM interview.session WHERE id = '${sessionId}'`));
      assert.equal(s.phase, 'sign_off');
      assert.equal(s.ended, true);
      assert.equal(s.resumable, false);
      assert.equal(Number(s.score), 1);
      const slots = Object.values(s.state.slots).flatMap((p) => Object.values(p));
      assert.equal(slots.length, 19);
      assert.deepEqual([...new Set(slots)], ['filled'], JSON.stringify(s.state.slots));
      assert.equal(s.state.phase, 'sign_off');
      assert.equal(s.state.insights_extracted, 4);
      assert.equal(db.sql(`SELECT status FROM interview.employee WHERE user_id = '${dan.id}'`), 'completed');
      // the source's report: turns by role (kickoff + 8 replies; 8 user turns)
      assert.equal(db.sql(`SELECT string_agg(role || '=' || n, ',' ORDER BY role) FROM (SELECT role::text, count(*) n
        FROM interview.turn WHERE session_id = '${sessionId}' GROUP BY role) t`), 'agent=9,user=8');
      const voiceTurns = db.sql(`SELECT count(*) FROM interview.turn WHERE session_id = '${sessionId}' AND input_mode = 'voice'`);
      assert.equal(voiceTurns, mode.voice ? '2' : '0', 'think writes the spoken user turn and the spoken reply as input_mode voice');
      if (mode.voice) {
        assert.equal(db.sql(`SELECT string_agg(role::text, ',' ORDER BY seq) FROM interview.turn WHERE session_id = '${sessionId}' AND input_mode = 'voice'`), 'user,agent');
      }
      // a finished interview takes no more chat
      const late = await chat(h, dan, { sessionId, content: 'one more thing' });
      assert.deepEqual([late.status, late.json.complete], [409, true]);
      if (mode.voice) {
        assert.equal((await voiceStart(h, dan, sessionId)).status, 409);
      }
    });

    test('insights: the four verbatim findings, typed and costed as extracted', async () => {
      const rows = JSON.parse(db.sql(`SELECT json_agg(json_build_object('type', type, 'label', label, 'q', evidence_quote, 'h', time_per_week_hours)
        ORDER BY label) FROM interview.insight WHERE session_id = '${sessionId}'`));
      assert.deepEqual(rows.map((r) => r.type).sort(), ['automation_candidate', 'pain', 'pain', 'task']);
      const all = SMOKE_SCRIPT.map((e) => e.text).join('\n');
      for (const r of rows) assert.ok(all.includes(r.q), `quote is verbatim: ${r.q}`);
      assert.equal(rows.find((r) => r.label === 'Manual invoice keying into Sage').h, 10);
    });

    test('usage_ledger: one extraction row per user turn, one reply row per agent turn, costed', async () => {
      const usage = JSON.parse(db.sql(`SELECT json_object_agg(model, n) FROM (SELECT model, count(*) n FROM interview.usage_ledger
        WHERE session_id = '${sessionId}' GROUP BY model) u`));
      // extraction once per user turn (8); the typed reply model for the kickoff and every typed answer; in voice mode
      // the spoken answer's reply is on the voice model (Haiku, the same model id as extraction by default)
      const expected = {};
      const add = (model, n) => { expected[model] = (expected[model] ?? 0) + n; };
      add(EXTRACTION_MODEL, 8);
      add(process.env.INTERVIEW_MODEL ?? 'claude-sonnet-4-6', mode.voice ? 8 : 9);
      if (mode.voice) add(process.env.VOICE_INTERVIEW_MODEL ?? 'claude-haiku-4-5', 1);
      assert.deepEqual(usage, expected);
      assert.ok(Number(db.sql(`SELECT sum(cost_pence) FROM interview.usage_ledger WHERE session_id = '${sessionId}'`)) > 0);
      assert.equal(db.sql(`SELECT count(*) FROM interview.usage_ledger WHERE session_id = '${sessionId}' AND engagement_id <> '${round.id}'`), '0');
    });

    test('sign-off: the read-back pre-selects the answers given in the chat; confirm appends the consent pair and the memory', async () => {
      const page = await portal(h, dan, 'signoff-page');
      assert.deepEqual(page.body.data, { sessionId, initialAttribution: 'named', initialMemory: true });
      assert.equal((await portal(h, dan, 'interview-page')).body.data.redirect, '#portal/interview/complete');
      const bad = await portal(h, dan, 'confirm-signoff', { sessionId, attribution: 'maybe', memory: true });
      assert.equal(bad.body.data.ok, false);
      const ok = await portal(h, dan, 'confirm-signoff', { sessionId, attribution: 'named', memory: true });
      assert.deepEqual(ok.body.data, { ok: true });
      // consent events: participation at start, attribution + memory from the chat, the authoritative pair at confirm
      assert.equal(db.sql(`SELECT string_agg(kind || ':' || value, ',' ORDER BY ts, kind) FROM interview.consent_event
        WHERE user_id = '${dan.id}'`), 'participation:true,attribution:true,memory_opt_in:true,attribution:true,memory_opt_in:true');
      assert.equal(db.sql(`SELECT count(*) FROM interview.insight WHERE session_id = '${sessionId}' AND attribution_redacted`), '0');
      assert.equal(db.sql(`SELECT opted_in || ' ' || (expires_at > now() + interval '23 months') FROM interview.memory_blob
        WHERE user_id = '${dan.id}' AND customer_id = '${customerId}'`), 'true true');
      // a correction on the read-back goes through the real extraction path
      const corr = await portal(h, dan, 'submit-correction', { sessionId, text: 'Actually it is closer to twelve hours a week on invoices.' });
      assert.deepEqual(corr.body.data, { ok: true, insightsAdded: 0 });
    });

    test('outbox: session_start, one phase_complete per phase finished, session_end with the transcript', async () => {
      const keys = db.sql(`SELECT string_agg(idempotency_key, ',' ORDER BY created_at, idempotency_key) FROM interview.outbox
        WHERE engagement_id = '${round.id}'`).split(',').map((k) => k.replace(`${sessionId}:`, ''));
      assert.deepEqual(keys.filter((k) => k.startsWith('phase_complete')).sort(),
        ['phase_complete:automation', 'phase_complete:day_in_life', 'phase_complete:pain_mapping', 'phase_complete:warmup']);
      assert.ok(keys.includes('session_start') && keys.includes('session_end'), keys.join(','));
      assert.ok(keys.some((k) => k.startsWith('correction:')), 'the sign-off correction is snapshotted');
      const end = JSON.parse(db.sql(`SELECT payload FROM interview.outbox WHERE idempotency_key = '${sessionId}:session_end'`));
      assert.equal(end.transcript.length, 17);
      assert.equal(end.insights.length, 4);
    });

    test('R11: every row written carries the round\'s organisation id and the account\'s user id', async () => {
      const tables = db.sql(`SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.columns
        WHERE table_schema = 'interview' AND column_name = 'customer_id'`).split(',');
      const withUser = new Set(db.sql(`SELECT string_agg(table_name, ',') FROM information_schema.columns
        WHERE table_schema = 'interview' AND column_name = 'user_id'`).split(','));
      const written = {};
      for (const t of tables) {
        assert.equal(db.sql(`SELECT count(*) FROM interview.${t} WHERE customer_id IS NULL`), '0', `${t}: null customer_id`);
        written[t] = Number(db.sql(`SELECT count(*) FROM interview.${t} WHERE customer_id = '${customerId}'`));
        if (withUser.has(t)) {
          // every row of this organisation is the account's (it is the only person in it), and none of the account's is elsewhere
          assert.equal(db.sql(`SELECT count(*) FROM interview.${t} WHERE customer_id = '${customerId}' AND user_id IS DISTINCT FROM '${dan.id}'`),
            '0', `${t}: a row of this organisation with another user id`);
          assert.equal(db.sql(`SELECT count(*) FROM interview.${t} WHERE user_id = '${dan.id}' AND customer_id <> '${customerId}'`), '0', t);
        }
      }
      for (const t of ['employee', 'session', 'turn', 'insight', 'consent_event', 'usage_ledger', 'outbox', 'memory_blob', 'audit_log']) {
        assert.ok(written[t] > 0, `${t} has rows for the round`);
      }
      // and the session's children all point at the round's organisation
      for (const t of ['turn', 'insight', 'usage_ledger']) {
        assert.equal(db.sql(`SELECT count(*) FROM interview.${t} WHERE session_id = '${sessionId}' AND customer_id <> '${customerId}'`), '0', t);
      }
      assert.equal(db.sql(`SELECT count(*) FROM interview.person WHERE auth_user_id = '${dan.id}'`), '1');
    });

    // Voice mode only. Every scripted answer is spoken; the phases advance through think exactly as typed, the spoken
    // consent answers are recorded, and on sign-off the session closes itself (turn-effects.mjs, shared with chat).
    test('a wholly spoken interview advances every phase through think', { skip: !mode.voice && 'voice mode only' }, async () => {
      const vic = account('vic');
      const hv = makeHandlers({ pool: db.pool, env: mode.env, verify: makeVerify([vic]) });
      const sid = await joinAndStart(hv, vic, seedRound(db.sql, { customerId: newCustomer(db.sql, 'Spoken') }));
      spokenSid = sid;
      const target = thinkTarget((await voiceStart(hv, vic, sid)).body.settings);
      assert.equal((await think(hv, target, null)).status, 200, 'a contentless think is the spoken kickoff');
      const phases = [];
      for (const entry of SMOKE_SCRIPT) {
        assert.equal((await think(hv, target, entry.text)).status, 200);
        phases.push(db.sql(`SELECT phase FROM interview.session WHERE id = '${sid}'`));
      }
      assert.deepEqual(phases, ['day_in_life', 'pain_mapping', 'pain_mapping', 'automation', 'sign_off', 'sign_off', 'sign_off', 'sign_off']);
      assert.equal(db.sql(`SELECT count(*) FROM interview.turn WHERE session_id = '${sid}' AND input_mode = 'voice'`), '17');
      assert.equal(db.sql(`SELECT string_agg(kind || ':' || value, ',' ORDER BY ts) FROM interview.consent_event WHERE user_id = '${vic.id}'`),
        'participation:true,attribution:true,memory_opt_in:true', 'spoken consent answers are recorded as typed ones are');
      assert.equal(db.sql(`SELECT count(*) FROM interview.insight WHERE session_id = '${sid}'`), '4');
    });

    test('a wholly spoken interview closes itself once both consent answers are spoken',
      { skip: !mode.voice && 'voice mode only' }, async () => {
        const sid = spokenSid;
        assert.equal(db.sql(`SELECT ended_at IS NOT NULL FROM interview.session WHERE id = '${sid}'`), 't');
        assert.equal(db.sql(`SELECT e.status FROM interview.employee e JOIN interview.session s ON s.employee_id = e.id WHERE s.id = '${sid}'`), 'completed');
      });

    test('a round saved with branding_config.voice=false is typed only, whatever VOICE_ENABLED says', async () => {
      const typedRound = seedRound(db.sql, { customerId: newCustomer(db.sql, 'Typed only round'), voice: false });
      const tess = account('tess');
      const ht = makeHandlers({ pool: db.pool, env: mode.env, verify: makeVerify([tess]) });
      const sid = await joinAndStart(ht, tess, typedRound);
      assert.equal((await portal(ht, tess, 'session-page')).body.data.voiceEnabled, false);
      assert.equal((await portal(ht, tess, 'interview-page')).body.data.redirect, '#portal/interview/session');
      assert.equal((await voiceStart(ht, tess, sid)).status, 404);
      assert.equal(ht.grant.calls.length, 0);
      // a bearer minted before GSAM switched the round to typed no longer drives a spoken turn
      const bearer = 'stale-voice-bearer-from-before-the-switch';
      db.sql(`UPDATE interview.session SET voice_token_hash = '${hashSessionToken(bearer)}' WHERE id = '${sid}'`);
      const spoken = await think(ht, { url: `https://site.test/api/interview/voice/think?session=${sid}`, authorization: `Bearer ${bearer}` }, 'hello?');
      if (mode.voice) {
        assert.equal(spoken.status, 200);
        assert.match(spoken.spoken, /Voice is switched off for now/);
      } else {
        assert.equal(spoken.status, 404);
      }
      assert.equal(db.sql(`SELECT count(*) FROM interview.turn WHERE session_id = '${sid}'`), '0');
      // and the typed interview still runs on it
      const kickoff = await chat(ht, tess, { sessionId: sid });
      assert.equal(kickoff.status, 200);
      assert.equal(kickoff.done.complete, false);
    });
  });
}
