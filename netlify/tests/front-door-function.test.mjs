import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFrontDoorHandler } from '../functions/front-door.mjs';
import { saveLead, updateContact, stamp } from '../functions/lib/front-door-store.mjs';
import { signSession } from '../../supabase/functions/_shared/front-door-engine.mjs';

function fakePool(reply = () => ({ rows: [] })) {
  const calls = [];
  const client = { query: async (sql, args) => { calls.push({ sql, args }); return reply(sql, args); }, release() { calls.push({ sql: 'RELEASE' }); } };
  return { pool: { connect: async () => client }, calls };
}

const leadId = '123e4567-e89b-42d3-a456-426614174000';
test('S5 binds its generated lead, inserts only granted columns, and commits', async () => {
  const { pool, calls } = fakePool((sql) => sql.startsWith('INSERT') ? { rows: [{ id: leadId }] } : { rows: [] });
  const row = { industry: 'Health', industry_other: false, team_size: '1-10', brand_words: ['clear'],
    company_name: 'Example', agents: [], chat_summary: [], chat_turns: 0, source: {}, agent_package: {} };
  assert.equal(await saveLead(pool, leadId, row), leadId);
  assert.deepEqual(calls.map((c) => c.sql.split(' ')[0]), ['BEGIN', 'SET', 'SELECT', 'SELECT', 'SELECT', 'SELECT', 'INSERT', 'COMMIT', 'RELEASE']);
  assert.equal(calls[5].sql, 'SELECT front_door_purge()');
  assert.match(calls[4].args[0], /"front_door_lead":"123e4567/);
  assert.doesNotMatch(calls[6].sql, /org_id|contact_email/);
});

test('S6 and once-only claims bind the lead in separate transactions', async () => {
  const { pool, calls } = fakePool((sql) => sql.startsWith('UPDATE') ? { rows: [{ id: leadId }] } : { rows: [] });
  await updateContact(pool, leadId, { contact_name: 'A', contact_email: 'a@example.test', contact_role: 'Owner',
    contact_at: '2026-10-23', consent_given: false, consent_at: null, consent_version: 'front-door-consent-v1' });
  assert.equal(await stamp(pool, leadId, 'pack_sent_at', '2026-10-23', true), true);
  assert.match(calls.filter((c) => c.sql.startsWith('UPDATE'))[1].sql, /pack_sent_at IS NULL RETURNING id/);
  assert.equal(calls.filter((c) => c.sql.includes("set_config('request.jwt.claims'" )).length, 4);
  assert.equal(calls.filter((c) => c.sql === 'COMMIT').length, 2);
  await assert.rejects(stamp(pool, leadId, 'status', null), /Invalid stamp/);
});

test('handler keeps invalid and unconfigured requests off the database', async () => {
  const { pool, calls } = fakePool();
  const handler = makeFrontDoorHandler({ pool: () => pool, env: {}, log: () => {} });
  const response = await handler(new Request('https://example.test/api/front-door', { method: 'POST', body: '{}' }));
  assert.equal(response.status, 503);
  assert.equal(calls.length, 0);
});

test('S6 sends the fallback alert when the database has no lead', async () => {
  const secret = 's'.repeat(32);
  const calls = [];
  const handler = makeFrontDoorHandler({
    pool: () => null,
    env: { ANTHROPIC_API_KEY: 'test-key', TURNSTILE_SECRET_KEY: 'test-secret', FRONT_DOOR_SECRET: secret,
      RESEND_API_KEY: 'test-resend', RESEND_FROM: 'test@example.test', FRONT_DOOR_ALERT_TO: 'staff@example.test' },
    fetchImpl: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true }; },
    log: () => {},
  });
  const session = await signSession({ iat: Date.now(), th: null, proposed: true, lid: null }, secret);
  const response = await handler(new Request('https://example.test/api/front-door', { method: 'POST',
    body: JSON.stringify({ step: 'lead', session, leadId: null, contact: { name: 'Test', email: 'test@example.test', role: 'Owner' },
      consent: { given: false, version: 'front-door-consent-v1' } }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, pack: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.match(calls[0].body.subject, /NOT SAVED/);
});
