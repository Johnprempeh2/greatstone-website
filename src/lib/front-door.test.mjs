import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addWord, normaliseWord, validateIntake, validateContact, orderAgents, avatarIndex, teamAvatars, readGaClientId,
  makeFrontDoorClient, makeFunnel, CONSENT_VERSION, OTHER, LIMITS,
} from './front-door.mjs';

const SECTORS = ['Real estate', 'Healthcare'];
const good = { industry: 'Healthcare', company: '  Acme   Clinics ', words: ['calm', 'clear', 'kind'], teamSize: '11-50' };

test('brand words: trimmed, stripped of markup, capped, max three, no repeats', () => {
  assert.equal(normaliseWord('  <b>bold</b> '), 'bbold/b');
  assert.equal(normaliseWord('x'.repeat(40)).length, LIMITS.word);
  let w = [];
  w = addWord(w, 'Calm'); w = addWord(w, 'calm'); w = addWord(w, '  ');
  assert.deepEqual(w, ['Calm']);
  w = addWord(addWord(w, 'clear'), 'kind');
  assert.deepEqual(addWord(w, 'fourth'), ['Calm', 'clear', 'kind']);
});

test('intake: a complete form gives the edge function shape', () => {
  const r = validateIntake(good, SECTORS);
  assert.equal(r.ok, true);
  assert.deepEqual(r.intake, { industry: 'Healthcare', industryOther: false, company: 'Acme Clinics', words: ['calm', 'clear', 'kind'], teamSize: '11-50' });
});

test('intake: each missing field has its own message', () => {
  const r = validateIntake({ industry: 'Mining', company: '', words: ['a'] }, SECTORS);
  assert.equal(r.ok, false);
  assert.equal(r.intake, null);
  assert.deepEqual(Object.keys(r.errors).sort(), ['company', 'industry', 'words']);
});

test('intake: Other needs the visitor\'s own words, and sends them as the industry', () => {
  assert.equal(validateIntake({ ...good, industry: OTHER, other: ' ' }, SECTORS).errors.industry, 'Tell us your industry in a few words.');
  const r = validateIntake({ ...good, industry: OTHER, other: 'Funeral care' }, SECTORS);
  assert.equal(r.intake.industry, 'Funeral care');
  assert.equal(r.intake.industryOther, true);
});

test('intake: an unknown team size is dropped, not sent', () => {
  assert.equal(validateIntake({ ...good, teamSize: '9000' }, SECTORS).intake.teamSize, null);
  assert.equal(validateIntake({ ...good, teamSize: '' }, SECTORS).intake.teamSize, null);
});

test('intake: company name over the limit is refused', () => {
  assert.equal(validateIntake({ ...good, company: 'x'.repeat(LIMITS.company + 1) }, SECTORS).ok, false);
});

test('contact: consent is optional and always carries the wording version', () => {
  const r = validateContact({ name: 'Sam', email: 'sam@example.com', role: 'Owner' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.consent, { given: false, version: CONSENT_VERSION });
  assert.equal(validateContact({ name: 'Sam', email: 'sam@example.com', role: 'Owner', consent: true }).consent.given, true);
});

test('contact: a bad email and blanks are refused', () => {
  const r = validateContact({ name: ' ', email: 'not-an-email', role: '' });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['email', 'name', 'role']);
});

test('agents: lead first, junk dropped', () => {
  const out = orderAgents([{ name: 'Ada' }, null, { name: 'Bo', is_lead: true }, { role: 'no name' }, { name: 'Cy' }]);
  assert.deepEqual(out.map((a) => a.name), ['Bo', 'Ada', 'Cy']);
  assert.deepEqual(orderAgents(undefined), []);
});

test('avatar: the same name always gets the same avatar, in range', () => {
  assert.equal(avatarIndex('Priya', 8), avatarIndex('priya', 8));
  for (const n of ['Ada', 'Bo', 'Cy', 'Dev', 'Esi']) { const i = avatarIndex(n, 8); assert.ok(i >= 0 && i < 8); }
  assert.equal(avatarIndex('Ada', 0), 0);
});

test('avatar: names spread across the set rather than bunching on one', () => {
  const seen = new Set(['Ines', 'Marta', 'Kofi', 'Ada', 'Bo', 'Cy', 'Dev', 'Esi', 'Priya', 'Tomas'].map((n) => avatarIndex(n, 6)));
  assert.ok(seen.size >= 4, 'ten names spread over at least four of six avatars');
});

test('avatar: a team of three never repeats an avatar, and keeps each name\'s own when free', () => {
  const t = teamAvatars(['Ines', 'Marta', 'Kofi'], 6);
  assert.equal(new Set(t).size, 3);
  assert.equal(t[0], avatarIndex('Ines', 6));
  assert.deepEqual(teamAvatars(['Ada', 'Ada', 'Ada'], 3).sort(), [0, 1, 2]);
});

test('GA client id is read from the _ga cookie only', () => {
  assert.equal(readGaClientId('a=1; _ga=GA1.1.123456.789012; b=2'), '123456.789012');
  assert.equal(readGaClientId('x_ga=GA1.1.1.2'), null);
  assert.equal(readGaClientId(''), null);
});

// --- the edge function client -------------------------------------------------------------------
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => { if (body === undefined) throw new Error('no json'); return body; } });
function fakeFetch(responses) {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, body: JSON.parse(init.body), headers: init.headers }); const r = responses.shift(); if (r instanceof Error) throw r; return r; };
  return { f, calls };
}

