// Front door team pack (GRE-464): the email of the three employees and its once-per-lead send. `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTeamPackEmail, deliverTeamPack, packAgents, BRAND_SIGNOFF, BOOKING_URL } from './front-door-pack.mjs';
import { buildAlertEmail } from './front-door-leads.mjs';
import { BRAND_SIGNOFF as SITE_SIGNOFF } from '../../../src/lib/brand.mjs';
import { BOOKING_URL as SITE_BOOKING } from '../../../src/lib/booking.js';

const agents = [
  { name: 'Kenji', role: 'Lettings coordinator', is_lead: false, personality: ['quick', 'tidy', 'calm'],
    first_tasks: ['Book viewings', 'Chase references', 'Update listings'], works_with: 'Hands signed tenants to Sofia.' },
  { name: 'Amara', role: 'Brand guardian', is_lead: true, personality: ['trusted', 'local', 'warm'],
    first_tasks: ['Set the tone guide', 'Check every listing', 'Review replies'], works_with: 'Checks what Kenji and Sofia send.' },
  { name: 'Sofia', role: 'Tenant care', is_lead: false, personality: ['kind', 'clear', 'steady'],
    first_tasks: ['Welcome new tenants', 'Log repairs', 'Send reminders'], works_with: 'Reports to Amara weekly.' },
];
const lead = { id: '3f2b8c1e-9a4d-4e7f-8b21-5c6d7e8f9a0b', company_name: 'Northwind Lettings', agents };
const contact = { contact_name: 'Jane Doe', contact_email: 'jane@northwind.test', contact_role: 'Director' };

test('the mirrored brand sign-off and booking link match the site', () => {
  assert.equal(BRAND_SIGNOFF, SITE_SIGNOFF);
  assert.equal(BOOKING_URL, SITE_BOOKING);
});

test('the pack shows all three cards, lead first, with every visible field', () => {
  const out = buildTeamPackEmail({ contactName: 'Jane Doe', companyName: 'Northwind Lettings', agents });
  assert.equal(out.subject, 'Your team pack for Northwind Lettings');
  assert.ok(out.html.indexOf('Amara') < out.html.indexOf('Kenji'), 'lead card comes first');
  for (const a of agents) {
    for (const s of [a.name, a.role, ...a.personality, ...a.first_tasks, a.works_with]) {
      assert.ok(out.html.includes(s), 'html has ' + s);
      assert.ok(out.text.includes(s), 'text has ' + s);
    }
  }
  assert.match(out.html, /Lead: guards the brand and checks the other two/);
  assert.match(out.text, /^Hi Jane,$/m);
  assert.ok(out.html.includes(BOOKING_URL) && out.text.includes(BOOKING_URL));
  assert.match(out.text, /The deep dive designs the whole company around your goal\./);
});

test('the pack never shows the staff-only chat summary', () => {
  const out = buildTeamPackEmail({ agents: agents.map((a) => ({ ...a, chat_summary: 'SECRET-SUMMARY' })) });
  assert.equal(out.html.includes('SECRET-SUMMARY'), false);
  assert.deepEqual(Object.keys(packAgents(agents)[0]).sort(), ['firstTasks', 'isLead', 'name', 'personality', 'role', 'worksWith']);
});

test('visitor text is escaped and no remote image is loaded', () => {
  const out = buildTeamPackEmail({ companyName: '<img src=x onerror=alert(1)>', contactName: '"Bob"', agents });
  assert.equal(out.html.includes('<img'), false);
  assert.ok(out.html.includes('&lt;img src=x'));
  assert.doesNotMatch(out.html, /src=["']?https?:/);
});

test('only an https booking link goes in the button', () => {
  const out = buildTeamPackEmail({ agents, bookingUrl: 'javascript:alert(1)' });
  assert.equal(out.html.includes('javascript:'), false);
  assert.ok(out.html.includes(BOOKING_URL));
});

test('house style: no em or en dashes, no greeting name when none given', () => {
  const out = buildTeamPackEmail({ agents });
  for (const s of [out.subject, out.html, out.text]) assert.doesNotMatch(s, /[–—]/);
  assert.equal(out.subject, 'Your team pack');
  assert.match(out.text, /^Hello,$/m);
});

test('no team, no email', () => {
  assert.equal(buildTeamPackEmail({ agents: [] }), null);
  assert.equal(buildTeamPackEmail({ agents: [{ name: '', role: '' }] }), null);
  assert.equal(buildTeamPackEmail(), null);
});

// deliverTeamPack: a fake claim/release/send that records what happened.
function rig({ claim = 'claimed', sent = true } = {}) {
  const log = [];
  return {
    log,
    claim: async () => { log.push('claim'); return claim; },
    release: async () => { log.push('release'); },
    send: async (msg) => { log.push('send:' + msg.to); return sent ? { sent: true } : { sent: false, error: 'resend 500' }; },
  };
}

test('sends once to the address the visitor typed', async () => {
  const r = rig();
  const out = await deliverTeamPack({ lead, contact, ...r });
  assert.deepEqual(out, { sent: true, reason: 'sent' });
  assert.deepEqual(r.log, ['claim', 'send:jane@northwind.test']);
});

test('a second S6 for the same lead sends nothing more', async () => {
  const r = rig({ claim: 'taken' });
  const out = await deliverTeamPack({ lead, contact, ...r });
  assert.deepEqual(out, { sent: true, reason: 'already sent' });
  assert.deepEqual(r.log, ['claim']);
});

test('a failed send releases the claim so a retry can send', async () => {
  const r = rig({ sent: false });
  const out = await deliverTeamPack({ lead, contact, ...r });
  assert.equal(out.sent, false);
  assert.deepEqual(r.log, ['claim', 'send:jane@northwind.test', 'release']);
});

test('a claim the database cannot make sends nothing (0032 not applied)', async () => {
  const r = rig({ claim: 'error' });
  assert.deepEqual(await deliverTeamPack({ lead, contact, ...r }), { sent: false, reason: 'claim failed' });
  assert.deepEqual(r.log, ['claim']);
});

test('no saved team or no address: no claim, no send; a throw never escapes', async () => {
  const r = rig();
  assert.equal((await deliverTeamPack({ lead: { ...lead, agents: [] }, contact, ...r })).sent, false);
  assert.equal((await deliverTeamPack({ lead, contact: {}, ...r })).sent, false);
  assert.deepEqual(r.log, []);
  const out = await deliverTeamPack({ lead, contact, claim: async () => { throw new Error('db'); }, release: async () => {}, send: async () => ({ sent: true }) });
  assert.deepEqual(out, { sent: false, reason: 'unexpected' });
});

test('the internal alert says whether the pack went', () => {
  assert.match(buildAlertEmail({ lead, packSent: true }).text, /^Team pack: Sent$/m);
  assert.match(buildAlertEmail({ contact: { ...contact, consent_given: false }, packSent: false }).text, /^Team pack: Not sent\. Send it by hand\.$/m);
  assert.doesNotMatch(buildAlertEmail({ lead }).text, /Team pack/);
});
