import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseServiceEnquiry, storedMessage, buildServiceEnquiryAlert, buildServiceEnquiryConfirmation,
  serviceDealNote, syncServiceEnquiryToCrm, handleServiceEnquiry } from './service-enquiry.mjs';
import { makeServiceInquiryHandler } from '../../service-inquiry.mjs';

const THREE = [
  { slug: 'business-website-build', name: 'Business Website Build', category: 'Websites & Web Apps', kind: 'service' },
  { slug: 'whatsapp-channel', name: 'WhatsApp Channel', category: 'Comms Channels', kind: 'service' },
  { slug: 'live-dashboard', name: 'Live Dashboard', category: 'Intelligence & Reporting', kind: 'service' },
];
const body = { services: THREE, name: 'Ada Lovelace', email: 'ada@example.org', company: 'Engines Ltd', contact_role: 'owner_director', message: 'We want all three by spring.' };

function deps(over = {}) {
  const sent = { alerts: [], confirmations: [], crm: [], logs: [] };
  return { sent, deps: {
    studioUrl: 'https://site.test/#catalogue/inquiries',
    save: async () => '12345678-aaaa-bbbb-cccc-1234567890ab',
    sendAlert: async (msg) => { sent.alerts.push(msg); return { sent: true }; },
    sendConfirmation: async (to, msg) => { sent.confirmations.push({ to, ...msg }); return { sent: true }; },
    syncCrm: async (arg) => { sent.crm.push(arg); return { synced: true, reason: 'synced' }; },
    log: (level, msg) => sent.logs.push([level, msg]),
    ...over,
  } };
}

test('three services: saved, alert and confirmation list every service, CRM gets the enquiry', async () => {
  const { sent, deps: d } = deps();
  const out = await handleServiceEnquiry(body, d);
  assert.equal(out.status, 200);
  assert.equal(out.body.ok, true);
  assert.equal(sent.alerts.length, 1);
  assert.equal(sent.confirmations.length, 1);
  assert.equal(sent.confirmations[0].to, 'ada@example.org');
  for (const s of THREE) {
    assert.match(sent.alerts[0].text, new RegExp(s.name));
    assert.match(sent.confirmations[0].text, new RegExp(s.name));
    assert.match(sent.confirmations[0].html, new RegExp(s.name));
  }
  assert.match(sent.alerts[0].subject, /New basket enquiry: Engines Ltd, 3 services/);
  assert.match(sent.alerts[0].text, /Role: Owner or director/);
  assert.match(sent.confirmations[0].subject, /Your Greatstone enquiry \(12345678\)/);
  assert.doesNotMatch(sent.confirmations[0].text, /£|price/i);
  assert.equal(sent.crm[0].enquiry.services.length, 3);
});

test('the lead is kept when the save fails but the alert goes, and lost only when both fail', async () => {
  const kept = deps({ save: async () => null });
  const out = await handleServiceEnquiry(body, kept.deps);
  assert.equal(out.status, 200);
  assert.match(kept.sent.alerts[0].subject, /NOT SAVED/);
  const lost = deps({ save: async () => null, sendAlert: async () => ({ sent: false, error: 'resend 500' }) });
  const failed = await handleServiceEnquiry(body, lost.deps);
  assert.equal(failed.status, 503);
  assert.equal(lost.sent.confirmations.length, 0);
});

test('confirmation or CRM failures never change the answer', async () => {
  const { deps: d, sent } = deps({
    sendConfirmation: async () => { throw new Error('down'); },
    syncCrm: async () => ({ synced: false, reason: 'pipedrive POST /deals 500' }),
  });
  const out = await handleServiceEnquiry(body, d);
  assert.equal(out.status, 200);
  assert.ok(sent.logs.some(([, m]) => /pipedrive/.test(m)));
});

