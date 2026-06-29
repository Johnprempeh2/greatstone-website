import { walkText, stripMarks } from './content-search.mjs';

// Content inventory — a pure, read-only, content-ANALYTICS lens: per page, how much substance is there?
// Counts the SAME prose search indexes (the title counted directly like searchContent, body via the shared
// walkText/isSearchableText gate, marks stripped) so the numbers never drift from what's searchable.
// Floor-only advisory flags (THIN / SKELETON) + a neutral BULK note when ONE of several blocks dominates a
// page (the 78-service ServiceCatalog legitimately makes the services page ~12.6k words — never a defect).
// STORE-FREE: imports only content-search (pure); store.js pulls in puck.config.jsx = JSX, which bare
// node --test cannot load. Mirrors the sibling store-free models (schedule-model / notes-model / bulk-status).

export const THIN_WORDS = 120;     // a page under ~120 words is barely started (thinnest authored seed page ~343).
export const SKELETON_BLOCKS = 4;  // "scaffolded": 4+ blocks dropped in…
export const SKELETON_WPB = 25;    // …but under 25 words/block of actual prose.
export const BULK_SHARE = 0.70;    // one of several blocks contributing > 70% of a substantial page's words.

export function countWords(s) {
  const t = stripMarks(String(s == null ? '' : s)).trim();
  return t ? t.split(/\s+/).length : 0;
}

function median(nums) {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

export function analyzeContent(state) {
  const pages = (state && state.pages) || {};
  const order = (state && state.order) || Object.keys(pages);
  const rows = [];
  for (const slug of order) {
    const page = pages[slug];
    if (!page) continue;
    const data = page.data || {};
    const title = (data.root && data.root.props && data.root.props.title) || page.title || slug;
    const content = data.content || [];
    let words = countWords(title);
    let maxBlockWords = 0, maxBlockType = '';
    for (const block of content) {
      let bw = 0;
      walkText((block && block.props) || {}, null, '', (_fp, text) => { bw += countWords(text); });
      words += bw;
      if (bw > maxBlockWords) { maxBlockWords = bw; maxBlockType = (block && block.type) || ''; }
    }
    const blocks = content.length;
    const wordsPerBlock = blocks ? Math.round(words / blocks) : 0;
    const readMins = words > 0 ? Math.max(1, Math.ceil(words / 200)) : 0;
    rows.push({
      slug, title, status: page.status || 'draft', words, readMins, blocks, wordsPerBlock,
      thin: words < THIN_WORDS,
      skeleton: blocks >= SKELETON_BLOCKS && wordsPerBlock < SKELETON_WPB,
      // bulk only matters on a multi-block, non-thin page — a thin / single-block page is trivially "dominated".
      bulk: blocks >= 2 && words >= THIN_WORDS && maxBlockWords / words > BULK_SHARE,
      maxBlockType,
    });
  }
  const totalWords = rows.reduce((s, r) => s + r.words, 0);
  return {
    rows,
    summary: {
      pages: rows.length,
      totalWords,
      totalReadMins: totalWords > 0 ? Math.max(1, Math.ceil(totalWords / 200)) : 0,
      medianWords: median(rows.map((r) => r.words)),
      thinCount: rows.filter((r) => r.thin).length,
    },
  };
}
