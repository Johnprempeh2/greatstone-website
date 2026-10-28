// Receipt record, email and worker (GRE-1256). Made-up data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ATTEMPTS, nextAttemptAt, idempotencyKey, receiptRecord, emailStateLabel, sanitizeForEmail,
  buildReceiptEmail, documentCopyHtml, cleanError, resendSend, runWorker, fmtUtc,
} from './portal-receipt.mjs';

const SHA = 'ab'.repeat(32);
const ACC = {
  id: '0a0a0a0a-0000-4000-8000-000000000001', document_id: 'd0d0d0d0-0000-4000-8000-000000000001', document_version: 2,
  content_sha256: SHA, action: 'accept', signer_name: 'Test Person', signer_title: 'Test Title',
  account_company_name: 'Test Client A', signer_email: 'person.one@client-a.example.test',
  confirmation_text: 'I confirm this is a made-up test sentence.', accepted_at: '2026-10-10T19:30:05Z',
};
const DOC = {
  id: ACC.document_id, title: 'Test pack A', version: 2, summary: 'A made-up pack.',
  body: { sections: [{ id: 's1', title: 'Scope', html: '<p>Made-up <strong>scope</strong>.</p><script>alert(1)</script>' }] },
  demos: [{ label: 'Demo one', url: 'https://demo.example.test/one', note: 'made up' }],
};

test('retry schedule: 1, 5, 15, 60 minutes, then 6 hours; none after the last attempt', () => {
  const t0 = new Date('2026-10-10T00:00:00Z');
  const mins = [1, 2, 3, 4, 5, 6, 7].map((n) => (nextAttemptAt(n, t0) - t0) / 60000);
  assert.deepEqual(mins, [1, 5, 15, 60, 360, 360, 360]);
  assert.equal(nextAttemptAt(MAX_ATTEMPTS, t0), null);
  assert.equal(MAX_ATTEMPTS, 8);
});

test('the receipt separates what the account verified from what the signer entered', () => {
  const r = receiptRecord(ACC, DOC);
  assert.equal(r.action, 'Accepted');
  assert.deepEqual(r.verified, [['Company', 'Test Client A'], ['Signed-in email', 'person.one@client-a.example.test']]);
  assert.deepEqual(r.entered, [['Name', 'Test Person'], ['Job title', 'Test Title']]);
  assert.deepEqual(r.record.map(([k]) => k), ['Document', 'Version', 'Fingerprint (SHA-256)', 'Accepted on', 'Reference']);
  assert.equal(r.record[3][1], '10 Oct 2026, 19:30 UTC');
  assert.equal(r.confirmation, ACC.confirmation_text);
  assert.equal(receiptRecord({ ...ACC, action: 'agree_in_principle' }).record[3][0], 'Agreed in principle on');
  assert.equal(fmtUtc('not a date'), '');
});

test('email state on the receipt: queued, retrying, sent, failed', () => {
  assert.equal(emailStateLabel({ status: 'queued', attempts: 0 }), 'Email copy: on its way');
  assert.equal(emailStateLabel({ status: 'queued', attempts: 2 }), 'Email copy: retrying');
  assert.equal(emailStateLabel({ status: 'sent', attempts: 1 }), 'Email copy: sent');
  assert.match(emailStateLabel({ status: 'failed', attempts: 8 }), /keep trying/);
  assert.equal(emailStateLabel(null), 'Email copy: on its way');
});

test('email HTML keeps only allowlisted tags, no attributes but a safe href, and drops script content', () => {
  const dirty = '<h1 onclick="x()">Head</h1><p style="x">a &amp; b < c</p><img src=x onerror=alert(1)>'
    + '<a href="javascript:alert(1)">bad</a><a href="https://ok.example.test/?a=1&b=2">ok</a>'
    + '<script>evil()</script><style>p{}</style><svg><script>x</script></svg><!-- note --><iframe src="https://x"></iframe>'
    + '<a href=\'mailto:a@example.test\'>m</a><p title="a>b">q</p>';
  const clean = sanitizeForEmail(dirty);
  assert.equal(clean, '<h5>Head</h5><p>a &amp; b &lt; c</p><a>bad</a>'
    + '<a href="https://ok.example.test/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">ok</a>'
    + '<a href="mailto:a@example.test" target="_blank" rel="noopener noreferrer">m</a><p>q</p>');
  assert.doesNotMatch(clean, /script|onerror|onclick|style|svg|iframe|javascript/i);
  assert.equal(sanitizeForEmail('<scr<script>ipt>alert(1)</script>'), 'ipt&gt;alert(1)');
});

