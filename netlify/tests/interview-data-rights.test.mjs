// GRE-2653: interview data rights in the engine port. The six "Done when" checks of the `retention-rights-regions`
// document on GRE-2639, against a real Postgres with every migration applied and a fake synthesis model:
//   1. region facts in code: Deepgram EU hosts (Netlify and database regions are deploy facts, reported on GRE-2639)
//   2. a round with retention_days = 0 deletes everything listed, keeps only consent_event and content-free
//      usage_ledger, and leaves the anonymised themes copy
//   3. a participant sees and downloads only their own data; a client admin cannot see it
//   4. delete removes the person, and a re-run synthesis has none of their quotes or single-voice themes
//   5. "No quotes" leaves no verbatim text from that person in the synthesis
//   6. mip_opt_out: true stays in the voice settings
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';
import { interviewDb } from '../functions/lib/interview/db.mjs';
import { seeMyInterviewData, deleteMyInterviewData, withdrawFromSynthesis } from '../functions/lib/interview/self-service.mjs';
import { anonymisedCopy, deletionDate, dueForRetention } from '../functions/lib/interview/retention.mjs';
import { retentionRun } from '../functions/interview-retention.mjs';
import { makeMyDataHandler } from '../functions/interview-my-data.mjs';
import { setSynthesisClient } from '../functions/lib/interview/synthesis/model.mjs';
import { runSynthesisStep } from '../functions/lib/interview/synthesis/pipeline.mjs';
import { releaseSynthesis } from '../functions/lib/interview/synthesis/release.mjs';
import { applySignOffConsent } from '../functions/lib/interview/memory.mjs';
import { scrubVerbatim, WITHHELD } from '../functions/lib/interview/quotes.mjs';
import { buildVoiceSettings } from '../functions/lib/interview/voice/settings.mjs';
import { DEEPGRAM_AGENT_URL, DEEPGRAM_GRANT_URL } from '../functions/lib/interview/voice/regions.mjs';
import { interviewNotice, QUOTE_OPTIONS } from '../../src/portal/interview-notice.mjs';

const id = (prefix, n) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = id('0a', 1);
const S = id('e2', 1); // self-service and synthesis round
const R = id('e2', 2); // retention round
const OTHER = id('e2', 3); // untouched round (bounds)
const user = (n, email) => ({ id: id('f2', n), email });
const ALICE = user(1, 'alice@client.test'), BOB = user(2, 'bob@client.test'), CAROL = user(3, 'carol@client.test');
const DANA = user(4, 'dana@client.test'), STRANGER = user(9, 'stranger@client.test');

const QA = 'every single week I lose most of Monday to keying supplier invoices by hand into the ledger';
const QC = 'I re-key the same supplier invoices into the ledger because nothing talks to anything else here';
const QB = 'the approvals sit in somebody inbox for days before anyone even looks at them properly';
const QD = 'waiting on approvals from the regional manager holds up every purchase order we raise';
const QR = 'the month end close takes three full days because every report is rebuilt by hand';

