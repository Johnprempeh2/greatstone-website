import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crmConfig, dealTitle, dealNote, syncLeadToCrm } from './front-door-crm.mjs';

const lead = {
  id: '6f1c2a9e-1111-4222-8333-444455556666', industry: 'Healthcare', industry_other: false, team_size: '11-50',
  company_name: 'Acme Clinics',
  agents: [{ name: 'Amara', role: 'Brand lead', is_lead: true }, { name: 'Kenji', role: 'Bookings' }, { name: 'Sofia', role: 'Follow-ups' }],
  source: { page: '/#go/front-door', gaClientId: '123.456', firstTouch: { utm_source: 'linkedin', utm_medium: 'paid', utm_campaign: 'fd-launch', landing: '/' } },
};
const contact = { contact_name: 'Sam Doe', contact_email: 'sam@example.com', contact_role: 'Practice manager', consent_given: true };
const config = crmConfig({ PIPEDRIVE_API_TOKEN: 'test-token', PIPEDRIVE_STAGE_ID: '7' });

// a fake Pipedrive: records every call, answers by path
function fakePipedrive({ existingPersonId = null, fail = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const key = init.method + ' ' + u.pathname.replace(/^.*\/v1/, '');
    calls.push({ key, url, init, body: init.body ? JSON.parse(init.body) : null });
    if (fail[key]) return { ok: false, status: fail[key], json: async () => ({ success: false }) };
    if (key === 'GET /persons/search') return { ok: true, status: 200, json: async () => ({ success: true, data: { items: existingPersonId ? [{ item: { id: existingPersonId } }] : [] } }) };
    if (key === 'POST /persons') return { ok: true, status: 201, json: async () => ({ success: true, data: { id: 501 } }) };
    if (key === 'POST /deals') return { ok: true, status: 201, json: async () => ({ success: true, data: { id: 901 } }) };
    if (key === 'POST /notes') return { ok: true, status: 201, json: async () => ({ success: true, data: { id: 1 } }) };
    return { ok: false, status: 404, json: async () => null };
  };
  return { calls, fetchImpl };
}
function store(claimAnswer = 'claimed') {
  const s = { claims: 0, releases: 0, saved: null };
  return {
    s,
    claim: async () => { s.claims++; return claimAnswer; },
    release: async () => { s.releases++; },
    save: async (ids) => { s.saved = ids; },
  };
}

test('config: dormant without a token; domain and stage are optional and checked', () => {
  assert.equal(crmConfig({}), null);
  assert.equal(crmConfig({ PIPEDRIVE_API_TOKEN: '  ' }), null);
  assert.deepEqual(crmConfig({ PIPEDRIVE_API_TOKEN: 't' }), { token: 't', base: 'https://api.pipedrive.com/v1', stageId: null });
  assert.equal(crmConfig({ PIPEDRIVE_API_TOKEN: 't', PIPEDRIVE_DOMAIN: 'Acme' }).base, 'https://acme.pipedrive.com/api/v1');
  assert.equal(crmConfig({ PIPEDRIVE_API_TOKEN: 't', PIPEDRIVE_DOMAIN: 'evil.com/x' }).base, 'https://api.pipedrive.com/v1');
  assert.equal(crmConfig({ PIPEDRIVE_API_TOKEN: 't', PIPEDRIVE_STAGE_ID: 'two' }).stageId, null);
});

test('not configured: nothing is claimed and nothing is sent', async () => {
  const p = fakePipedrive(); const st = store();
  const out = await syncLeadToCrm({ config: null, lead, contact, ...st, fetchImpl: p.fetchImpl });
  assert.deepEqual(out, { synced: false, reason: 'not configured' });
  assert.equal(st.s.claims, 0); assert.equal(p.calls.length, 0);
});

test('no contact tick: no Pipedrive follow-up (GRE-467)', async () => {
  const p = fakePipedrive(); const st = store();
  for (const c of [{ ...contact, consent_given: false }, { ...contact, consent_given: 'true' }, null]) {
    const out = await syncLeadToCrm({ config, lead, contact: c, ...st, fetchImpl: p.fetchImpl });
    assert.equal(out.reason, 'no consent');
  }
  assert.equal(st.s.claims, 0); assert.equal(p.calls.length, 0);
});