test('the receipt email is built from the record, with a self-contained copy attached', () => {
  const m = buildReceiptEmail({ acceptance: ACC, document: DOC, siteOrigin: 'https://site.example.test/' });
  assert.equal(m.subject, 'Accepted: Test pack A (version 2)');
  for (const s of ['Verified from the account', 'Entered by the signer', 'Test Client A', 'Test Person', SHA, ACC.confirmation_text]) {
    assert.ok(m.html.includes(s), s);
    assert.ok(m.text.includes(s), s);
  }
  assert.ok(m.html.includes('https://site.example.test/#portal/receipt/' + ACC.id));
  assert.equal(m.attachment.filename, 'test-pack-a-v2.html');
  const copy = Buffer.from(m.attachment.content, 'base64').toString('utf8');
  assert.equal(copy, documentCopyHtml(DOC, ACC));
  assert.match(copy, /<h2>Scope<\/h2><p>Made-up <strong>scope<\/strong>\.<\/p>/);
  assert.doesNotMatch(copy, /<script|<link|src=/);
  assert.match(copy, /href="https:\/\/demo\.example\.test\/one"/);
});

test('a released Deep Dive receipt delivers the accepted version and fingerprint', () => {
  const document = { ...DOC, kind: 'deep_dive', title: 'Synthetic Deep Dive report' };
  const mail = buildReceiptEmail({ acceptance: ACC, document, siteOrigin: 'https://site.example.test/' });
  assert.equal(mail.subject, 'Accepted: Synthetic Deep Dive report (version 2)');
  assert.match(mail.text, new RegExp(SHA));
  assert.match(Buffer.from(mail.attachment.content, 'base64').toString('utf8'), /Made-up <strong>scope<\/strong>/);
});

test('provider errors are kept short and without email addresses', () => {
  assert.equal(cleanError('resend 422: Invalid `to` field: person.one@client-a.example.test'), 'resend 422: Invalid `to` field: <address>');
  assert.equal(cleanError('x'.repeat(900)).length, 500);
});

test('resendSend sends the idempotency key and never throws', async () => {
  let seen;
  const ok = await resendSend({ apiKey: 'k', from: 'f@example.test', to: ['t@example.test'], subject: 's', html: 'h', text: 't', idempotency: idempotencyKey('abc'),
    fetchImpl: async (url, init) => { seen = init; return { ok: true, json: async () => ({ id: 'msg-1' }) }; } });
  assert.deepEqual(ok, { ok: true, id: 'msg-1' });
  assert.equal(seen.headers['Idempotency-Key'], 'portal-receipt-abc');
  const down = await resendSend({ apiKey: 'k', from: 'f', to: ['t'], fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(down.ok, false);
  const bad = await resendSend({ apiKey: 'k', from: 'f', to: ['t'], fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({ message: 'boom' }) }) });
  assert.deepEqual(bad, { ok: false, error: 'resend 500: boom' });
  assert.deepEqual(await resendSend({ apiKey: '', from: 'f', to: ['t'] }), { ok: false, error: 'email not configured' });
});

// A fake queue with the database's rules: claim moves due 'queued' jobs to 'sending' (attempts + 1) one caller at
// a time; 'sent' is final.
function fakeDb(jobs) {
  const log = [];
  let lock = Promise.resolve();
  return {
    log,
    jobs,
    claim(limit) {
      const run = lock.then(async () => {
        await new Promise((r) => setTimeout(r, 5)); // let concurrent runs overlap
        const due = jobs.filter((j) => j.status === 'queued' && j.next_attempt_at <= Date.now()).slice(0, limit);
        for (const j of due) { j.status = 'sending'; j.attempts++; }
        return due.map((j) => ({ ...j }));
      });
      lock = run.catch(() => {});
      return run;
    },
    async load(id) { return { acceptance: { ...ACC, id }, document: DOC }; },
    async sent(job, pid) { const j = jobs.find((x) => x.id === job.id); assert.equal(j.status, 'sending'); j.status = 'sent'; j.pid = pid; log.push(['sent', job.id]); },
    async retry(job, next, err) { const j = jobs.find((x) => x.id === job.id); j.status = 'queued'; j.next_attempt_at = next.getTime(); j.err = err; log.push(['retry', job.id, j.attempts]); },
    async failed(job, err) { const j = jobs.find((x) => x.id === job.id); j.status = 'failed'; j.err = err; log.push(['failed', job.id]); },
  };
}
const job = (n, extra = {}) => ({ id: 'job-' + n, acceptance_id: 'acc-' + n, status: 'queued', attempts: 0, next_attempt_at: 0, ...extra });

