import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normaliseEnquiry, normaliseAttribution, enquiryRow, buildEnquiryAlert, handleEnquiry, PER_IP_PER_DAY,
} from './enquiry.mjs';

const MIGRATION = readFileSync(new URL('../../migrations/0035_service_inquiry_attribution.sql', import.meta.url), 'utf8');

const BODY = {
  name: '  Jane   Stonewell ', company: 'Stonewell & Co.', email: 'jane@stonewell.co', industry: 'Retail & E-commerce',
  message: 'Line one\r\n\r\n\r\n\r\nLine two', page: '/contact',
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
    ip: '203.0.113.9', studioUrl: 'https://example.test/#catalogue/inquiries',
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
  assert.match(d.calls.alerts[0].subject, /^New enquiry: Stonewell & Co\.$/);
  assert.match(d.calls.alerts[0].text, /https:\/\/example\.test\/#catalogue\/inquiries/);
  assert.doesNotMatch(d.calls.alerts[0].text, /Line two/, 'saved: the message stays in the studio');
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
