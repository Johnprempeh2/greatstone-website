import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addWord, normaliseWord, validateIntake, validateContact, orderAgents, avatarIndex, readGaClientId,
  makeFrontDoorClient, CONSENT_VERSION, OTHER, LIMITS,
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

test('client: posts to front-door with the anon key and keeps the session for later calls', async () => {
  const { f, calls } = fakeFetch([reply(200, { reply: 'Hello', closed: null, session: 's1' }), reply(200, { status: 'ok', leadId: 'L1', agents: [] })]);
  const c = makeFrontDoorClient({ url: 'https://p.supabase.co/', anonKey: 'anon', fetchImpl: f });
  await c.chat({ intake: { company: 'A' }, messages: [], turnstile: 't1' });
  await c.propose({ intake: { company: 'A' }, messages: [], source: {} });
  assert.equal(calls[0].url, 'https://p.supabase.co/functions/v1/front-door');
  assert.equal(calls[0].headers.apikey, 'anon');
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

test('client: with no Supabase config it refuses without a network call', async () => {
  let called = false;
  const c = makeFrontDoorClient({ url: '', anonKey: '', fetchImpl: async () => { called = true; } });
  assert.equal(c.configured, false);
  await assert.rejects(c.propose({}), /not set up/);
  assert.equal(called, false);
});
