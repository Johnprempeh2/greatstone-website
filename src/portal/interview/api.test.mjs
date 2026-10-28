import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSseFrames, readSse, readEnvelope, redirectOf, portalOp, PORTAL_URL } from './api.mjs';

const frame = (o) => `data: ${JSON.stringify(o)}\n\n`;

test('parseSseFrames splits complete frames and keeps the partial tail', () => {
  const buf = frame({ type: 'meta', phase: 'warmup' }) + frame({ type: 'delta', text: 'Hel' }) + 'data: {"type":"del';
  const { events, rest } = parseSseFrames(buf);
  assert.deepEqual(events, [{ type: 'meta', phase: 'warmup' }, { type: 'delta', text: 'Hel' }]);
  assert.equal(rest, 'data: {"type":"del');
  const next = parseSseFrames(rest + 'ta","text":"lo"}\n\n');
  assert.deepEqual(next.events, [{ type: 'delta', text: 'lo' }]);
  assert.equal(next.rest, '');
});

test('parseSseFrames skips malformed frames and frames without a data line', () => {
  const buf = 'data: {nope\n\n' + ': keep-alive\n\n' + 'event: x\n' + frame({ type: 'done', complete: true });
  const { events } = parseSseFrames(buf);
  assert.deepEqual(events, [{ type: 'done', complete: true }]);
});

test('parseSseFrames reads the data line out of a multi-line frame', () => {
  const { events } = parseSseFrames('event: message\nid: 7\ndata: {"type":"reset"}\n\n');
  assert.deepEqual(events, [{ type: 'reset' }]);
});

test('readSse handles a frame split across byte chunks, including a multi-byte character', async () => {
  const bytes = new TextEncoder().encode(frame({ type: 'delta', text: 'café — ok' }) + frame({ type: 'done', agentTurnId: 't1' }));
  const chunks = [bytes.slice(0, 5), bytes.slice(5, 31), bytes.slice(31)];
  let i = 0;
  const reader = { read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }) };
  const got = [];
  await readSse(reader, (e) => got.push(e));
  assert.deepEqual(got, [{ type: 'delta', text: 'café — ok' }, { type: 'done', agentTurnId: 't1' }]);
});

const res = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => (body === undefined ? Promise.reject(new Error('no body')) : body) });

test('readEnvelope maps replies to { data } or { error }', async () => {
  assert.deepEqual(await readEnvelope(res(200, { data: { ok: true } })), { data: { ok: true } });
  assert.deepEqual(await readEnvelope(res(200, { data: null })), { data: null });
  assert.deepEqual(await readEnvelope(res(200, { error: 'nope' })), { error: 'nope', status: 200 });
  assert.deepEqual(await readEnvelope(res(500, { error: 'boom' })), { error: 'boom', status: 500 });
  assert.deepEqual(await readEnvelope(res(502)), { error: 'Request failed (502)', status: 502 });
  const signedOut = await readEnvelope(res(401, { error: 'sign in' }));
  assert.equal(signedOut.signedOut, true);
  assert.equal(signedOut.status, 401);
});

test('redirectOf follows only interview and portal hashes', () => {
  assert.equal(redirectOf({ redirect: '#portal/interview/goodbye' }), '#portal/interview/goodbye');
  assert.equal(redirectOf({ redirect: 'https://example.com' }), null);
  assert.equal(redirectOf({ ok: true }), null);
  assert.equal(redirectOf(null), null);
});

test('portalOp posts { op, args } as JSON with the session cookie', async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return res(200, { data: { redirect: '#portal/interview/session' } });
  };
  try {
    const out = await portalOp('start', { dataConsent: 'on', runMode: 'save' });
    assert.deepEqual(out, { data: { redirect: '#portal/interview/session' } });
    assert.equal(calls[0].url, PORTAL_URL);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.credentials, 'include');
    assert.deepEqual(JSON.parse(calls[0].init.body), { op: 'start', args: { dataConsent: 'on', runMode: 'save' } });
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.equal((await portalOp('pause', { sessionId: 's' })).status, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('readEnvelope keeps a refusal that carries its own result (enrol 400 { data: { ok: false } })', async () => {
  const out = await readEnvelope(res(400, { data: { ok: false, message: 'Please use your work email.' } }));
  assert.deepEqual(out, { data: { ok: false, message: 'Please use your work email.' }, status: 400 });
});