test('new person: Person, Deal at the configured stage, note, ids saved; token in a header, not the URL', async () => {
  const p = fakePipedrive(); const st = store();
  const out = await syncLeadToCrm({ config, lead, contact, studioUrl: 'https://example.com/#catalogue/leads', ...st, fetchImpl: p.fetchImpl });
  assert.deepEqual(out, { synced: true, reason: 'synced', personId: 501, dealId: 901 });
  assert.deepEqual(p.calls.map((c) => c.key), ['GET /persons/search', 'POST /persons', 'POST /deals', 'POST /notes']);
  const search = new URL(p.calls[0].url);
  assert.equal(search.searchParams.get('term'), 'sam@example.com');
  assert.equal(search.searchParams.get('exact_match'), 'true');
  assert.deepEqual(p.calls[1].body, { name: 'Sam Doe', email: [{ value: 'sam@example.com', primary: true, label: 'work' }] });
  assert.deepEqual(p.calls[2].body, { title: 'Front door: Acme Clinics', person_id: 501, stage_id: 7 });
  assert.equal(p.calls[3].body.deal_id, 901);
  for (const c of p.calls) { assert.equal(c.init.headers['x-api-token'], 'test-token'); assert.ok(!c.url.includes('test-token')); }
  assert.deepEqual(st.s.saved, { personId: 501, dealId: 901 });
  assert.equal(st.s.releases, 0);
});

test('known email: the existing Person gets the new Deal (dedupe by email)', async () => {
  const p = fakePipedrive({ existingPersonId: 42 }); const st = store();
  const out = await syncLeadToCrm({ config, lead, contact, ...st, fetchImpl: p.fetchImpl });
  assert.equal(out.personId, 42);
  assert.ok(!p.calls.some((c) => c.key === 'POST /persons'));
  assert.equal(p.calls.find((c) => c.key === 'POST /deals').body.person_id, 42);
});

test('once per lead: a taken claim sends nothing; a failed claim sends nothing', async () => {
  for (const [answer, reason, synced] of [['taken', 'already synced', true], ['error', 'claim failed', false]]) {
    const p = fakePipedrive(); const st = store(answer);
    const out = await syncLeadToCrm({ config, lead, contact, ...st, fetchImpl: p.fetchImpl });
    assert.deepEqual(out, { synced, reason });
    assert.equal(p.calls.length, 0);
  }
});

test('Pipedrive down: the claim is released so a later S6 can retry, and nothing throws', async () => {
  const p = fakePipedrive({ fail: { 'POST /deals': 500 } }); const st = store();
  const out = await syncLeadToCrm({ config, lead, contact, ...st, fetchImpl: p.fetchImpl });
  assert.equal(out.synced, false);
  assert.match(out.reason, /POST \/deals 500/);
  assert.equal(st.s.releases, 1); assert.equal(st.s.saved, null);
  const net = await syncLeadToCrm({ config, lead, contact, ...store(), fetchImpl: async () => { throw new TypeError('network'); } });
  assert.equal(net.synced, false);
});

test('a failed note keeps the deal', async () => {
  const p = fakePipedrive({ fail: { 'POST /notes': 400 } }); const st = store();
  const out = await syncLeadToCrm({ config, lead, contact, ...st, fetchImpl: p.fetchImpl });
  assert.equal(out.reason, 'synced without note');
  assert.equal(st.s.releases, 0); assert.deepEqual(st.s.saved, { personId: 501, dealId: 901 });
});

test('note: the team, the source and the role, escaped; no chat summary; no value on the deal', () => {
  const html = dealNote({ lead: { ...lead, chat_summary: ['secret plans'], agents: [{ name: '<b>X</b>', role: 'r', is_lead: true }] }, contact, studioUrl: 'https://example.com/#catalogue/leads' });
  assert.ok(html.includes('Practice manager'));
  assert.ok(html.includes('linkedin / paid / fd-launch'));
  assert.ok(html.includes('123.456'));
  assert.ok(html.includes('&lt;b&gt;X&lt;/b&gt;: r (lead)'));
  assert.ok(!html.includes('<b>X</b>'));
  assert.ok(!html.includes('secret plans'));
  assert.equal(dealTitle({ company_name: '  ' }), 'Front door: new team');
});
