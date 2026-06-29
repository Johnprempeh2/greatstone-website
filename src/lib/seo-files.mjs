// SEO file builders: the sitemap.xml and robots.txt contents, as pure functions so the build-time
// generator (scripts/gen-seo-files.mjs) and the node --test suite share ONE implementation.
//
// HONEST SCOPE. This app is a client-side SPA with hash/state-based routing: every page resolves to the
// same root URL (the marketing pages swap React state and CLEAR the hash; #shop, #service/<slug>, #admin
// etc. are fragments, not crawlable paths). So the only correct sitemap is a SINGLE <url>: the canonical
// origin. A multi-URL sitemap listing /services, /products would be wrong (each would 200 to the same
// homepage = duplicate/soft-404 noise that HURTS SEO). Real per-page SEO needs path routing + SSR/prerender,
// a separate and larger piece. This file lands the plumbing correct and ready.
//
// STORE-FREE: imports nothing from src/store.js, no React, no location/import.meta. Loads under bare node.

// Trim, strip trailing slashes, fall back when blank. Mirrors lib/site-origin.mjs resolveOrigin, standalone.
export function normaliseOrigin(raw, fallback = '') {
  const e = (raw || '').trim().replace(/\/+$/, '');
  return e || (fallback || '').trim().replace(/\/+$/, '');
}

// XML-escape a text node / attribute value (the five predefined entities).
function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// A valid urlset with EXACTLY ONE <url> = the canonical origin root. lastmod is an optional ISO date.
export function buildSitemapXml(origin, { lastmod } = {}) {
  const loc = xmlEscape(normaliseOrigin(origin));
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    '    <loc>' + loc + '</loc>',
  ];
  if (lastmod) lines.push('    <lastmod>' + xmlEscape(lastmod) + '</lastmod>');
  lines.push('    <changefreq>weekly</changefreq>');
  lines.push('  </url>');
  lines.push('</urlset>');
  return lines.join('\n') + '\n';
}

// Surfaces a crawler should never index. They are hash routes today (never reached as paths), so listing
// them is harmless belt-and-braces that also documents intent and future-proofs a later path-based rewrite.
const DISALLOW = ['/admin', '/account', '/org', '/invoice', '/catalogue'];

// robots.txt: allow the site, keep private/admin surfaces out, point at the sitemap.
export function buildRobotsTxt(origin) {
  const base = normaliseOrigin(origin);
  const lines = ['User-agent: *', 'Allow: /'];
  for (const p of DISALLOW) lines.push('Disallow: ' + p);
  lines.push('');
  lines.push('Sitemap: ' + base + '/sitemap.xml');
  return lines.join('\n') + '\n';
}
