// What the guide knows right now: the release the website is serving (the same reader as app/release-source.js,
// without the Next-only caching), the software catalogue priced the way the shop prices it, and the service list.
import { getStore } from '@netlify/blobs';
import baked from '../../../../next-proof/data/release.json' with { type: 'json' };
import frozenBlocks from '../../../../next-proof/frozen/form-blocks.json' with { type: 'json' };
import { createReleaseReader } from '../../../../next-proof/release-reader.mjs';
import { releaseIdentity } from '../../../../next-proof/release-identity.mjs';
import { catalogueFromRelease, priceCatalogue } from '../../../../next-proof/catalogue-data.mjs';
import { buildSiteKnowledge } from '../../../../next-proof/voice-guide/site-knowledge.mjs';
import { asCatalogueAnon, pricing } from '../catalogue-store.mjs';
import { getPool } from '../db.mjs';

const KEEP_MS = 5 * 60 * 1000; // as long as the site keeps a rendered page
const coded = (code, extra = {}) => Object.assign(new Error(code), { code, ...extra });

const identity = releaseIdentity(process.env, baked);
const store = () => getStore({ name: process.env.GSAM_RELEASE_BLOBS_STORE || 'gsam-content', siteID: process.env.NETLIFY_SITE_ID });
const activeRelease = createReleaseReader({
  baked,
  siteId: identity.siteId,
  orgId: identity.orgId,
  readCurrent: async () => {
    if (!identity.readsCurrent) throw coded('NOT_CONFIGURED');
    return store().get('current', { type: 'json', consistency: 'strong' });
  },
  readRelease: async (number) => {
    const value = await store().get(`releases/${number}.json`, { type: 'text' });
    if (value === null) throw coded('MISSING_RELEASE', { number });
    return value;
  },
});

let kept = null;

/** @returns {Promise<{ routes: Array<{ path: string, title: string }>, text: string, contactPath: string | null }>} */
export async function loadSite({ pool = getPool, now = Date.now(), log = console } = {}) {
  if (kept && now - kept.at < KEEP_MS) return kept.knowledge;
  const { release } = await activeRelease();
  let price = null;
  try {
    const db = pool();
    if (db) price = await asCatalogueAnon(db, pricing);
  } catch (error) {
    // No live price read, no prices: the guide then has none to quote.
    log.warn('guide: live pricing unavailable:', error?.name || 'error');
  }
  const knowledge = buildSiteKnowledge(release, { frozenBlocks, catalogue: priceCatalogue(catalogueFromRelease(release), price) });
  kept = { at: now, knowledge };
  return knowledge;
}
