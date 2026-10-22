import test from 'node:test';
import assert from 'node:assert/strict';
import { sendToolLead } from './lead-tools.mjs';
import { fireLead } from './enquiry.mjs';

test('tool lead sends only the supplied summary through the enquiry contract', async () => {
  let payload;
  const out = await sendToolLead({ name: ' Jane ', email: ' jane@example.com ', company: '',
    interest: 'AI Readiness Baseline', summary: 'Overall: 2.5 of 4, Follower.',
    attribution: { first: null, last: { landing: '/home' } }, page: '/#go/dx-consultancy' },
  async (sent) => { payload = sent; return { ok: true }; });
  assert.deepEqual(out, { ok: true });
  assert.equal(payload.name, 'Jane');
  assert.equal(payload.company, '');
  assert.equal(payload.message, 'Interest: AI Readiness Baseline\n\nOverall: 2.5 of 4, Follower.');
  assert.equal(payload.page, '/#go/dx-consultancy');
  assert.equal(JSON.stringify(payload).includes('answers'), false);
});

test('failed send remains a failure and emits no lead event', async () => {
  const out = await sendToolLead({ email: 'jane@example.com' }, async () => ({ ok: false }));
  assert.deepEqual(out, { ok: false });
  const events = [];
  assert.equal(fireLead({ track: (...args) => events.push(args), getConsent: () => 'denied', form: 'ai_cost_calc' }), false);
  assert.equal(events.length, 0);
  assert.equal(fireLead({ track: (...args) => events.push(args), getConsent: () => 'granted', form: 'ai_cost_calc' }), true);
  assert.equal(events[0][1].form, 'ai_cost_calc');
});