let db;
let pool;
function sql(text) {
  const r = db.psql(text);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
const n = (text) => Number(sql(text));

// ── seed ─────────────────────────────────────────────────────────────────────────────────────────────
function seedRound(eng, people, extra = '') {
  const rows = people.map((p, i) => {
    const e = id(eng.slice(0, 2) === 'e2' ? `c${eng.at(-1)}` : 'c9', i + 1);
    const s = id(`d${eng.at(-1)}`, i + 1);
    return { ...p, e, s, ins: id(`b${eng.at(-1)}`, i + 1) };
  });
  sql(`SET search_path TO interview, public;
    ${rows.map((p) => `
    INSERT INTO person (person_id, verified_email) VALUES ('${p.e.replace(/^c/, 'a')}', '${p.u.email}') ON CONFLICT DO NOTHING;
    INSERT INTO employee (id, engagement_id, person_id, name, email, role_title, portal_role, status, quote_choice)
      VALUES ('${p.e}', '${eng}', (SELECT person_id FROM person WHERE verified_email = '${p.u.email}'), '${p.name}', '${p.u.email}',
        'Clerk', '${p.role ?? 'employee'}', 'completed', ${p.choice ? `'${p.choice}'` : 'NULL'});
    INSERT INTO session (id, employee_id, started_at, ended_at, phase) VALUES ('${p.s}', '${p.e}', now() - interval '2 days',
      now() - interval '1 day', 'sign_off');
    INSERT INTO turn (session_id, role, content) VALUES ('${p.s}', 'agent', 'What slows your week down?'),
      ('${p.s}', 'user', 'Honestly, ${p.q}.');
    INSERT INTO insight (id, session_id, type, label, evidence_quote, confidence, attribution_redacted, time_per_week_hours)
      VALUES ('${p.ins}', '${p.s}', 'pain', '${p.label}', '${p.q}', 0.9, ${p.choice !== 'named'}, 4);
    INSERT INTO consent_event (employee_id, kind, value) VALUES ('${p.e}', 'participation', true);
    INSERT INTO usage_ledger (session_id, engagement_id, model, input_tokens, output_tokens, cost_pence) VALUES ('${p.s}', '${eng}', 'm', 10, 5, 1);
    INSERT INTO memory_blob (person_id, blob, opted_in, expires_at) SELECT person_id, '{"top_pains":[]}', true, now() + interval '1 year'
      FROM person WHERE verified_email = '${p.u.email}' ON CONFLICT DO NOTHING;
    INSERT INTO outbox (idempotency_key, engagement_id, payload) VALUES ('${p.s}:session_end', '${eng}', '{"transcript":"${p.q}"}');
    `).join('')}
    ${extra}`);
  return rows;
}

let sPeople;
let rPeople;
before(async () => {
  if (skip) return;
  db = startPostgres('interview-rights');
  await db.migrate();
  pool = new pg.Pool({ connectionString: db.url, max: 4 });
  sql(`SET search_path TO interview, public;
    INSERT INTO engagement (id, client_name, org_id, seat_total, readout_at, retention_days) VALUES
      ('${S}', 'Round S', '${ORG}', 10, now() + interval '7 days', 90),
      ('${R}', 'Round R', '${ORG}', 10, now() - interval '1 hour', 0),
      ('${OTHER}', 'Round O', '${ORG}', 10, now() - interval '1 hour', 90);`);
  sPeople = seedRound(S, [
    { name: 'Alice Archer', u: ALICE, choice: 'named', q: QA, label: 'Invoices keyed by hand' },
    { name: 'Bob Baker', u: BOB, choice: 'anonymous', q: QB, label: 'Approvals stall' },
    { name: 'Carol Cole', u: CAROL, choice: null, role: 'client_admin', q: QC, label: 'Invoices re-keyed' },
    { name: 'Dana Drew', u: DANA, choice: 'named', q: QD, label: 'Approvals hold up orders' },
  ]);
  rPeople = seedRound(R, [
    { name: 'Rhys Rowe', u: user(5, 'rhys@client.test'), choice: 'named', q: QR, label: 'Month end rebuilt by hand' },
    { name: 'Rose Reid', u: user(6, 'rose@client.test'), choice: 'none', q: QA, label: 'Invoices keyed by hand' },
  ], `INSERT INTO synthesis (engagement_id, version, themes, hot_spots, recommendations, follow_ups, headline_read) VALUES ('${R}', 1,
      '[{"theme_id":"t1","title":"Manual re-keying","statement":"Rhys Rowe said ${QR}","scope":"team_local","distinct_voices":2,
         "confidence":0.8,"supporting_insight_ids":["${id('b2', 1)}"],"evidence_quotes":[{"insight_id":"${id('b2', 1)}","quote":"${QR}","attribution":"Rhys Rowe, Clerk"}]}]',
      '[{"team":"Finance","first_hand_hours_per_week":8,"respondents":2,"top_drivers":[{"label":"x","insight_id":"${id('b2', 1)}"}],"local_themes":[]}]',
      '[{"rec_id":"r1","title":"Automate the close for Rhys","impact":4,"feasibility":3,"estimated_hours_per_week":8,"affected_teams":["Finance"],
         "evidence_quotes":[{"insight_id":"${id('b2', 1)}","quote":"${QR}"}]}]',
      '[{"employee_id":"${id('c2', 1)}","display_name":"Rhys Rowe","question":"q"}]', '{"text":"Rhys Rowe: ${QR}"}');
    INSERT INTO synthesis_cache (engagement_id, kind, key, fingerprint, payload, model) VALUES ('${R}', 'session', '${id('d2', 1)}', 'f', '{"q":"${QR}"}', 'm');
    INSERT INTO synthesis_run (engagement_id, actor) VALUES ('${R}', 'gsam');
    INSERT INTO audit_log (engagement_id, actor_email, action, summary) VALUES ('${R}', 'rhys@client.test', 'session.closed_out', 'Rhys');
    INSERT INTO seat_request (engagement_id, requested_by, seats) VALUES ('${R}', '${id('c2', 2)}', 1);`);
  // the untouched round: one person, past its 90 days? No: readout an hour ago, 90 days to go
  seedRound(OTHER, [{ name: 'Olly Oak', u: user(7, 'olly@client.test'), choice: 'named', q: QR, label: 'Month end' }]);
});
after(async () => { setSynthesisClient(null); await pool?.end(); db?.stop(); });

// ── fake synthesis model: echoes real insights; the coordinator cites them by id ─────────────────────
const SUMMARISER = 'You are the per-interview summariser';
const UNIT = 'You are the unit-level synthesiser';
const COORDINATOR = 'You are the synthesis coordinator';
function echoSummary(prompt) {
  const start = prompt.indexOf('VALIDATED INSIGHTS (the only evidence you may use):\n') + 'VALIDATED INSIGHTS (the only evidence you may use):\n'.length;
  const { participant_id, insights } = JSON.parse(prompt.slice(start, prompt.indexOf('\n\nINTERVIEW STATE')));
  return { employee_ref: participant_id, role: 'team member', second_hand: false,
    top_pains: insights.map((i) => ({ label: i.label, detail: 'Detail.', frequency: null, time_per_week_hours: 4, insight_id: i.id, quote: i.evidence_quote, confidence: 0.9 })),
    time_costs_total_hours_per_week: 4, automation_candidates: [], notable_quotes: insights.map((i) => ({ insight_id: i.id, quote: i.evidence_quote })),
    referrals: [], uncertain: [], follow_up_signal: 0.4 };
}
const ins = (k) => sPeople[k].ins;
const coordinator = () => ({
  headline_read: { text: 'Invoices and approvals.', supporting_insight_ids: [ins(0), ins(1), ins(2), ins(3)] },
  themes: [
    // Alice (named) and Carol (never chose = No quotes). The statement repeats Carol's words verbatim.
    { theme_id: 'th-invoice', title: 'Invoices are keyed by hand', statement: `People said: ${QC}.`,
      evidence_quotes: [{ insight_id: ins(0), quote: QA }, { insight_id: ins(2), quote: QC }] },
    // Bob (anonymous) and Dana (named)
    { theme_id: 'th-approvals', title: 'Approvals stall', statement: 'Approvals wait for days.',
      evidence_quotes: [{ insight_id: ins(1), quote: QB }, { insight_id: ins(3), quote: QD }] },
  ],
  recommendations: [{ rec_id: 'rec-flow', title: 'Approval flow', summary: 'S', impact: 4, feasibility: 4,
    evidence_quotes: [{ insight_id: ins(1), quote: QB }, { insight_id: ins(3), quote: QD }] }],
  follow_ups: [{ employee_ref: sPeople[1].e, question: 'How many approvals a week?', reason: 'R', related_insight_ids: [ins(1)] }],
  to_confirm_in_readout: [],
});
function fakeModel() {
  setSynthesisClient({ messages: { create: async (params) => {
    const prompt = params.messages[0].content;
    let out;
    if (prompt.startsWith(SUMMARISER)) out = echoSummary(prompt);
    else if (prompt.startsWith(UNIT)) out = { unit_id: /unit id: (\S+)/.exec(prompt)[1], candidate_themes: [], automation_candidates: [], follow_ups: [], open_questions: [] };
    else if (prompt.startsWith(COORDINATOR)) out = coordinator();
    else throw new Error('unexpected prompt');
    return { content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 100, output_tokens: 20 } };
  } } });
}
async function synthesise(engagementId) {
  fakeModel();
  const sys = interviewDb('system', { pool });
  for (let i = 0; i < 20; i += 1) {
    const step = await runSynthesisStep(sys, engagementId, { maxModelCalls: 10 });
    if (step.done) return step;
  }
  throw new Error('synthesis did not finish');
}
const latestRow = () => JSON.parse(sql(`SELECT row_to_json(y) FROM interview.synthesis y WHERE engagement_id = '${S}' ORDER BY version DESC LIMIT 1`));

