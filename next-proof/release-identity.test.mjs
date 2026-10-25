import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseIdentity } from './release-identity.mjs';

const baked = { siteId: 'proof-site', orgId: 'proof-org' };

test('isolated editor ignores inherited production release identity', () => {
  const identity = releaseIdentity({
    GSAM_EDITOR_HOST: 'gsam-editor--greatstone-home.netlify.app',
    GSAM_SITE_ID: 'production-site',
    GSAM_ORG_ID: 'production-org',
  }, baked);
  assert.deepEqual(identity, { siteId: 'proof-site', orgId: 'proof-org', readsCurrent: false });
});

test('public engine retains its configured release identity', () => {
  const identity = releaseIdentity({ GSAM_SITE_ID: 'production-site', GSAM_ORG_ID: 'production-org' }, baked);
  assert.deepEqual(identity, { siteId: 'production-site', orgId: 'production-org', readsCurrent: true });
});
