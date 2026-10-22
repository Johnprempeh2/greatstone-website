import 'server-only';
import { getStore } from '@netlify/blobs';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import baked from '../next-proof/data/release.json';
import { createReleaseReader } from '../next-proof/release-reader.mjs';

const storeName = process.env.GSAM_RELEASE_BLOBS_STORE || 'website-releases';
export const releaseStore = () => getStore(storeName);
const readRelease = unstable_cache(async (number) => {
  const value = await releaseStore().get(`releases/${number}.json`, { type: 'text' });
  if (value === null) {
    const error = new Error('MissingRelease');
    error.code = 'MISSING_RELEASE';
    error.number = number;
    throw error;
  }
  return value;
}, ['website-release', storeName, process.env.GSAM_SITE_ID || 'local'], { tags: ['website-release'] });

const reader = createReleaseReader({
  baked,
  siteId: process.env.GSAM_SITE_ID || baked.siteId,
  orgId: process.env.GSAM_ORG_ID || baked.orgId,
  readCurrent: async () => {
    if (!process.env.GSAM_SITE_ID || !process.env.GSAM_ORG_ID) {
      const error = new Error('ReleaseIdentityNotConfigured');
      error.code = 'NOT_CONFIGURED';
      throw error;
    }
    return releaseStore().get('current', { type: 'json', consistency: 'strong' });
  },
  readRelease,
});

export const activeRelease = cache(reader);
