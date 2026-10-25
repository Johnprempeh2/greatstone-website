import 'server-only';
import { getStore } from '@netlify/blobs';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import baked from '../next-proof/data/release.json';
import { createReleaseReader } from '../next-proof/release-reader.mjs';
import { releaseIdentity } from '../next-proof/release-identity.mjs';

const storeName = process.env.GSAM_RELEASE_BLOBS_STORE || 'gsam-content';
const identity = releaseIdentity(process.env, baked);
export const releaseStore = () => getStore({ name: storeName, siteID: process.env.NETLIFY_SITE_ID });
const readRelease = unstable_cache(async (number) => {
  const value = await releaseStore().get(`releases/${number}.json`, { type: 'text' });
  if (value === null) {
    const error = new Error('MissingRelease');
    error.code = 'MISSING_RELEASE';
    error.number = number;
    throw error;
  }
  return value;
}, ['website-release', storeName, identity.siteId], { tags: ['website-release'] });

const reader = createReleaseReader({
  baked,
  siteId: identity.siteId,
  orgId: identity.orgId,
  readCurrent: async () => {
    if (!identity.readsCurrent) {
      const error = new Error('ReleaseIdentityNotConfigured');
      error.code = 'NOT_CONFIGURED';
      throw error;
    }
    return releaseStore().get('current', { type: 'json', consistency: 'strong' });
  },
  readRelease,
});

export const activeRelease = cache(reader);