// ── 1 and 6: regions and voice settings ──────────────────────────────────────────────────────────────
test('1/6: Deepgram stays on the US hosts (John, 25 Oct) and mip_opt_out stays true', () => {
  assert.equal(DEEPGRAM_AGENT_URL, 'wss://agent.deepgram.com/v1/agent/converse');
  assert.equal(new URL(DEEPGRAM_GRANT_URL).host, 'api.deepgram.com');
  const s = buildVoiceSettings({ thinkEndpointUrl: 'https://example.test/api/interview/voice/think', sessionToken: 't', greeting: 'Hi.' });
  assert.equal(s.mip_opt_out, true);
});

test('notice: the short notice shows the deletion date; the quote options have no default', () => {
  const notice = interviewNotice({ clientName: 'Acme', retentionDays: 90, deletionDate: '2027-02-04' });
  assert.match(notice.points.find((p) => p.label === 'How long.').text, /90 days after we present the findings \(by 4 February 2027\)/);
  assert.match(notice.consent, /delete my data from my account/);
  // claim C1: we keep the text, not the recording
  assert.match(notice.consent, /kept as text and analysed/);
  assert.doesNotMatch(JSON.stringify(notice), /\brecorded\b/);
  assert.match(notice.intro, /separately from Acme's managers and handles your answers on Acme's behalf/);
  assert.match(notice.points.find((p) => p.label === 'Where.').text, /United States, under the legal safeguards UK law requires/);
  // claim C9 is not confirmed yet, so the line stays out
  assert.doesNotMatch(JSON.stringify(notice), /not told who took part/);
  assert.doesNotMatch(JSON.stringify(notice), /nothing (you said )?is kept/i);
  assert.deepEqual(QUOTE_OPTIONS.map((o) => o.value), ['none', 'anonymous', 'named']);
  assert.ok(QUOTE_OPTIONS.every((o) => !('default' in o) && !('selected' in o)));
  assert.equal(deletionDate({ readout_at: '2026-11-13T10:00:00Z', retention_days: 90 }), '2027-02-11');
  assert.equal(deletionDate({ readout_at: null, closed_at: null, retention_days: 90 }), null);
});

