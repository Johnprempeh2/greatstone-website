// The release switch for search indexing (GRE-659; release plan GRE-638 rev 2 §3.9, §4).
//
// index.html ships with <meta name="robots" content="noindex"> so every preview and pre-launch build stays
// out of search results. The release build drops it by setting ALLOW_INDEXING=true at build time
// (vite.config.js runs this through transformIndexHtml). Default is noindex: forgetting the variable fails
// safe, and `npm run launch:check` then says so before go-live.
//
// It also stamps the canonical origin into the static canonical and link-preview tags: index.html writes
// %GS_SITE_ORIGIN% so no site host is hard-coded (docs/DOMAIN-CUTOVER.md, "Rule going forward").
//
// Pure and store-free so node --test can run it.

import { normaliseOrigin } from './seo-files.mjs';

export const DEFAULT_ORIGIN = 'https://greatstoneint.com'; // same default as scripts/gen-seo-files.mjs
const ORIGIN_TOKEN = /%GS_SITE_ORIGIN%/g;

const NOINDEX_META = /[ \t]*<meta\s+name=["']robots["']\s+content=["'][^"']*noindex[^"']*["']\s*\/?>[ \t]*\r?\n?/gi;

/** true only for an explicit "true" or "1"; anything else keeps noindex. */
export function indexingAllowed(raw) {
  const v = String(raw == null ? '' : raw).trim().toLowerCase();
  return v === 'true' || v === '1';
}

/** index.html for the build: origin stamped; the robots noindex tag removed only when indexing is allowed. */
export function releaseIndexHtml(html, { indexable = false, origin = '' } = {}) {
  const out = String(html).replace(ORIGIN_TOKEN, normaliseOrigin(origin, DEFAULT_ORIGIN));
  return indexable ? out.replace(NOINDEX_META, '') : out;
}
