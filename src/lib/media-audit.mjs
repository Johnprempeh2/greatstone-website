// Greatstone "Media usage" — a pure, read-only audit of the image LIBRARY against where images are
// actually used. store.addAsset registers an asset on every pick/upload and dedupes by URL, but nothing
// prunes when a block is deleted or its image swapped — so unused (often heavy data-URI) assets pile up
// and crowd the localStorage quota (persist sheds version snapshots under pressure), and a page can
// reference an image with no library row, so it has no curated alt. This surfaces three things nothing
// else can see: UNUSED library images (no page uses them), UNTRACKED page images (used but not in the
// library), and MISSING ALT (a known image field whose alt is blank), plus a "where used" map.
// Pure: reads pages/order/seo/assets/products only; no mutation, no network; node --test-able.
// Distinct from: a11y-check (link text + H1, explicitly NOT alt), findMissingAlt (publish-only +
// Storefront-gated), link-audit (link TARGETS, never image URLs), content-search (walkText SKIPS image keys).

// prop keys that hold an image URL (key-gated, robust to new blocks — mirrors link-audit's LINK_PROPS).
const IMAGE_KEYS = new Set(['image', 'photo', 'companyLogo', 'logo', 'src', 'ogImage']);
const noAlt = (v) => !(v && String(v).trim());
const normUrl = (u) => String(u == null ? '' : u).trim(); // data-URIs are case-sensitive — trim only, never lowercase.
const isData = (u) => /^data:/.test(u);

// base64 payload of a data: URI → byte count (the reclaimable weight). 0 for an http/relative URL.
export function dataUriBytes(url) {
  if (!isData(url)) return 0;
  const b64 = String(url).split(',')[1] || '';
  return Math.floor((b64.length * 3) / 4);
}
export function fmtBytes(n) {
  if (!n || n < 1024) return (n || 0) + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

// recurse props, emitting cb(url, key) for every non-empty string under an IMAGE_KEYS key (incl. in arrays).
function walkImageValues(node, cb, key) {
  if (Array.isArray(node)) { node.forEach((n) => walkImageValues(n, cb, key)); return; }
  if (node && typeof node === 'object') { Object.keys(node).forEach((k) => walkImageValues(node[k], cb, k)); return; }
  if (typeof node === 'string' && key && IMAGE_KEYS.has(key) && normUrl(node)) cb(normUrl(node), key);
}

// the known image+alt block shapes (mirrors findMissingAlt's curated-alt rules) → push a missing-alt row.
// Only flag keys that HAVE a sibling alt field (Figure/FeaturedArticle .alt, Team .name, InsightsGrid
// posts[].alt); image keys with no curated alt field (logo/companyLogo/ogImage/Hero image) are never
// flagged — there's no alt to be missing, so flagging them would be a false positive.
function collectMissingAlt(content, pageSlug, out) {
  (content || []).forEach((b) => {
    const p = (b && b.props) || {};
    const bt = (b && b.type) || 'Block';
    if ((bt === 'Figure' || bt === 'FeaturedArticle') && normUrl(p.image) && noAlt(p.alt)) {
      out.push({ pageSlug, blockType: bt, field: 'image', url: normUrl(p.image), where: bt === 'Figure' ? 'Figure image' : 'Featured: ' + (p.title || 'article') });
    }
    if (bt === 'Team' && Array.isArray(p.items)) p.items.forEach((m) => { if (m && normUrl(m.photo) && noAlt(m.name)) out.push({ pageSlug, blockType: 'Team', field: 'photo', url: normUrl(m.photo), where: 'Team photo (no name)' }); });
    if (bt === 'InsightsGrid' && Array.isArray(p.posts)) p.posts.forEach((post) => { if (post && normUrl(post.image) && noAlt(post.alt)) out.push({ pageSlug, blockType: 'InsightsGrid', field: 'image', url: normUrl(post.image), where: 'Insight: ' + (post.title || 'post') }); });
    if (bt === 'Columns' && Array.isArray(p.columns)) p.columns.forEach((c) => { if (c && normUrl(c.image) && noAlt(c.alt)) out.push({ pageSlug, blockType: 'Columns', field: 'image', url: normUrl(c.image), where: 'Column: ' + (c.heading || 'column') }); });
  });
}

export function auditMedia(state) {
  const pages = (state && state.pages) || {};
  const order = (state && state.order) || Object.keys(pages);
  const assets = Object.values((state && state.assets) || {});
  const products = (state && state.products) || [];

  const assetByUrl = new Map();
  assets.forEach((a) => { if (a && a.url) assetByUrl.set(normUrl(a.url), a); });

  const usageByUrl = new Map(); // url -> { url, asset, uses:[{pageSlug, blockType, blockId, field}] }
  const recordUse = (url, use) => {
    if (!usageByUrl.has(url)) usageByUrl.set(url, { url, asset: assetByUrl.get(url) || null, uses: [] });
    usageByUrl.get(url).uses.push(use);
  };
  const missingAlt = [];

  order.forEach((slug) => {
    const page = pages[slug];
    if (!page) return;
    const content = (page.data && page.data.content) || [];
    content.forEach((block) => {
      const props = (block && block.props) || {};
      const blockId = props.id || '';
      const blockType = (block && block.type) || 'Block';
      walkImageValues(props, (url, key) => recordUse(url, { pageSlug: slug, blockType, blockId, field: key }), null);
    });
    collectMissingAlt(content, slug, missingAlt);
    const og = page.seo && normUrl(page.seo.ogImage); // the social-card image is a real usage too
    if (og) recordUse(og, { pageSlug: slug, blockType: 'SEO', blockId: '', field: 'ogImage' });
  });

  // products: a broader STANDING version of findMissingAlt's (Storefront-gated, publish-time) product
  // check — every non-draft product image is a real usage, surfaced site-wide under the (catalogue) key.
  products.forEach((p) => {
    if (!p || p.status === 'draft') return;
    const url = normUrl(p.image);
    if (!url) return;
    recordUse(url, { pageSlug: '(catalogue)', blockType: 'Product', blockId: p.id || '', field: 'image' });
    if (noAlt(p.imageAlt)) missingAlt.push({ pageSlug: '(catalogue)', blockType: 'Product', field: 'image', url, where: 'Product: ' + (p.name || 'product') });
  });

  const usage = [...usageByUrl.values()];
  const usedUrls = new Set(usage.map((u) => u.url));

  // unused: library assets nothing references (info — heaviest first, the best storage win)
  const unused = assets
    .filter((a) => a && a.url && !usedUrls.has(normUrl(a.url)))
    .map((a) => ({ id: a.id, url: a.url, alt: a.alt || '', ts: a.ts || 0, bytes: dataUriBytes(a.url), isData: isData(a.url) }))
    .sort((x, y) => y.bytes - x.bytes);

  // untracked: used urls with no matching library asset (warn — most-used first)
  const untracked = usage
    .filter((u) => !assetByUrl.has(u.url))
    .map((u) => ({ url: u.url, isData: isData(u.url), uses: u.uses }))
    .sort((x, y) => y.uses.length - x.uses.length);

  const bytes = unused.reduce((s, a) => s + a.bytes, 0);
  return {
    unused, untracked, missingAlt, usage, bytes,
    errors: 0, // always 0 → the rail badge stays advisory and is kept OUT of the Studio total
    counts: { unused: unused.length, untracked: untracked.length, missingAlt: missingAlt.length },
  };
}
