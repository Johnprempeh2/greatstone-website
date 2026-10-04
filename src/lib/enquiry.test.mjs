import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enquiryPayload, makeEnquiryClient, fireLead, isEmail } from './enquiry.mjs';

const ATTR = {
  first: { utm_source: 'linkedin', utm_medium: 'paid', utm_campaign: 'r1', landing: '/' },
  last: { utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'oct', landing: '/insights' },
};

test('enquiryPayload trims the fields and carries first and last touch', () => {
  const p = enquiryPayload({ name: ' Jane ', email: ' jane@stonewell.co ', message: ' hi ' }, ATTR, '/contact');
  assert.equal(p.name, 'Jane');
  assert.equal(p.email, 'jane@stonewell.co');
  assert.deepEqual(p.attribution, ATTR);
  assert.equal(p.page, '/contact');
  assert.equal(p.website, '');
  assert.deepEqual(enquiryPayload({}, null).attribution, { first: null, last: null });
});

test('isEmail', () => {
  assert.equal(isEmail('a@b.co'), true);
  assert.equal(isEmail('a@b'), false);
  assert.equal(isEmail(''), false);
});

test('client posts to the enquiry function with the anon key and reads ok', async () => {
  let seen = null;
  const client = makeEnquiryClient({
    url: 'https://proj.supabase.co/', anonKey: 'anon',
    fetchImpl: async (u, init) => { seen = { u, init }; return { ok: true, json: async () => ({ ok: true, ref: 'abcd1234' }) }; },
  });
  const out = await client.send({ email: 'a@b.co' });
  assert.deepEqual(out, { ok: true, ref: 'abcd1234' });
  assert.equal(seen.u, 'https://proj.supabase.co/functions/v1/enquiry');
  assert.equal(seen.init.headers.apikey, 'anon');
  assert.deepEqual(JSON.parse(seen.init.body), { email: 'a@b.co' });
});

test('client failure paths all resolve { ok: false } so the page shows the contact address', async () => {
  const cases = [
    async () => { throw new Error('offline'); },
    async () => ({ ok: false, json: async () => ({ ok: false, error: 'x' }) }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError('html'); } }),
    async () => ({ ok: true, json: async () => ({ ok: false }) }),
  ];
  for (const fetchImpl of cases) {
    assert.deepEqual(await makeEnquiryClient({ url: 'https://p', anonKey: 'k', fetchImpl }).send({}), { ok: false });
  }
  const none = makeEnquiryClient({ url: '', anonKey: '' });
  assert.equal(none.configured, false);
  assert.deepEqual(await none.send({}), { ok: false });
});

test('generate_lead fires only after consent, with the UTM source, medium and campaign', () => {
  const events = [];
  const track = (e, p) => events.push([e, p]);
  assert.equal(fireLead({ track, getConsent: () => null, attribution: ATTR }), false);
  assert.equal(fireLead({ track, getConsent: () => 'denied', attribution: ATTR }), false);
  assert.equal(events.length, 0);
  assert.equal(fireLead({ track, getConsent: () => 'granted', attribution: ATTR }), true);
  assert.deepEqual(events[0], ['generate_lead', { form: 'enquiry', utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'oct' }]);
  fireLead({ track, getConsent: () => 'granted', attribution: { first: ATTR.first, last: { landing: '/x' } } });
  assert.equal(events[1][1].utm_source, 'linkedin', 'last touch without a campaign falls back to first touch');
  fireLead({ track, getConsent: () => 'granted', attribution: {} });
  assert.deepEqual(events[2][1], { form: 'enquiry', utm_source: '(direct)', utm_medium: '(none)', utm_campaign: '(not set)' });
  assert.doesNotMatch(JSON.stringify(events), /@/, 'no personal data in GA');
});
