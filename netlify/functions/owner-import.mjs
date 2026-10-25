import { getStore } from '@netlify/blobs';
import { getDatabase } from '@netlify/database';
import { runOwnerImport, STORE } from './lib/owner-import.mjs';

// The one-time owner importer (GRE-2578). Scheduled functions have no URL, so nothing can call this; it does nothing
// unless OWNER_IMPORT_UNTIL, OWNER_IMPORT_SITE and a Blobs payload are all present (lib/owner-import.mjs).
// The owner pool is opened here for one run and ended after it; no other code path uses it.
// Remove this function in a follow-up PR after the production move (GRE-2567).
export default async (_req, context) => {
  await runOwnerImport({
    env: process.env,
    context,
    store: getStore({ name: STORE, consistency: 'strong' }),
    openPool: () => getDatabase().pool,
  });
};

// Netlify picks the exact minute; every five minutes keeps two ticks (dry run, then apply) inside a 60-minute window.
export const config = { schedule: '*/5 * * * *' };