test('the worker sends a Deep Dive acceptance receipt with the immutable copy', async () => {
  const db = fakeDb([job(4)]);
  db.load = async () => ({ acceptance: ACC, document: { ...DOC, kind: 'deep_dive', title: 'Synthetic Deep Dive report' } });
  const sends = [];
  const result = await runWorker({ db, ownerTo: ['owner@example.test'], siteOrigin: 'https://site.example.test',
    send: async (message) => { sends.push(message); return { ok: true, id: 'synthetic-message' }; } });
  assert.deepEqual([result.claimed, result.sent], [1, 1]);
  assert.deepEqual(sends[0].to, [ACC.signer_email, 'owner@example.test']);
  assert.match(sends[0].text, /Synthetic Deep Dive report/);
  assert.match(Buffer.from(sends[0].attachments[0].content, 'base64').toString('utf8'), new RegExp(SHA));
  assert.equal(db.jobs[0].status, 'sent');
});

test('two workers at once: each job is claimed and sent once, with its idempotency key', async () => {
  const db = fakeDb([job(1), job(2), job(3)]);
  const sends = [];
  const send = async (m) => { sends.push(m); return { ok: true, id: 'msg-' + sends.length }; };
  const cfg = { db, send, ownerTo: ['owner@example.test'], siteOrigin: 'https://site.example.test' };
  const [a, b] = await Promise.all([runWorker(cfg), runWorker(cfg)]);
  assert.equal(a.claimed + b.claimed, 3);
  assert.equal(sends.length, 3);
  assert.deepEqual(sends.map((m) => m.idempotency).sort(), ['portal-receipt-acc-1', 'portal-receipt-acc-2', 'portal-receipt-acc-3']);
  assert.deepEqual(sends[0].to, ['person.one@client-a.example.test', 'owner@example.test']);
  assert.equal(sends[0].attachments.length, 1);
  assert.ok(db.jobs.every((j) => j.status === 'sent'));
  // a later run finds nothing: a sent job is never sent again
  assert.equal((await runWorker(cfg)).claimed, 0);
  assert.equal(sends.length, 3);
});

test('a provider error queues a retry with backoff; the last attempt marks failed and alerts the owner', async () => {
  const db = fakeDb([job(1)]);
  const sends = [];
  const send = async (m) => { sends.push(m); return m.idempotency.endsWith('-failed') ? { ok: true } : { ok: false, error: 'resend 500' }; };
  let clock = Date.parse('2026-10-10T00:00:00Z');
  const cfg = { db, send, ownerTo: ['owner@example.test'], studioUrl: 'https://site.example.test/#catalogue/clients', now: () => new Date(clock) };
  const r1 = await runWorker(cfg);
  assert.deepEqual([r1.claimed, r1.retry], [1, 1]);
  assert.equal(db.jobs[0].next_attempt_at - clock, 60000);
  for (let i = 2; i <= MAX_ATTEMPTS; i++) { db.jobs[0].next_attempt_at = 0; await runWorker(cfg); }
  assert.equal(db.jobs[0].status, 'failed');
  assert.equal(db.jobs[0].attempts, MAX_ATTEMPTS);
  assert.deepEqual(db.log.map((l) => l[0]), [...Array(MAX_ATTEMPTS - 1).fill('retry'), 'failed']);
  const alert = sends.at(-1);
  assert.deepEqual(alert.to, ['owner@example.test']);
  assert.match(alert.text, /acc-1/);
  assert.doesNotMatch(alert.text, /@/);
  assert.equal(sends.length, MAX_ATTEMPTS + 1);
});

test('a job whose record cannot be read is retried, not lost', async () => {
  const db = fakeDb([job(1)]);
  db.load = async () => { throw new Error('read failed'); };
  let sent = 0;
  const r = await runWorker({ db, send: async () => { sent++; return { ok: true }; } });
  assert.equal(r.retry, 1);
  assert.equal(sent, 0);
  assert.equal(db.jobs[0].status, 'queued');
});