test('rate limit, honeypot and bad input', async () => {
  const limited = deps({ save: async () => { throw Object.assign(new Error('rate limited'), { rateLimited: true }); } });
  assert.equal((await handleServiceEnquiry(body, limited.deps)).status, 429);
  const bot = deps();
  assert.deepEqual(await handleServiceEnquiry({ ...body, website: 'x' }, bot.deps), { status: 200, body: { ok: true } });
  assert.equal(bot.sent.alerts.length, 0);
  assert.equal(normaliseServiceEnquiry({ ...body, email: 'nope' }).ok, false);
  assert.equal(normaliseServiceEnquiry({ ...body, contact_role: 'ceo' }).ok, false);
  assert.equal(normaliseServiceEnquiry({ ...body, services: [] }).ok, false);
  assert.equal(normaliseServiceEnquiry({ ...body, services: [{ slug: '../x' }] }).ok, false);
});

test('the role travels in the stored message; the basket dump stays out of emails', () => {
  const { enquiry } = normaliseServiceEnquiry({ ...body, message: 'Hello\nBasket: [{"name":"x"}]' });
  assert.equal(storedMessage(enquiry), 'Role: Owner or director\n\nHello\nBasket: [{"name":"x"}]');
  const alert = buildServiceEnquiryAlert({ enquiry, saved: true, ref: 'abc' });
  assert.doesNotMatch(alert.text, /Basket: \[/);
  assert.match(alert.text, /Hello/);
  assert.equal(storedMessage(normaliseServiceEnquiry({ ...body, contact_role: '', message: '' }).enquiry), null);
  assert.doesNotMatch(buildServiceEnquiryConfirmation({ enquiry: normaliseServiceEnquiry({ ...body, name: '<b>x</b>' }).enquiry }).html, /<b>x/);
});

test('Pipedrive: one person by email, one deal, a note listing the services; off without a token', async () => {
  const { enquiry } = normaliseServiceEnquiry(body);
  assert.deepEqual(await syncServiceEnquiryToCrm({ config: null, enquiry }), { synced: false, reason: 'not configured' });
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, method: opts.method, body: opts.body ? JSON.parse(opts.body) : null });
    const data = url.includes('/persons/search') ? { items: [] } : url.endsWith('/persons') ? { id: 7 } : url.endsWith('/deals') ? { id: 9 } : { id: 1 };
    return new Response(JSON.stringify({ success: true, data }), { status: 200 });
  };
  const out = await syncServiceEnquiryToCrm({ config: { token: 't', base: 'https://api.pipedrive.com/v1', stageId: 3 }, enquiry, ref: 'abc', fetchImpl });
  assert.deepEqual(out, { synced: true, reason: 'synced', personId: 7, dealId: 9 });
  assert.deepEqual(calls.map((c) => c.method + ' ' + c.url.replace('https://api.pipedrive.com/v1', '').split('?')[0]),
    ['GET /persons/search', 'POST /persons', 'POST /deals', 'POST /notes']);
  assert.deepEqual(calls[2].body, { title: 'Service enquiry: Engines Ltd', person_id: 7, stage_id: 3 });
  for (const s of THREE) assert.match(calls[3].body.content, new RegExp(s.name));
  assert.match(serviceDealNote({ enquiry }), /Owner or director/);
});

test('the function saves through submit_service_inquiry with the role in the message and emails both sides', async () => {
  const queries = [];
  const client = { query: async (sql, params) => { queries.push([sql, params]); return { rows: [{ id: 'abcdef12-0000' }] }; }, release() {} };
  const emails = [];
  const fetchImpl = async (url, opts) => { emails.push(JSON.parse(opts.body)); return new Response('{}', { status: 200 }); };
  const handler = makeServiceInquiryHandler({ pool: () => ({ connect: async () => client }), fetchImpl, log: () => {},
    env: { RESEND_API_KEY: 'k', RESEND_FROM: 'Greatstone <hello@greatstoneint.com>', ENQUIRY_ALERT_TO: 'team@example.org' } });
  const res = await handler(new Request('https://site.test/api/service-inquiry', { method: 'POST', body: JSON.stringify(body) }), { ip: '192.0.2.9' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, id: 'abcdef12-0000' });
  const rpc = queries.find(([sql]) => sql.includes('submit_service_inquiry'))[1];
  assert.equal(JSON.parse(rpc[0]).length, 3);
  assert.deepEqual(rpc.slice(1), ['Ada Lovelace', 'ada@example.org', 'Engines Ltd', 'Role: Owner or director\n\nWe want all three by spring.']);
  assert.deepEqual(emails.map((e) => e.to), [['team@example.org'], 'ada@example.org']);
});
