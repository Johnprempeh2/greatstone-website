// Front door leads (GRE-463): the S5 row, the S6 contact update, the S8 alert. Run with `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normaliseSource, leadRow, contactUpdate, buildAlertEmail, sendEmail, isLeadId, leadRef, CONSENT_VERSIONS,
} from './front-door-leads.mjs';

const ID = '3f2b8c1e-9a4d-4e7f-8b21-5c6d7e8f9a0b';
const intake = { industry: 'Property', company: 'Northwind Lettings', words: ['trusted', 'local', 'quick'], teamSize: '11-50' };
const proposal = {
  status: 'ok', decline_reason: 'none',
  agents: [{ name: 'Amara' }, { name: 'Kenji' }, { name: 'Sofia' }],
  chat_summary: ['Wants faster viewings', 'Tone: warm', 'Small team'],
};

test('source keeps only the fields we asked for, capped', () => {
  const out = normaliseSource({
    page: '/#frontdoor', referrer: 'https://example.org/' + 'x'.repeat(400),
    firstTouch: { utm_source: 'linkedin', utm_medium: 'paid', landing: '/', at: '2026-10-01T10:00:00Z', password: 'nope', utm_bogus: 'x' },
    gaClientId: '123456789.1700000000', extra: 'dropped',
  });
  assert.deepEqual(Object.keys(out).sort(), ['firstTouch', 'gaClientId', 'page', 'referrer']);
  assert.equal(out.referrer.length, 200);
  assert.deepEqual(out.firstTouch, { utm_source: 'linkedin', utm_medium: 'paid', landing: '/', at: '2026-10-01T10:00:00.000Z' });
});

test('source drops a malformed GA client id and odd input', () => {
  assert.deepEqual(normaliseSource({ gaClientId: 'GA1.2.<script>' }), {});
  assert.deepEqual(normaliseSource(null), {});
  assert.deepEqual(normaliseSource({ firstTouch: 'str', page: '<b>' }), { page: 'b' });
});

test('the S5 row is anonymous: no chat text, no contact, no IP', () => {
  const row = leadRow({ orgId: 'org', intake, industryOther: false, proposal, turns: 4, source: { page: '/' } });
  assert.equal(row.company_name, 'Northwind Lettings');
  assert.equal(row.team_size, '11-50');
  assert.deepEqual(row.brand_words, ['trusted', 'local', 'quick']);
  assert.equal(row.chat_turns, 4);
  assert.deepEqual(row.chat_summary, proposal.chat_summary);
  for (const k of Object.keys(row)) assert.ok(!/contact|ip|messages|chat$/.test(k), `unexpected column ${k}`);
});

test('the S5 row clamps turns and drops an unknown team size', () => {
  const row = leadRow({ orgId: 'org', intake: { ...intake, teamSize: '9000' }, proposal, turns: 99 });
  assert.equal(row.team_size, null);
  assert.equal(row.chat_turns, 6);
  assert.equal(row.industry_other, false);
});

test('contact update records consent with the wording version', () => {
  const now = new Date('2026-10-03T12:00:00Z');
  const u = contactUpdate({ leadId: ID, contact: { name: ' Ada  Lovelace ', email: 'ada@example.com', role: 'Owner' }, consent: { given: true, version: 'front-door-consent-v1' } }, now);
  assert.deepEqual(u, {
    contact_name: 'Ada Lovelace', contact_email: 'ada@example.com', contact_role: 'Owner', contact_at: now.toISOString(),
    consent_given: true, consent_at: now.toISOString(), consent_version: 'front-door-consent-v1',
  });
});

test('consent against unknown wording does not count', () => {
  const u = contactUpdate({ contact: { name: 'A', email: 'a@b.co', role: 'R' }, consent: { given: true, version: 'made-up' } });
  assert.equal(u.consent_given, false);
  assert.equal(u.consent_at, null);
  assert.equal(u.consent_version, null);
});

test('no consent tick still saves the contact for the pack', () => {
  const u = contactUpdate({ contact: { name: 'A', email: 'a@b.co', role: 'R' }, consent: { given: false, version: CONSENT_VERSIONS[0] } });
  assert.equal(u.consent_given, false);
  assert.equal(u.consent_version, 'front-door-consent-v1');
});

test('contact update refuses missing or bad fields', () => {
  assert.equal(contactUpdate({ contact: { name: 'A', email: 'not-an-email', role: 'R' } }), null);
  assert.equal(contactUpdate({ contact: { name: '', email: 'a@b.co', role: 'R' } }), null);
  assert.equal(contactUpdate({}), null);
  assert.equal(contactUpdate(null), null);
});

