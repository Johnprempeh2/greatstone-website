// The release switch for search indexing (GRE-659; release plan GRE-638 rev 2 §3.9, §4).
//
// index.html ships with <meta name="robots" content="noindex"> so every preview and pre-launch build stays
// out of search results. The release build drops it by setting ALLOW_INDEXING=true at build time
// (vite.config.js runs this through transformIndexHtml). Default is noindex: forgetting the variable fails
// safe, and `npm run launch:check` then says so before go-live.
//
// Pure and store-free so node --test can run it.

const NOINDEX_META = /[ \t]*<meta\s+name=["']robots["']\s+content=["'][^"']*noindex[^"']*["']\s*\/?>[ \t]*\r?\n?/gi;

/** true only for an explicit "true" or "1"; anything else keeps noindex. */
export function indexingAllowed(raw) {
  const v = String(raw == null ? '' : raw).trim().toLowerCase();
  return v === 'true' || v === '1';
}

/** index.html for the build: unchanged unless indexing is allowed, then without the robots noindex tag. */
export function releaseIndexHtml(html, { indexable = false } = {}) {
  return indexable ? String(html).replace(NOINDEX_META, '') : String(html);
}