// ── 5: No quotes ─────────────────────────────────────────────────────────────────────────────────────
test('5: "No quotes" (or no choice) leaves no verbatim text from that person in the synthesis', { skip }, async () => {
  const step = await synthesise(S);
  assert.equal(step.phase, 'written');
  const row = latestRow();
  const invoice = row.themes.find((t) => t.theme_id === 'th-invoice');
  assert.ok(invoice, 'the theme still forms: Carol counts as a voice');
  assert.equal(invoice.distinct_voices, 2);
  const carol = invoice.evidence_quotes.find((q) => q.insight_id === ins(2));
  assert.deepEqual([carol.quote, carol.attribution, carol.withheld], [null, null, true]);
  assert.ok(!JSON.stringify(row).toLowerCase().includes(QC.toLowerCase()), 'Carol\'s words appear nowhere in the stored synthesis');
  assert.match(invoice.statement, /\[quote withheld\]/);
  // named only when chosen: Alice named, Bob (anonymous) by role
  assert.match(invoice.evidence_quotes.find((q) => q.insight_id === ins(0)).attribution, /^Alice Archer/);
  assert.doesNotMatch(JSON.stringify(row.themes.find((t) => t.theme_id === 'th-approvals')), /Bob Baker/);
  // sign-off: Carol now makes no choice -> refused; with a choice it is logged
  const carolDb = interviewDb(CAROL, { pool });
  await assert.rejects(applySignOffConsent(carolDb, { employee: { id: sPeople[2].e, person_id: null, email: CAROL.email, name: 'Carol Cole', role_title: 'Clerk' },
    unitName: null, sessionId: sPeople[2].s, choice: { memory: false } }), (e) => e.code === 'QUOTE_CHOICE_REQUIRED');
  assert.equal(scrubVerbatim(`x ${QC.toUpperCase()} y`, [QC]), `x ${WITHHELD} y`);
});

