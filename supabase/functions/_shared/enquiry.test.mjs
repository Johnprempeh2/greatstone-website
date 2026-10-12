import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normaliseEnquiry, normaliseAttribution, enquiryRow, buildEnquiryAlert, handleEnquiry, splitInterest, sourceLabel, PER_IP_PER_DAY,
} from './enquiry.mjs';

const MIGRATION = readFileSync(new URL('../../migrations/0035_service_inquiry_attribution.sql', import.meta.url), 'utf8');
const SIZE_MIGRATION = readFileSync(new URL('../../migrations/0040_service_inquiry_size_band.sql', import.meta.url), 'utf8');
const SIZE_ROLLBACK = readFileSync(new URL('../../rollback/0040_service_inquiry_size_band_down.sql', import.meta.url), 'utf8');

const BODY = {
  name: '  Jane   Stonewell ', company: 'Stonewell & Co.', email: 'jane@stonewell.co', industry: 'Retail & E-commerce',
  size_band: '11 to 50', message: 'Line one\r\n\r\n\r\n\r\nLine two', page: '/contact',
  attribution: {
    first: { utm_source: 'linkedin', utm_medium: 'paid', utm_campaign: 'r1', landing: '/', referrer: '', at: '2026-10-01T09:00:00Z', email: 'x@y.z' },
    last: { utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'oct', landing: '/insights', at: '2026-10-03T09:00:00Z' },
    extra: 'dropped',
  },
};

// A fake backend: records what the handler did, each step can be told to fail.
function deps({ count = 0, save = 'ok', alert = 'ok' } = {}) {
  const calls = { rows: [], alerts: [], marked: [], logs: [] };
  return {
    calls,
    ip: '203.0.113.9', studioUrl: 'https://example.test/#catalogue/inquiries', now: () => new Date('2026-10-12T08:14:00Z'),
    countRecent: async () => { if (count === 'throw') throw new Error('db'); return count; },
    saveRow: async (row) => {
      calls.rows.push(row);
      if (save === 'throw') throw new Error('db down');
      return save === 'ok' ? { id: '0a813d37-64e1-4c07-bb93-69752653cae1' } : null;
    },
    sendAlert: async (msg) => {
      calls.alerts.push(msg);
      if (alert === 'throw') throw new Error('net');
      return alert === 'ok' ? { sent: true } : { sent: false, error: 'resend 500' };
    },
    markAlerted: async (id) => { calls.marked.push(id); },
    log: (level, msg) => calls.logs.push([level, msg]),
  };
}

test('normaliseEnquiry trims fields, keeps message lines, and needs a reply address', () => {
  const out = normaliseEnquiry(BODY);
  assert.equal(out.ok, true);
  assert.equal(out.enquiry.name, 'Jane Stonewell');
  assert.equal(out.enquiry.message, 'Line one\n\nLine two');
  assert.equal(normaliseEnquiry({ ...BODY, email: 'not-an-email' }).ok, false);
  assert.equal(normaliseEnquiry({}).ok, false);
  assert.equal(normaliseEnquiry({ email: 'a@b.co', message: 'x'.repeat(5000) }).enquiry.message.length, 4000);
  assert.equal(normaliseEnquiry({ email: 'a@b.co', name: '<script>' }).enquiry.name, 'script');
});

test('normaliseAttribution keeps first and last touch, only the keys analytics.js writes', () => {
  const a = normaliseAttribution(BODY.attribution, BODY.page);
  assert.deepEqual(a.first, { utm_source: 'linkedin', utm_medium: 'paid', utm_campaign: 'r1', landing: '/', at: '2026-10-01T09:00:00.000Z' });
  assert.equal(a.last.utm_campaign, 'oct');
  assert.equal(a.page, '/contact');
  assert.equal('extra' in a, false);
  assert.deepEqual(normaliseAttribution(null, ''), {});
  assert.deepEqual(normaliseAttribution({ first: 'junk', last: { at: 'not a date' } }), {});
});

test('enquiryRow is a contact-form row: no services, source contact, attribution attached', () => {
  const { enquiry } = normaliseEnquiry(BODY);
  const row = enquiryRow({ orgId: 'org', enquiry, attribution: { page: '/contact' }, ip: '' });
  assert.deepEqual(row.services, []);
  assert.equal(row.source, 'contact');
  assert.equal(row.org_id, 'org');
  assert.equal(row.ip, 'unknown');
  assert.equal(row.industry, 'Retail & E-commerce');
  assert.equal(row.size_band, '11 to 50');
  assert.equal(enquiryRow({ enquiry: normaliseEnquiry({ email: 'a@b.co' }).enquiry }).size_band, null, 'no answer, no band');
  assert.deepEqual(row.attribution, { page: '/contact' });
  assert.equal('org_id' in enquiryRow({ enquiry, attribution: {} }), false);
});

