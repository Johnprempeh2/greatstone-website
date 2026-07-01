// Old greatstonesoftware.co.uk (an iCandy reseller storefront) → the new Puck SPA, for a clean cutover that
// keeps inbound links + SEO. The new site is a HASH-ROUTING SPA, so a redirect destination must be a route the
// SPA honours on first load: '/', '/#shop', '/#shop/<vendor>', '/#product/<slug>' or '/#account'. Content pages
// (about / method / insights / the legal drafts) are not yet hash-addressable, so old info + blog URLs 301 to
// home for now; refine them to precise targets once content deep-linking and the migrated product-slug map land.
//
// Pure + unit-tested: no I/O. scripts/gen-legacy-redirects.mjs feeds it the crawled URL list and writes the
// generated block into public/_redirects.

// Old vendor path segment → new storefront vendor slug (must match SEED_CATEGORIES in store.js). Every old
// vendor page (/aspose) and every product under it (/aspose/aspose-pdf-for--net) lands on that vendor's
// catalogue. Only 'ironsoftware' differs from its new slug ('iron-software'); the rest are identity.
export const VENDOR_PATH_MAP = {
  aspose: 'aspose',
  groupdocs: 'groupdocs',
  devexpress: 'devexpress',
  apryse: 'apryse',
  conholdate: 'conholdate',
  iris: 'iris',
  ironsoftware: 'iron-software',
  activepdf: 'activepdf',
  investintech: 'investintech',
  pdflib: 'pdflib',
};

// Exact old path → an SPA route that resolves on first load (storefront + account/session URLs).
export const STRUCTURAL_MAP = {
  '/all-products': '/#shop',
  '/search': '/#shop',
  '/basket': '/#shop',
  '/checkout': '/#shop',
  '/checkout-login': '/#account',
  '/order-confirmation': '/#account',
  '/order-confirmation/basket': '/#account',
  '/login': '/#account',
  '/callback': '/#account',
  '/password/reset': '/#account',
};

// Normalise a path: ensure a single leading slash, drop the trailing slash (except root), lowercase the
// path (the old site's URLs are case-insensitive in practice; e.g. devexpress-winForms), strip any query/hash.
export function normalisePath(path) {
  let p = String(path == null ? '' : path).trim();
  if (!p) return '/';
  p = p.split('#')[0].split('?')[0];
  if (p[0] !== '/') p = '/' + p;
  p = p.toLowerCase();
  if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/, '');
  return p || '/';
}

// Classify one old path → { dest, kind }. kind ∈ home | storefront | account | vendor | product | blog | content.
export function classifyLegacyPath(path) {
  const p = normalisePath(path);
  if (p === '/') return { dest: '/', kind: 'home' };
  if (STRUCTURAL_MAP[p]) {
    const dest = STRUCTURAL_MAP[p];
    return { dest, kind: dest === '/#account' ? 'account' : 'storefront' };
  }
  const segs = p.slice(1).split('/');
  const vendorSlug = VENDOR_PATH_MAP[segs[0]];
  if (vendorSlug) return { dest: '/#shop/' + vendorSlug, kind: segs.length > 1 ? 'product' : 'vendor' };
  if (segs[0] === 'blog' || segs[0] === 'news') return { dest: '/', kind: 'blog' };
  return { dest: '/', kind: 'content' }; // about, faqs, legal, assessment-framework, document-*, etc.
}

// True when a path is already covered by a PATTERN rule (vendor exact/wildcard, a structural exact, or the
// blog/news wildcards), so the generator does not also emit a redundant per-path rule for it.
export function isCoveredByPattern(path) {
  const p = normalisePath(path);
  if (STRUCTURAL_MAP[p]) return true;
  const seg0 = p.slice(1).split('/')[0];
  return !!VENDOR_PATH_MAP[seg0] || seg0 === 'blog' || seg0 === 'news';
}

// The always-present PATTERN rules (independent of any crawl): vendor exact + wildcard, structural exacts,
// and the blog/news wildcards. Forced (301!) so they win over Netlify's trailing-slash/asset handling and
// the SPA catch-all. Returned as ordered rule objects { from, to, code, force }.
export function patternRules() {
  const rules = [];
  for (const [seg, slug] of Object.entries(VENDOR_PATH_MAP)) {
    rules.push({ from: '/' + seg, to: '/#shop/' + slug, code: 301, force: true });
    rules.push({ from: '/' + seg + '/*', to: '/#shop/' + slug, code: 301, force: true });
  }
  for (const [from, to] of Object.entries(STRUCTURAL_MAP)) rules.push({ from, to, code: 301, force: true });
  rules.push({ from: '/blog', to: '/', code: 301, force: true });
  rules.push({ from: '/blog/*', to: '/', code: 301, force: true });
  rules.push({ from: '/news/*', to: '/', code: 301, force: true });
  return rules;
}

