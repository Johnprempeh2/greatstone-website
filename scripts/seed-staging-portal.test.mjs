import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedStagingPortal } from './seed-staging-portal.mjs';

test('staging fixture refuses another site before connecting to its database', async () => {
  let connected = false;
  await assert.rejects(seedStagingPortal({
    siteId: 'another-site',
    pool: { connect() { connected = true; } },
  }), /restricted to the dedicated staging site/);
  assert.equal(connected, false);
});
