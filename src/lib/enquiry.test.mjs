import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enquiryPayload, makeEnquiryClient, fireLead, isEmail, validateEnquiry, SIZE_BANDS, CONSENT, INTEREST_OPTIONS, interestKey, parseEnquireHref, setPendingInterest, takePendingInterest } from './enquiry.mjs';

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

test('the optional interest choice leads the message, and is left out when not chosen', () => {
  assert.equal(enquiryPayload({ message: ' hi ', interest: ' GS Agentic Manager ' }).message, 'Interest: GS Agentic Manager\n\nhi');
  assert.equal(enquiryPayload({ interest: 'Not sure yet' }).message, 'Interest: Not sure yet');
  assert.equal(enquiryPayload({ message: 'hi', interest: '' }).message, 'hi');
  assert.equal(enquiryPayload({ message: 'hi' }).message, 'hi');
});

test('"#enquire/<key>" preselects a listed option once, and nothing else', () => {
  assert.equal(INTEREST_OPTIONS.length, 5);
  assert.equal(interestKey('GS Agentic Manager'), 'gs-agentic-manager');
  assert.equal(parseEnquireHref('#enquire/gs-agentic-manager'), 'gs-agentic-manager');
  assert.equal(parseEnquireHref('#go/contact'), null);
  assert.equal(parseEnquireHref('#enquire/<x>'), null);
  setPendingInterest('gs-agentic-manager');
  assert.equal(takePendingInterest(INTEREST_OPTIONS), 'GS Agentic Manager');
  assert.equal(takePendingInterest(INTEREST_OPTIONS), '', 'taken once');
  setPendingInterest('not-an-option');
  assert.equal(takePendingInterest(INTEREST_OPTIONS), '');
});

test('isEmail', () => {
  assert.equal(isEmail('a@b.co'), true);
  assert.equal(isEmail('a@b'), false);
  assert.equal(isEmail(''), false);
});

test('client posts to the site\'s own /api/enquiry with no Supabase key, and reads ok', async () => {
  let seen = null;
  const client = makeEnquiryClient({
    fetchImpl: async (u, init) => { seen = { u, init }; return { ok: true, json: async () => ({ ok: true, ref: 'abcd1234' }) }; },
  });
  const out = await client.send({ email: 'a@b.co' });
  assert.deepEqual(out, { ok: true, ref: 'abcd1234' });
  assert.equal(seen.u, '/api/enquiry');
  assert.deepEqual(Object.keys(seen.init.headers), ['content-type']);
  assert.doesNotMatch(seen.u + JSON.stringify(seen.init), /supabase|apikey|authorization/i);
  assert.deepEqual(JSON.parse(seen.init.body), { email: 'a@b.co' });
});

test('the Turnstile token travels only when there is one', () => {
  assert.equal(enquiryPayload({ email: 'a@b.co', turnstile: ' tok ' }).turnstile, 'tok');
  assert.equal('turnstile' in enquiryPayload({ email: 'a@b.co' }), false);
});

test('client failure paths all resolve { ok: false } so the page shows the contact address', async () => {
  const cases = [
    async () => { throw new Error('offline'); },
    async () => ({ ok: false, json: async () => ({ ok: false, error: 'x' }) }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError('html'); } }),
    async () => ({ ok: true, json: async () => ({ ok: false }) }),
  ];
  for (const fetchImpl of cases) {
    assert.deepEqual(await makeEnquiryClient({ fetchImpl }).send({}), { ok: false });
  }
  const none = makeEnquiryClient({ endpoint: '' });
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

test('GRE-970: name and email are the only required answers, with the §4.6 field errors', () => {
  assert.deepEqual(validateEnquiry({ name: 'Jane', email: 'jane@stonewell.co' }), {});
  assert.deepEqual(validateEnquiry({ name: '  ', email: 'jane@stonewell' }), { name: 'Please add your name.', email: 'Please add an email address we can reply to.' });
  assert.deepEqual(validateEnquiry({ email: 'jane@stonewell.co' }), { name: 'Please add your name.' });
});

test('GRE-970: the size band travels in the payload; it is optional and qualifies, it is not a price', () => {
  assert.deepEqual(SIZE_BANDS, ['Under 10', '11 to 50', '51 to 250', 'More than 250']);
  assert.equal(enquiryPayload({ email: 'a@b.co', size_band: ' 51 to 250 ' }).size_band, '51 to 250');
  assert.equal(enquiryPayload({ email: 'a@b.co' }).size_band, '');
  assert.match(CONSENT, /^I agree that Greatstone can use these details to reply to my enquiry\. See our <a href="#go\/privacy">Privacy Policy<\/a>\.$/);
});