// The complete ordered rule set for a crawl: the pattern rules, then an explicit 301→home for every known
// content path the patterns don't already cover (so those old URLs get a real 301 instead of soft-404ing on
// the SPA fallback). De-duped; root and already-covered paths are skipped.
export function redirectRulesFor(paths) {
  const rules = patternRules();
  const seen = new Set(rules.map((r) => r.from));
  for (const raw of paths || []) {
    const p = normalisePath(raw);
    if (p === '/' || isCoveredByPattern(p) || seen.has(p)) continue;
    rules.push({ from: p, to: '/', code: 301, force: true });
    seen.add(p);
  }
  return rules;
}

// Exact product redirects from a migrated slug map { "<old product path>": "<new product slug>" }, e.g.
// { "/aspose/aspose-pdf-for--net": "aspose-pdf-for-net" }. Each targets the specific new product page
// (`/#product/<slug>`, honoured on load). These MUST precede the vendor wildcards so first-match sends the
// buyer to the exact product, not just its vendor's catalogue. Ben supplies this map at cutover; until then
// the vendor wildcards cover every product. Entries with a blank slug or a root path are skipped.
export function productRedirectRules(productMap) {
  if (!productMap || typeof productMap !== 'object') return [];
  const rules = [];
  const seen = new Set();
  for (const [oldPath, slug] of Object.entries(productMap)) {
    if (oldPath.startsWith('_')) continue; // convention: "_comment" etc. are metadata, not mappings
    const from = normalisePath(oldPath);
    const s = String(slug == null ? '' : slug).trim().replace(/^\/+#?product\//, '');
    if (!s || from === '/' || seen.has(from)) continue;
    seen.add(from);
    rules.push({ from, to: '/#product/' + s, code: 301, force: true });
  }
  return rules;
}

// Coverage report for an audit: how each known old path is handled. Used by the generator's --audit mode.
export function auditCoverage(paths) {
  const byKind = {};
  for (const raw of paths || []) {
    const p = normalisePath(raw);
    const { kind, dest } = classifyLegacyPath(p);
    (byKind[kind] ||= []).push({ path: p, dest });
  }
  return byKind;
}

// Format rule objects as aligned Netlify _redirects lines.
export function formatRules(rules) {
  const fromW = Math.max(0, ...rules.map((r) => r.from.length));
  const toW = Math.max(0, ...rules.map((r) => r.to.length));
  return rules.map((r) => `${r.from.padEnd(fromW)}  ${r.to.padEnd(toW)}  ${r.code}${r.force ? '!' : ''}`);
}

export const BLOCK_BEGIN = '# BEGIN legacy-redirects (generated by scripts/gen-legacy-redirects.mjs — do not edit by hand)';
export const BLOCK_END = '# END legacy-redirects';

// The full generated block (markers + grouped, commented rule lines) to splice into public/_redirects.
// productMap (optional): the migrated slug map for exact per-product redirects (see productRedirectRules).
export function renderBlock(paths, productMap = null) {
  const product = productRedirectRules(productMap);
  const vendor = [], structural = [], blog = [], content = [];
  for (const r of redirectRulesFor(paths)) {
    if (r.to.startsWith('/#shop/')) vendor.push(r);
    else if (r.to === '/#shop' || r.to === '/#account') structural.push(r);
    else if (r.from === '/blog' || r.from.startsWith('/blog') || r.from.startsWith('/news')) blog.push(r);
    else content.push(r);
  }
  const lines = [BLOCK_BEGIN,
    '# Old greatstonesoftware.co.uk → new hash-routing SPA. Destinations are load-honoured routes only.'];
  if (product.length) {
    lines.push('# Exact product redirects (old product URL → its new product page), from the migrated slug map.');
    lines.push(...formatRules(product));
  }
  lines.push('# Vendor pages + all products under them → that vendor’s storefront catalogue.');
  lines.push(...formatRules(vendor));
  lines.push('# Storefront, basket/checkout and account/session URLs.');
  lines.push(...formatRules(structural));
  lines.push('# Blog + news → home (no per-article page yet).');
  lines.push(...formatRules(blog));
  if (content.length) {
    lines.push('# Info/legal/marketing pages → home (not yet hash-addressable; refine when content deep-linking lands).');
    lines.push(...formatRules(content));
  }
  lines.push(BLOCK_END);
  return lines.join('\n');
}