test('client: posts to the same-origin front door and keeps the session for later calls', async () => {
  const { f, calls } = fakeFetch([reply(200, { reply: 'Hello', closed: null, session: 's1' }), reply(200, { status: 'ok', leadId: 'L1', agents: [] })]);
  const c = makeFrontDoorClient({ url: 'https://p.supabase.co/', anonKey: 'anon', fetchImpl: f });
  await c.chat({ intake: { company: 'A' }, messages: [], turnstile: 't1' });
  await c.propose({ intake: { company: 'A' }, messages: [], source: {} });
  assert.equal(calls[0].url, '/api/front-door');
  assert.deepEqual(calls[0].headers, { 'content-type': 'application/json' });
  assert.equal(calls[0].body.step, 'chat');
  assert.equal(calls[0].body.turnstile, 't1');
  assert.equal(calls[0].body.session, undefined);
  assert.equal(calls[1].body.step, 'propose');
  assert.equal(calls[1].body.session, 's1');
});

test('client: propose retries once after a server error, then succeeds', async () => {
  const { f, calls } = fakeFetch([reply(502), reply(200, { status: 'ok', leadId: 'L1', agents: [] })]);
  const c = makeFrontDoorClient({ url: 'u', anonKey: 'k', fetchImpl: f });
  const out = await c.propose({ intake: {}, messages: [] });
  assert.equal(out.leadId, 'L1');
  assert.equal(calls.length, 2);
});

test('client: propose gives up after one retry', async () => {
  const { f, calls } = fakeFetch([new TypeError('offline'), reply(500, { error: 'Busy.' })]);
  const c = makeFrontDoorClient({ url: 'u', anonKey: 'k', fetchImpl: f });
  await assert.rejects(c.propose({ intake: {}, messages: [] }), (e) => e.message === 'Busy.' && e.status === 500);
  assert.equal(calls.length, 2);
});

test('client: a 4xx is shown as is and never retried', async () => {
  const { f, calls } = fakeFetch([reply(429, { error: 'You have built three teams today. Try again tomorrow.' })]);
  const c = makeFrontDoorClient({ url: 'u', anonKey: 'k', fetchImpl: f });
  await assert.rejects(c.propose({ intake: {}, messages: [] }), /three teams today/);
  assert.equal(calls.length, 1);
});

test('client: chat is not retried (the visitor can resend)', async () => {
  const { f, calls } = fakeFetch([reply(503)]);
  const c = makeFrontDoorClient({ url: 'u', anonKey: 'k', fetchImpl: f });
  await assert.rejects(c.chat({ intake: {}, messages: [] }), /Something went wrong/);
  assert.equal(calls.length, 1);
});

test('client: the same-origin function can give an unavailable response', async () => {
  let called = false;
  const c = makeFrontDoorClient({ fetchImpl: async () => { called = true; return reply(503, { error: 'Unavailable.' }); } });
  assert.equal(c.configured, true);
  await assert.rejects(c.propose({}), /Unavailable/);
  assert.equal(called, true);
});

// B9 (GRE-469): funnel events, consent-gated, no typed text
function recorder(consent) {
  const sent = [];
  let c = consent;
  const f = makeFunnel({ track: (event, params) => sent.push({ event, params }), getConsent: () => c });
  return { f, sent, set: (v) => { c = v; } };
}
const okIntake = validateIntake(good, SECTORS).intake;
const otherIntake = validateIntake({ ...good, industry: OTHER, other: 'Rare earth mining' }, SECTORS).intake;

test('funnel: nothing fires before analytics consent, or after it is refused', () => {
  for (const consent of [null, 'denied', 'yes']) {
    const { f, sent } = recorder(consent);
    assert.equal(f.intake(okIntake, 'build'), false);
    assert.equal(f.proposal(okIntake, { status: 'ok' }), false);
    assert.equal(f.lead(okIntake, { consent: true }), false);
    assert.equal(sent.length, 0);
  }
});

test('funnel: consent is read when the event fires, so accepting mid-flow counts from then on', () => {
  const { f, sent, set } = recorder(null);
  f.intake(okIntake, 'build');
  set('granted');
  f.proposal(okIntake, { status: 'ok' });
  assert.deepEqual(sent.map((s) => s.event), ['front_door_proposal']);
});

test('funnel: the three spec events with label parameters', () => {
  const { f, sent } = recorder('granted');
  f.intake(okIntake, 'chat');
  f.proposal(okIntake, { status: 'ok', turns: 4 });
  f.lead(okIntake, { consent: false });
  assert.deepEqual(sent, [
    { event: 'front_door_intake', params: { form: 'front_door', industry: 'Healthcare', team_size: '11-50', path: 'chat' } },
    { event: 'front_door_proposal', params: { form: 'front_door', industry: 'Healthcare', outcome: 'team', chat_turns: 4 } },
    { event: 'generate_lead', params: { form: 'front_door', industry: 'Healthcare', contact_consent: false } },
  ]);
});

test('funnel: no typed text reaches GA (Other industry, company, brand words)', () => {
  const { f, sent } = recorder('granted');
  f.intake({ ...otherIntake, teamSize: null }, 'build');
  f.proposal(otherIntake, { status: 'declined', turns: 99 });
  f.lead(otherIntake, { consent: true });
  const all = JSON.stringify(sent);
  for (const typed of ['Rare earth', 'Acme', 'calm', 'clear', 'kind']) assert.ok(!all.includes(typed), typed);
  assert.equal(sent[0].params.industry, OTHER);
  assert.equal(sent[0].params.team_size, 'not_given');
  assert.equal(sent[1].params.outcome, 'declined');
  assert.equal(sent[1].params.chat_turns, LIMITS.chatTurns);
  assert.equal(sent[2].params.contact_consent, true);
});

test('funnel: a missing track or consent reader is a no-op, not a crash', () => {
  assert.equal(makeFunnel().intake(okIntake, 'build'), false);
});