// ── 3: see my data ───────────────────────────────────────────────────────────────────────────────────
test('3: a participant sees and downloads only their own data; a client admin cannot see another person', { skip }, async () => {
  const v1 = latestRow();
  assert.equal((await releaseSynthesis(interviewDb('system', { pool }), S, v1.id, 'tester', { logAudit: async () => {} })).ok, true);

  const alice = await seeMyInterviewData(pool, ALICE);
  assert.deepEqual(alice.rounds.map((r) => r.engagementId), [S]);
  const mine = alice.rounds[0];
  assert.equal(mine.you.email, ALICE.email);
  assert.deepEqual(mine.sessions[0].transcript.map((t) => t.speaker), ['interviewer', 'you']);
  assert.ok(mine.sessions[0].transcript[1].text.includes(QA));
  assert.deepEqual(mine.insights.map((i) => i.quote), [QA]);
  assert.equal(mine.consent.quotes, 'named');
  assert.ok(mine.quotesUsed.some((q) => q.quote === QA && /Alice Archer/.test(q.attribution)));
  assert.ok(mine.deletionDate);
  const text = JSON.stringify(alice);
  for (const other of [QB, QC, QD, 'Bob Baker', 'Carol Cole', 'Dana Drew']) assert.ok(!text.includes(other), `Alice must not see ${other}`);

  // Carol is the client admin of the round: she sees only herself, here and in the tables
  const carol = await seeMyInterviewData(pool, CAROL);
  assert.equal(carol.rounds.length, 1);
  assert.equal(carol.rounds[0].you.email, CAROL.email);
  assert.equal(carol.rounds[0].consent.quotes, 'none');
  assert.equal(carol.rounds[0].consent.quotesChosen, false);
  assert.deepEqual(carol.rounds[0].quotesUsed, [], 'a withheld quote is not "used"');
  for (const other of [QA, QB, QD, 'Alice Archer', 'Bob Baker']) assert.ok(!JSON.stringify(carol).includes(other));
  const carolDb = interviewDb(CAROL, { pool });
  const { data: turns } = await carolDb.from('turn').select('content');
  assert.ok(turns.length === 2 && turns.every((t) => !t.content.includes(QA)));
  const { data: emps } = await carolDb.from('employee').select('email');
  assert.deepEqual(emps.map((e) => e.email), [CAROL.email]);
  // her invite is now tied to her website account: the same email under another user id reaches nothing
  const impostor = interviewDb({ id: id('f2', 99), email: CAROL.email }, { pool });
  assert.deepEqual((await impostor.from('employee').select('id')).data, []);
  assert.deepEqual((await impostor.from('turn').select('id')).data, []);

  assert.deepEqual((await seeMyInterviewData(pool, STRANGER)).rounds, []);
  await assert.rejects(deleteMyInterviewData(pool, STRANGER, S), (e) => e.code === 'NOT_FOUND');

  // the HTTP door: signed in only, delete needs an explicit confirm; 'see' is the download
  const handler = makeMyDataHandler({ pool: () => pool, env: { INTERVIEW_ENABLED: '1' }, log: () => {},
    verify: async (token) => (token === 'alice' ? { id: ALICE.id, email: ALICE.email, emailVerified: true } : null) });
  const post = (body, token) => handler(new Request('http://x/api/interview/my-data', { method: 'POST', body: JSON.stringify(body),
    headers: token ? { authorization: `Bearer ${token}` } : {} }));
  assert.equal((await post({ op: 'see' })).status, 401);
  assert.equal((await post({ op: 'delete', engagementId: S }, 'alice')).status, 400);
  const res = await post({ op: 'see' }, 'alice');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await res.json()).data.rounds.map((r) => r.engagementId), [S]);
});