test('save path: the row is saved with attribution, the owner is alerted, the alert is marked', async () => {
  const d = deps();
  const out = await handleEnquiry(BODY, d);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { ok: true, ref: '0a813d37' });
  assert.equal(d.calls.rows.length, 1);
  assert.equal(d.calls.rows[0].contact_email, 'jane@stonewell.co');
  assert.equal(d.calls.rows[0].ip, '203.0.113.9');
  assert.equal(d.calls.rows[0].attribution.first.utm_source, 'linkedin');
  assert.equal(d.calls.rows[0].attribution.last.utm_source, 'newsletter');
  assert.equal(d.calls.alerts.length, 1);
  assert.equal(d.calls.alerts[0].subject, 'New enquiry: Stonewell & Co., 11 to 50');
  assert.match(d.calls.alerts[0].text, /https:\/\/example\.test\/#catalogue\/inquiries/);
  assert.equal(d.calls.rows[0].size_band, '11 to 50');
  assert.deepEqual(d.calls.marked, ['0a813d37-64e1-4c07-bb93-69752653cae1']);
});

test('alert path: the alert names both touches and escapes what the visitor typed', () => {
  const { enquiry } = normaliseEnquiry({ ...BODY, company: 'A "quoted" & co' });
  const msg = buildEnquiryAlert({ enquiry, attribution: normaliseAttribution(BODY.attribution, '/contact'), saved: true, ref: 'abcd1234' });
  assert.match(msg.text, /First visit from: linkedin \/ paid \/ r1/);
  assert.match(msg.text, /Latest visit from: newsletter \/ email \/ oct/);
  assert.match(msg.text, /Enquiry: abcd1234/);
  assert.match(msg.html, /A &quot;quoted&quot; &amp; co/);
  assert.match(buildEnquiryAlert({ enquiry, attribution: {}, saved: true }).text, /First visit from: Not known/);
  assert.match(buildEnquiryAlert({ enquiry, attribution: { first: { landing: '/' } }, saved: true }).text, /First visit from: Direct or organic/);
});

test('failure path: row not saved, so the alert carries the whole enquiry and the visitor still gets ok', async () => {
  for (const save of ['null', 'throw']) {
    const d = deps({ save });
    const out = await handleEnquiry(BODY, d);
    assert.equal(out.status, 200);
    assert.equal(out.body.ok, true);
    assert.match(d.calls.alerts[0].subject, /^Enquiry NOT SAVED/);
    assert.match(d.calls.alerts[0].text, /Line one\n\nLine two/);
    assert.match(d.calls.alerts[0].text, /jane@stonewell\.co/);
    assert.deepEqual(d.calls.marked, []);
    assert.ok(d.calls.logs.some(([l]) => l === 'error'));
  }
});

test('failure path: saved but the alert fails, the visitor gets ok and the row is not marked alerted', async () => {
  for (const alert of ['fail', 'throw']) {
    const d = deps({ alert });
    const out = await handleEnquiry(BODY, d);
    assert.equal(out.body.ok, true);
    assert.deepEqual(d.calls.marked, []);
    assert.ok(d.calls.logs.some(([l, m]) => l === 'warn' && /alert not sent/.test(m)));
  }
});

test('failure path: neither saved nor alerted, the visitor is told to email (never a silent ok)', async () => {
  const d = deps({ save: 'null', alert: 'fail' });
  const out = await handleEnquiry(BODY, d);
  assert.equal(out.status, 503);
  assert.equal(out.body.ok, false);
  assert.match(out.body.error, /email us/);
  assert.ok(d.calls.logs.some(([, m]) => /LOST/.test(m)));
});

test('bad input, honeypot and rate limit', async () => {
  let d = deps();
  let out = await handleEnquiry({ ...BODY, email: '' }, d);
  assert.equal(out.status, 400);
  assert.equal(d.calls.rows.length, 0);

  d = deps();
  out = await handleEnquiry({ ...BODY, website: 'http://spam' }, d);
  assert.deepEqual(out, { status: 200, body: { ok: true } });
  assert.equal(d.calls.rows.length + d.calls.alerts.length, 0, 'a bot keeps nothing and alerts no one');

  d = deps({ count: PER_IP_PER_DAY });
  out = await handleEnquiry(BODY, d);
  assert.equal(out.status, 429);
  assert.equal(d.calls.rows.length, 0);

  d = deps({ count: 'throw' });
  out = await handleEnquiry(BODY, d);
  assert.equal(out.body.ok, true, 'a count failure does not block a real lead');
});