test('lead ids are uuids only', () => {
  assert.ok(isLeadId(ID));
  assert.ok(!isLeadId('1; drop table'));
  assert.ok(!isLeadId(null));
  assert.equal(leadRef(ID), '3f2b8c1e');
});

test('the alert names industry, team size and company, links the studio, and holds no contact', () => {
  const { subject, html, text } = buildAlertEmail({
    lead: { id: ID, industry: 'Property', team_size: '11-50', company_name: 'Northwind <Lettings>', consent_given: true, contact_email: 'ada@example.com' },
    studioUrl: 'https://greatstoneint.com/#catalogue/leads',
  });
  assert.equal(subject, 'New front door lead: Northwind <Lettings>');
  assert.match(html, /Northwind &lt;Lettings&gt;/);
  assert.ok(!html.includes('<Lettings>'));
  assert.match(html, /11-50 people/);
  assert.match(html, /href="https:\/\/greatstoneint\.com\/#catalogue\/leads"/);
  assert.match(text, /Lead: 3f2b8c1e/);
  assert.ok(!html.includes('ada@example.com') && !text.includes('ada@example.com'));
});

test('when the lead was not saved, the alert carries the contact so it is not lost', () => {
  const contact = contactUpdate({ contact: { name: 'Ada', email: 'ada@example.com', role: 'Owner' }, consent: { given: true, version: 'front-door-consent-v1' } });
  const { subject, html, text } = buildAlertEmail({ lead: {}, studioUrl: 'https://x.test/#catalogue/leads', contact });
  assert.match(subject, /NOT SAVED/);
  assert.match(text, /Email: ada@example.com/);
  assert.match(text, /Yes \(front-door-consent-v1\)/);
  assert.ok(!html.includes('Open front door leads'));
});

test('the alert copy has no prices and no em or en dashes', () => {
  const { html, text } = buildAlertEmail({ lead: { id: ID, industry: 'Retail', company_name: 'Shop' }, studioUrl: 'https://x.test/' });
  assert.ok(!/[–—]/.test(html + text));
  assert.ok(!/[£$€]\s?\d/.test(html + text));
});

test('sendEmail posts to Resend and reports failure without throwing', async () => {
  let call;
  const ok = await sendEmail({ apiKey: 're_test', from: 'G <a@b.co>', to: ['ops@b.co'], subject: 's', html: 'h', text: 't',
    fetchImpl: async (url, init) => { call = { url, init }; return { ok: true }; } });
  assert.deepEqual(ok, { sent: true });
  assert.equal(call.url, 'https://api.resend.com/emails');
  assert.deepEqual(JSON.parse(call.init.body).to, ['ops@b.co']);
  assert.deepEqual(await sendEmail({ apiKey: 're_test', to: 'x@y.co', fetchImpl: async () => ({ ok: false, status: 422 }) }), { sent: false, error: 'resend 422' });
  assert.deepEqual(await sendEmail({ apiKey: 're_test', to: 'x@y.co', fetchImpl: async () => { throw new Error('down'); } }), { sent: false, error: 'resend unreachable' });
  assert.deepEqual(await sendEmail({ apiKey: '', to: 'x@y.co' }), { sent: false, error: 'not configured' });
});

// The migration is the lock-down; check the parts a later edit could quietly undo.
test('migration 0031 keeps the service_inquiries lock-down and holds no IP', () => {
  const sql = readFileSync(new URL('../../migrations/0031_front_door_leads.sql', import.meta.url), 'utf8');
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.match(code, /ENABLE ROW LEVEL SECURITY/);
  assert.match(code, /FORCE ROW LEVEL SECURITY/);
  assert.match(code, /REVOKE ALL ON front_door_leads FROM anon, authenticated/);
  assert.match(code, /USING \(org_id = app_staff_org\(\)\) WITH CHECK \(org_id = app_staff_org\(\)\)/);
  assert.ok(!/GRANT[^;]*\bINSERT\b[^;]*front_door_leads/i.test(code), 'no INSERT grant');
  assert.ok(!/GRANT[^;]*front_door_leads[^;]*\banon\b/i.test(code), 'no anon grant');
  assert.ok(!/\bip(_hash)?\s+text/i.test(code), 'no IP column');
  assert.match(code, /interval '24 months'/);
  assert.match(code, /GRANT EXECUTE ON FUNCTION front_door_purge\(\) TO service_role/);
});
