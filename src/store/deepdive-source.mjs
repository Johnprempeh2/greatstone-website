// Where the Deep Dive Portal gets an engagement's content.
//
// TWO BACKENDS, in this order:
//
//   1. Netlify Function backed by Postgres RLS. The full plan is staff-only.
//
//   2. A local JSON file, DEVELOPMENT ONLY, served from .deepdive/ by the dev-only middleware in
//      vite.config.js. It is deliberately not in public/, because Vite copies public/ into dist/ and
//      a Confidential plan placed there would ship with the site. A production build has no route
//      for it at all, so the fetch 404s and the Portal shows its empty state.
//
// Which engagements exist is itself Confidential, so the registry is fetched too and never bundled.
//
// A client-side check over content that is already in the browser is not access control. `isAuthoritative` says which
// backend answered, and the Portal shows the difference rather than implying the record is live.

import { deepdiveRequest } from './deepdive-api.mjs';

const REQUIRED = ['PROCESSES', 'QUESTIONS', 'SESSIONS', 'PILLAR_ORDER', 'EVIDENCE'];
const ENG_REQUIRED = ['slug', 'client', 'title', 'stage', 'access'];
const base = () => `${import.meta.env.BASE_URL || '/'}deepdive/`;

// a 404 handled by an SPA fallback returns index.html with a 200, so JSON has to be confirmed
async function json(url) {
  let res;
  try { res = await fetch(url, { cache: 'no-store' }); } catch { return null; }
  if (!res.ok) return null;
  if (!/\bjson\b/i.test(res.headers.get('content-type') || '')) return null;
  try { return await res.json(); } catch { return null; }
}

// A plan whose sections are the wrong SHAPE is corrupt and must fail loudly. A plan whose sections
// are merely EMPTY is a record nobody has filled in yet, which is the normal starting state now that
// one exists for every client: emptiness is reported as coverage by check(), not as a read failure.
// Conflating the two made a freshly created record unopenable.
function validate(plan, origin) {
  const missing = REQUIRED.filter((k) => !Array.isArray(plan?.[k]));
  const engMissing = ENG_REQUIRED.filter((k) => !plan?.engagement?.[k]);
  if (missing.length || engMissing.length) {
    throw new Error(`Plan from ${origin} is missing: ${[...missing, ...engMissing.map((k) => 'engagement.' + k)].join(', ')}`);
  }
  return plan;
}

async function fromNetlify(slug) {
  const data = await deepdiveRequest('plan', { slug });
  return data?.plan ? { plan: validate(data.plan, 'Netlify'), version: data.version } : null;
}

async function fromLocal(slug) {
  const url = `${base()}${encodeURIComponent(slug)}.json`;
  let res;
  try { res = await fetch(url, { cache: 'no-store' }); } catch { return null; }
  if (!res.ok) return null;
  if (!/\bjson\b/i.test(res.headers.get('content-type') || '')) return null;
  let data; try { data = await res.json(); } catch { return null; }
  // The version travels with the plan so an authored change can say what it was based on.
  return { plan: validate(data, '.deepdive'), version: res.headers.get('etag') || null };
}

export async function loadPlan(slug) {
  const live = await fromNetlify(slug);
  if (live) return { ...live, source: 'netlify', isAuthoritative: true };
  const local = await fromLocal(slug);
  if (local) return { plan: local.plan, version: local.version, source: 'local', isAuthoritative: false };
  return { plan: null, source: null, isAuthoritative: false };
}

/** The client's own name for a slug that has no record yet. Under the Standard's "understand once"
 *  principle a record exists for every client from first contact, so landing on one that is still
 *  empty is a normal state, not a broken link — and an empty state that can say whose record it is
 *  reads as "nothing gathered yet" rather than "something is wrong". */
export async function clientNameFor(slug) {
  const idx = await json(`${base()}index.json`);
  const hit = (idx?.engagements || []).find((e) => e.slug === slug);
  if (hit?.client) return hit.client;
  return deepdiveRequest('client-name', { slug });
}

// Which engagements this viewer can open. Server-side through RLS; in development the
// generated index. Returns [] rather than throwing, so the Portal shows an empty state, not an error.
export async function listEngagements() {
  const data = await deepdiveRequest('engagements');
  if (Array.isArray(data)) return data;
  // The dev endpoint derives this from the files on disk. index.json is only a CACHE, and it was
  // rebuilt by the MCP after its writes but never after a write from this browser, so a record
  // created here wrote its file and then did not appear in the register. Ask for the derived list
  // first and keep the cache only as a fallback for anything serving the folder statically.
  const live = await json(`${base()}engagements`);
  if (Array.isArray(live?.engagements)) return live.engagements;
  const idx = await json(`${base()}index.json`);
  return Array.isArray(idx?.engagements) ? idx.engagements : [];
}