test('migration 0035 only adds columns, keeps RLS untouched, and carries rollback notes', () => {
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS attribution\s+jsonb NOT NULL DEFAULT '\{\}'/);
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS industry/);
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS alert_sent_at/);
  assert.match(MIGRATION, /Rollback/);
  assert.doesNotMatch(MIGRATION, /\bGRANT\b|CREATE POLICY|DISABLE ROW LEVEL SECURITY/i);
});

test('owner alert is worded as GRE-652 §4.6: who, size band, time, the work, source, then Pipedrive', () => {
  const { enquiry } = normaliseEnquiry({ ...BODY, message: 'Interest: GS Agentic Manager\n\nWeekly reporting' });
  const msg = buildEnquiryAlert({ enquiry, attribution: normaliseAttribution(BODY.attribution, '/contact'), saved: true, ref: 'abcd1234', at: new Date('2026-10-12T08:14:00Z') });
  assert.equal(msg.subject, 'New enquiry: Stonewell & Co., 11 to 50');
  const lines = msg.text.split('\n');
  assert.equal(lines[0], 'Jane Stonewell at Stonewell & Co. (11 to 50) sent an enquiry at 12 Oct 2026, 09:14.', 'UK time');
  assert.equal(lines[1], 'Interested in: GS Agentic Manager.');
  assert.equal(lines[2], 'Work they want time back from: "Weekly reporting".');
  assert.equal(lines[3], 'Source: newsletter / oct.');
  assert.equal(lines[4], 'Then add them to Pipedrive.');
  assert.match(msg.text, /Organisation size: 11 to 50/);
  assert.match(msg.html, /Work they want time back from: &quot;Weekly reporting&quot;/);
  // D6 is open: no reply-by time or working-day promise in the alert
  assert.doesNotMatch(msg.text + msg.html, /working day|Reply by/i);
  // no size band, no company, no message: the sentence still reads
  const bare = buildEnquiryAlert({ enquiry: normaliseEnquiry({ email: 'a@b.co' }).enquiry, saved: true, at: new Date('2026-01-05T15:00:00Z') });
  assert.equal(bare.subject, 'New enquiry: a@b.co');
  assert.equal(bare.text.split('\n')[0], 'a@b.co sent an enquiry at 5 Jan 2026, 15:00.');
  assert.match(bare.text, /^Source: direct\.$/m);
  assert.doesNotMatch(bare.text, /Work they want|Interested in|Organisation size/);
});

test('splitInterest and sourceLabel', () => {
  assert.deepEqual(splitInterest('Interest: Not sure yet'), { interest: 'Not sure yet', work: '' });
  assert.deepEqual(splitInterest('Interest: A\n\nline 1\nline 2'), { interest: 'A', work: 'line 1\nline 2' });
  assert.deepEqual(splitInterest('Just words. Interest: no'), { interest: '', work: 'Just words. Interest: no' });
  assert.equal(sourceLabel({ first: { utm_source: 'linkedin', utm_campaign: 'r1' } }), 'linkedin / r1');
  assert.equal(sourceLabel({ first: { utm_source: 'linkedin' }, last: { landing: '/' } }), 'linkedin');
  assert.equal(sourceLabel({}), 'direct');
});

test('size band: capped at 40 like the column check, and a missing name still reaches us', async () => {
  assert.equal(normaliseEnquiry({ email: 'a@b.co', size_band: 'x'.repeat(60) }).enquiry.size_band.length, 40);
  const d = deps();
  const out = await handleEnquiry({ email: 'jane@stonewell.co' }, d);
  assert.equal(out.body.ok, true, 'an older page without the name field still saves');
  assert.equal(normaliseEnquiry({ email: 'nope' }).error, 'Please add an email address we can reply to.');
});

test('migration 0040 adds one column with a length check, keeps RLS untouched, and has a rollback', () => {
  assert.match(SIZE_MIGRATION, /ADD COLUMN IF NOT EXISTS size_band text/);
  assert.match(SIZE_MIGRATION, /char_length\(coalesce\(size_band, ''\)\) <= 40/);
  assert.doesNotMatch(SIZE_MIGRATION, /\bGRANT\b|\bREVOKE\b|POLICY|ROW LEVEL SECURITY|DROP COLUMN/i);
  assert.match(SIZE_ROLLBACK, /DROP COLUMN IF EXISTS size_band/);
  assert.doesNotMatch(SIZE_ROLLBACK, /DROP TABLE|DELETE FROM|attribution|industry/i);
});
