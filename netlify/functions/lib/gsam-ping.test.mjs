import test from 'node:test';
import assert from 'node:assert/strict';
import { pingGsam } from './gsam-ping.mjs';

test('pings GSAM_PING_URL with an empty POST, and never throws', async () => {
  const calls = [];
  assert.equal(await pingGsam({ GSAM_PING_URL: 'https://gsam.example/api/website-ping/x' }, async (url, init) => { calls.push([url, init.method, init.body]); }), true);
  assert.deepEqual(calls, [['https://gsam.example/api/website-ping/x', 'POST', undefined]]);
  assert.equal(await pingGsam({}, async () => { throw new Error('not called'); }), false);
  assert.equal(await pingGsam({ GSAM_PING_URL: 'https://x' }, async () => { throw new Error('down'); }), false);
});