// ── 4: delete my data ────────────────────────────────────────────────────────────────────────────────
test('4: delete removes the person at once, and a re-run synthesis has none of their quotes or single-voice themes', { skip }, async () => {
  const v1 = latestRow();
  const bob = sPeople[1];
  const consentBefore = n(`SELECT count(*) FROM interview.consent_event WHERE employee_id = '${bob.e}'`);
  const counts = await deleteMyInterviewData(pool, BOB, S);
  assert.deepEqual([counts.sessions, counts.turns, counts.insights], [1, 2, 1]);
  assert.equal(n(`SELECT count(*) FROM interview.session WHERE employee_id = '${bob.e}'`), 0);
  assert.equal(n(`SELECT count(*) FROM interview.insight WHERE id = '${bob.ins}'`), 0);
  assert.equal(n(`SELECT count(*) FROM interview.memory_blob mb JOIN interview.person p USING (person_id) WHERE p.verified_email = '${BOB.email}'`), 0);
  assert.equal(n(`SELECT count(*) FROM interview.outbox WHERE idempotency_key LIKE '${bob.s}:%'`), 0);
  assert.equal(n(`SELECT count(*) FROM interview.consent_event WHERE employee_id = '${bob.e}'`), consentBefore + 1);
  assert.equal(sql(`SELECT kind FROM interview.consent_event WHERE employee_id = '${bob.e}' ORDER BY ts DESC LIMIT 1`), 'withdrawal');
  // nothing in the deletion record or the activity log says who
  const record = sql(`SELECT counts::text FROM interview.deletion_record WHERE engagement_id = '${S}' AND kind = 'self_service'`);
  assert.ok(!record.includes(bob.e) && !record.includes('Bob') && !record.includes(BOB.email));
  assert.ok(!sql(`SELECT string_agg(summary || coalesce(actor_email, ''), ' ') FROM interview.audit_log WHERE engagement_id = '${S}'`).includes('Bob'));
  // claim C8: the owner gets a prompt to re-run and send an updated version; the event says nothing about who
  const prompt = sql(`SELECT idempotency_key || ' ' || payload::text FROM interview.outbox
    WHERE engagement_id = '${S}' AND payload ->> 'type' = 'participant_withdrawn'`);
  assert.match(prompt, /"synthesis_stale": true/);
  for (const who of [bob.e, bob.s, 'Bob', BOB.email, BOB.id]) assert.ok(!prompt.includes(who), `outbox event names ${who}`);

  // the released v1 lost Bob at once: the approvals theme (Bob + Dana) falls below two voices and drops
  const scrubbed = latestRow();
  assert.equal(scrubbed.id, v1.id);
  assert.deepEqual(scrubbed.themes.map((t) => t.theme_id), ['th-invoice']);
  assert.ok(!JSON.stringify(scrubbed).includes(QB));
  assert.ok(!JSON.stringify(scrubbed.follow_ups).includes(bob.e));
  assert.equal(scrubbed.recommendations.length, 1, 'Dana still backs the recommendation');
  assert.ok(sql(`SELECT synthesis_stale_at IS NOT NULL FROM interview.engagement WHERE id = '${S}'`) === 't');
  // a version generated before the withdrawal cannot be released again
  const again = await releaseSynthesis(interviewDb('system', { pool }), S, v1.id, 'tester', { logAudit: async () => {} });
  assert.equal(again.ok, false);
  assert.match(again.message, /withdrawn/);

  // the re-run: the coordinator still cites Bob's insight; it is gone, so the theme is single-voice and demoted
  const step = await synthesise(S);
  assert.equal(step.phase, 'written');
  const v2 = latestRow();
  assert.equal(v2.version, v1.version + 1);
  assert.deepEqual(v2.themes.map((t) => t.theme_id), ['th-invoice']);
  assert.ok(v2.validation_log.some((l) => l.kind === 'theme_demoted' && l.subject === 'theme "Approvals stall"'));
  assert.ok(!JSON.stringify(v2).includes(QB));
  // the internal validation log may name the deleted insight id ("cites unknown insight"); nothing rendered does
  const rendered = JSON.stringify([v2.themes, v2.hot_spots, v2.recommendations, v2.follow_ups, v2.headline_read, v2.input_insight_ids]);
  assert.ok(!rendered.includes(bob.ins) && !rendered.includes(bob.e));
  assert.ok(!JSON.stringify(v2).toLowerCase().includes(QC.toLowerCase()));
  assert.equal((await releaseSynthesis(interviewDb('system', { pool }), S, v2.id, 'tester', { logAudit: async () => {} })).ok, true);
  // Bob sees that nothing is left
  const left = (await seeMyInterviewData(pool, BOB)).rounds[0];
  assert.deepEqual([left.sessions.length, left.insights.length, left.consent.withdrawn], [0, 0, true]);
});

