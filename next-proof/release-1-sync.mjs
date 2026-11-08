// GRE-1936: plan release 1 from the live site's published content and GSAM's pages.
// GRE-2389 imported the live pages into GSAM on 25 October; GSAM's block ids from that
// import are the stable ids. The repo seed mints new ids on every load, so live content
// is matched to GSAM blocks here and keeps GSAM's id wherever a block already exists.

// Live path -> GSAM sitemap slug, as GRE-2389 imported them. Same-path pages are implicit.
export const RELEASE_1_PATHS = Object.freeze({
  '/dx-consultancy': '/consultancy',
  '/transformation-services': '/consultancy/transformation-services',
  '/how-we-help': '/consultancy/how-we-help',
  '/method': '/consultancy/how-we-work',
  '/industries': '/consultancy/industries',
  '/climb': '/consultancy/the-climb',
  '/case-studies': '/proof',
  // GRE-3711: live /services goes into GSAM's /consultancy/services page.
  '/services': '/consultancy/services',
});

// GSAM pages --apply must not overwrite. /consultancy holds the GRE-3404 draft under
// review (GRE-3712); take it off this list only for the sync just before cutover.
export const RELEASE_1_HELD = Object.freeze(['/consultancy']);

export const gsamSlugFor =(livePath) => RELEASE_1_PATHS[livePath] || livePath;

// One page, two addresses: the live path and its GSAM slug. When the release publishes only one,
// the other is where an old link or a nav item still points, so it lands there instead of a 404.
// Pages that moved after release 1, tried in order: the first published one wins. John, 8 Nov: the digital
// office is GS Agentic Manager, its own tab; until that page is published the old address shows the
// Transformation Services page it served before.
export const MOVED_PATHS = Object.freeze({
  '/consultancy/digital-office': ['/gs-agentic-manager', '/consultancy/transformation-services'],
  // Release 2 still serves Transformation Services at the old digital office address until John republishes.
  '/transformation-services': ['/consultancy/transformation-services', '/consultancy/digital-office'],
});

export function publishedAlias(path, pagePaths) {
  if (pagePaths.includes(path)) return null;
  const moved = MOVED_PATHS[path]?.find((to) => pagePaths.includes(to));
  if (moved) return moved;
  for (const [live, gsam] of Object.entries(RELEASE_1_PATHS)) {
    if (path === live && pagePaths.includes(gsam)) return gsam;
    if (path === gsam && pagePaths.includes(live)) return live;
  }
  return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The k-th block of a type keeps the id of GSAM's k-th block of that type.
export function stableBlockIds(liveContent, gsamContent = []) {
  const pool = new Map();
  for (const block of gsamContent) {
    if (!pool.has(block.type)) pool.set(block.type, []);
    pool.get(block.type).push(block.props?.id);
  }
  const used = new Set();
  return liveContent.map((block) => {
    const reused = pool.get(block.type)?.shift();
    const id = reused && !used.has(reused) ? reused : block.props.id;
    if (used.has(id)) throw new Error(`Duplicate block id ${id} on ${block.type}`);
    used.add(id);
    return { ...block, props: { ...block.props, id } };
  });
}

export function planPage(livePage, gsamPage) {
  const gsamSlug = gsamSlugFor(livePage.path);
  if (!gsamPage) return { path: livePage.path, gsamSlug, action: 'missing' };
  // John, 8 Nov: a page already in the HTML format (gs-html) was converted on purpose; block content never overwrites it.
  if (gsamPage.content?.format === 'gs-html') return { path: livePage.path, gsamSlug, pageId: gsamPage.id, baseRevisionId: gsamPage.latestRevisionId, action: 'html' };
  const gsamContent = gsamPage.content?.content || [];
  const content = stableBlockIds(livePage.data.content, gsamContent);
  // Release 1 is the live page as published; GSAM-only settings stay in GSAM's history.
  const root = livePage.data.root || { props: {} };
  const rootChanged = !same(root, gsamPage.content?.root || {});
  const changedBlocks = content.filter((block, index) => !same(block, gsamContent[index])).length;
  const gsamOnlyBlocks = gsamContent.filter((block) => !content.some((live) => live.props.id === block.props?.id))
    .map((block) => block.type);
  const unchanged = !rootChanged && changedBlocks === 0 && gsamContent.length === content.length;
  return {
    path: livePage.path, gsamSlug, pageId: gsamPage.id, baseRevisionId: gsamPage.latestRevisionId,
    status: gsamPage.status, action: unchanged ? 'unchanged' : 'update', rootChanged,
    blocks: content.length, changedBlocks, gsamOnlyBlocks,
    reusedIds: content.filter((block) => gsamContent.some((g) => g.props?.id === block.props.id)).length,
    content: { root, content },
  };
}

export function planRelease1(release, gsamPages) {
  const bySlug = new Map(gsamPages.map((page) => [page.slug, page]));
  const plan = release.pages.map((page) => planPage(page, bySlug.get(gsamSlugFor(page.path))));
  const ids = plan.flatMap((entry) => entry.content?.content.map((block) => `${entry.gsamSlug}#${block.props.id}`) || []);
  if (new Set(ids).size !== ids.length) throw new Error('Release 1 has a repeated page block id');
  return plan;
}

// Text summary: one line per page, never the content itself.
export function describePlan(plan) {
  return plan.map((entry) => entry.action === 'missing' || entry.action === 'html'
    ? `${entry.path} -> ${entry.gsamSlug}: ${entry.action === 'html' ? 'already HTML, skipped' : 'missing in GSAM'}`
    : `${entry.path} -> ${entry.gsamSlug}: ${entry.action}, ${entry.blocks} blocks, ${entry.changedBlocks} changed, `
      + `${entry.reusedIds} GSAM ids kept${entry.rootChanged ? ', page settings changed' : ''}`
      + `${entry.gsamOnlyBlocks.length ? `, GSAM-only blocks: ${entry.gsamOnlyBlocks.join(' ')}` : ''}`).join('\n');
}

// GRE-3711: release 1 takes the live content. Each saved page records the revision it
// replaced, so the redesign drafts and home's GSAM settings can be restored after publish.
// `save(entry)` returns GSAM's WebsiteSaveResult; a conflict or failure stops the run.
export async function applyPlan(plan, save, { hold = [] } = {}) {
  const record = [];
  for (const entry of plan) {
    if (entry.action === 'missing') throw new Error(`${entry.path} has no GSAM page at ${entry.gsamSlug}`);
    if (entry.action === 'unchanged' || entry.action === 'html' || hold.includes(entry.gsamSlug)) {
      const action = entry.action === 'update' ? 'held' : entry.action;
      record.push({ path: entry.path, gsamSlug: entry.gsamSlug, pageId: entry.pageId, action, revisionId: entry.baseRevisionId });
      continue;
    }
    const result = await save(entry);
    const saved = { path: entry.path, gsamSlug: entry.gsamSlug, pageId: entry.pageId, previousRevisionId: entry.baseRevisionId };
    if (result?.state !== 'saved') {
      record.push({ ...saved, action: result?.state || 'failed', message: result?.message || 'No answer from GSAM' });
      return { ok: false, record };
    }
    record.push({ ...saved, action: 'saved', revisionId: result.revisionId, revisionNumber: result.revisionNumber });
  }
  return { ok: true, record };
}