test('withdrawFromSynthesis: one person is one voice; a theme left with fewer than two quotes drops', () => {
  const row = { themes: [
    { theme_id: 'a', title: 'A', distinct_voices: 3, supporting_insight_ids: ['x', 'y', 'z'],
      evidence_quotes: [{ insight_id: 'x', quote: 'q1' }, { insight_id: 'y', quote: 'q2' }, { insight_id: 'z', quote: 'q3' }] },
    { theme_id: 'b', title: 'B', distinct_voices: 2, supporting_insight_ids: ['x', 'w'],
      evidence_quotes: [{ insight_id: 'x', quote: 'q1' }, { insight_id: 'w', quote: 'q4' }] },
  ], headline_read: { text: 't', supporting_insight_ids: ['x', 'y', 'z'] }, input_insight_ids: ['x', 'y'] };
  const { changed, fields } = withdrawFromSynthesis(row, { insightIds: ['x'], employeeId: 'e' });
  assert.equal(changed, true);
  assert.deepEqual(fields.themes.map((t) => [t.theme_id, t.distinct_voices]), [['a', 2]]);
  assert.equal(fields.headline_read, null);
  assert.deepEqual(fields.input_insight_ids, ['y']);
});

// ── 2: retention ─────────────────────────────────────────────────────────────────────────────────────
test('2: a round with retention_days = 0 deletes everything listed, keeps consent and usage, and leaves the themes copy', { skip }, async () => {
  const env = { INTERVIEW_ENABLED: '1' };
  const consent = n(`SELECT count(*) FROM interview.consent_event WHERE engagement_id = '${R}'`);
  const usage = n(`SELECT count(*) FROM interview.usage_ledger WHERE engagement_id = '${R}'`);
  const otherBefore = sql(`SELECT count(*) FROM interview.turn t JOIN interview.session s ON s.id = t.session_id
    JOIN interview.employee e ON e.id = s.employee_id WHERE e.engagement_id IN ('${OTHER}', '${S}')`);
  assert.deepEqual(await dueForRetention(pool), [R], 'only the round past its date; S and the other round are not due');

  // dry run: counts, changes nothing
  const dry = await retentionRun({ pool, env: { ...env, INTERVIEW_RETENTION_DRY_RUN: '1' }, log: () => {} });
  assert.equal(dry.confirm, false);
  assert.deepEqual([dry.rounds[0].sessions, dry.rounds[0].turns, dry.rounds[0].invites], [2, 4, 2]);
  assert.equal(n(`SELECT count(*) FROM interview.session s JOIN interview.employee e ON e.id = s.employee_id WHERE e.engagement_id = '${R}'`), 2);

  const logs = [];
  const real = await retentionRun({ pool, env, log: (l) => logs.push(l) });
  assert.equal(real.confirm, true);
  assert.ok(!logs.join(' ').includes('Rhys') && !logs.join(' ').includes('@client.test'), 'the log has ids and counts only');

  const left = (t, where = `engagement_id = '${R}'`) => n(`SELECT count(*) FROM interview.${t} WHERE ${where}`);
  assert.equal(left('session', `employee_id IN ('${rPeople[0].e}', '${rPeople[1].e}')`), 0);
  assert.equal(left('turn', `session_id IN ('${rPeople[0].s}', '${rPeople[1].s}')`), 0);
  assert.equal(left('insight', `session_id IN ('${rPeople[0].s}', '${rPeople[1].s}')`), 0);
  assert.equal(left('synthesis'), 0);
  assert.equal(left('synthesis_cache'), 0);
  assert.equal(left('synthesis_run'), 0);
  assert.equal(left('memory_blob', `person_id IN (SELECT person_id FROM interview.person WHERE verified_email IN ('rhys@client.test', 'rose@client.test'))`), 0);
  assert.equal(left('person', `verified_email IN ('rhys@client.test', 'rose@client.test')`), 0);
  assert.equal(left('employee', `engagement_id = '${R}' AND email LIKE '%@client.test'`), 0, 'no invite keeps a name or an email');
  assert.equal(sql(`SELECT string_agg(name, ',') FROM interview.employee WHERE engagement_id = '${R}'`), 'Removed', 'the seat requester is cleared, not deleted');
  assert.equal(left('outbox', `engagement_id = '${R}' AND payload ->> 'type' IS DISTINCT FROM 'retention_deleted'`), 0);
  assert.equal(left('outbox', `engagement_id = '${R}' AND payload ->> 'type' = 'retention_deleted'`), 1, 'the owner is told');
  assert.equal(left('audit_log', `engagement_id = '${R}' AND action NOT LIKE 'retention.%'`), 0);

  // kept on purpose: consent (no content, still says who agreed to what and when) and content-free usage
  assert.equal(left('consent_event'), consent);
  assert.equal(left('consent_event', `engagement_id = '${R}' AND employee_id IS NULL AND subject_email IS NOT NULL`), 1);
  assert.equal(left('usage_ledger'), usage);
  assert.equal(left('usage_ledger', `engagement_id = '${R}' AND session_id IS NOT NULL`), 0);

  // the anonymised themes copy: labels, counts, hours and teams, no names and no quotes
  const copy = sql(`SELECT row_to_json(a)::text FROM interview.anonymised_themes a WHERE engagement_id = '${R}'`);
  assert.ok(copy.includes('Manual re-keying') && copy.includes('Finance'));
  for (const banned of [QR, 'Rhys', 'Rowe', 'insight_id', id('b2', 1), '@client.test']) assert.ok(!copy.includes(banned), `copy has ${banned}`);
  assert.ok(copy.includes('Automate the close for [name removed]'));

  const record = JSON.parse(sql(`SELECT counts::text FROM interview.deletion_record WHERE engagement_id = '${R}' AND kind = 'retention'`));
  assert.deepEqual([record.sessions, record.turns, record.insights, record.synthesis], [2, 4, 2, 1]);
  assert.equal(sql(`SELECT count(*) FROM interview.turn t JOIN interview.session s ON s.id = t.session_id
    JOIN interview.employee e ON e.id = s.employee_id WHERE e.engagement_id IN ('${OTHER}', '${S}')`), otherBefore, 'other rounds untouched');
  assert.deepEqual(await dueForRetention(pool), [], 'nothing left to delete tomorrow');
});

test('anonymisedCopy keeps team roll-ups and drops statements, quotes, ids and names', () => {
  const copy = anonymisedCopy({ themes: [{ title: 'Pat Lee re-keys', statement: 'quote', evidence_quotes: [{ quote: 'x' }], supporting_insight_ids: ['i'], distinct_voices: 2 }],
    hot_spots: [{ team: 'Ops', first_hand_hours_per_week: 3, respondents: 2, top_drivers: [{ label: 'solo', insight_id: 'i' }], local_themes: [] }] }, { names: ['Pat Lee'] });
  assert.deepEqual(copy.themes, [{ title: '[name removed] re-keys', scope: null, distinct_voices: 2, includes_second_hand: false, confidence: null }]);
  assert.deepEqual(copy.teams, [{ team: 'Ops', first_hand_hours_per_week: 3, on_behalf_hours_per_week: null, respondents: 2, themes: [] }]);
});
