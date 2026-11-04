// GRE-1861: the public intelligence dashboard's data. GSAM's Intelligence page holds the boards and the
// AI briefing its analyst agent writes each morning; parts of them are internal (the Greatstone lens,
// actions for our agents, commentary about our own platform). Only the fields listed here reach the
// site, and any kept text that names Greatstone, GSAM or one of its agents is dropped as well.

export const PUBLIC_INTELLIGENCE_VERSION = 1;

// Agent names that are also everyday words (Summit, Harbor, Ridge…) are left out so real news survives.
const INTERNAL = /\b(?:greatstone|gsam|lodestone|keystone|lintel|mikey|touchstone|whetstone)\b/i;
const BOARDS = ['ai_systems', 'frontier_models', 'tools_agents'];
const SPECS = ['speed', 'context', 'priceIn', 'priceOut'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const text = (value, max = 600) => (typeof value === 'string' && value.trim() && !INTERNAL.test(value) ? value.trim().slice(0, max) : null);
const url = (value) => {
  try { const parsed = new URL(value); return parsed.protocol === 'https:' ? parsed.href : null; } catch { return null; }
};
const domain = (value) => (typeof value === 'string' && /^[a-z0-9.-]{1,120}$/i.test(value) ? value.toLowerCase() : null);
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const date = (value) => (typeof value === 'string' && DATE.test(value) ? value : null);
const compact = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null && value !== undefined));

function movement(value) {
  if (!value || typeof value !== 'object') return null;
  return compact({ rankDelta: number(value.rankDelta), scoreDelta: number(value.scoreDelta), isNew: value.isNew === true || null });
}

function boardEntry(entry) {
  const name = text(entry?.name, 80);
  if (!name || !Number.isInteger(entry.rank)) return null;
  const specs = entry.specs && typeof entry.specs === 'object'
    ? compact(Object.fromEntries(SPECS.map((key) => [key, typeof entry.specs[key] === 'string' ? text(entry.specs[key], 20) : number(entry.specs[key])])))
    : {};
  return compact({
    rank: entry.rank, name, maker: text(entry.maker, 80), flagship: text(entry.flagship, 120), score: number(entry.score),
    url: url(entry.url), domain: domain(entry.domain), verdict: text(entry.verdict), movement: movement(entry.movement),
    specs: Object.keys(specs).length ? specs : null,
  });
}

function newsItem(item) {
  const headline = text(item?.headline, 240);
  const link = url(item?.url);
  if (!headline || !link) return null;
  const points = Array.isArray(item.points) ? item.points.map((point) => text(point, 400)).filter(Boolean).slice(0, 4) : [];
  return compact({
    headline, url: link, sourceName: text(item.sourceName, 80), domain: domain(item.domain), tag: text(item.tag, 60),
    date: date(item.date), lead: item.lead === true || null, rumoured: item.rumoured === true || null,
    verdict: text(item.verdict), points: points.length ? points : null,
  });
}

function mover(item) {
  const name = text(item?.name, 120);
  if (!name || !['up', 'down'].includes(item.direction)) return null;
  return compact({ name, tag: text(item.tag, 60), note: text(item.note, 300), url: url(item.url), domain: domain(item.domain), direction: item.direction });
}

// Vendor marks the site hosts at public/assets/intel/logos/<domain>.svg (Simple Icons, CC0). Others show a monogram.
const LOGO_DOMAINS = new Set(['anthropic.com', 'apple.com', 'cline.bot', 'cursor.com', 'deepseek.com', 'github.com', 'google.com', 'kimi.com',
  'meta.com', 'microsoft.com', 'mistral.ai', 'openai.com', 'perplexity.ai', 'postman.com', 'qwen.ai', 'replit.com']);

export const vendorLogo = (value) => (LOGO_DOMAINS.has(domain(value)) ? `/assets/intel/logos/${value.toLowerCase()}.svg` : null);

/** The picture for a news item: the image set for its topic (the part of its tag after "·"), else the fallback. */
export function newsImage(item, images) {
  const topic = typeof item?.tag === 'string' ? item.tag.split('·').pop().trim().toLowerCase() : '';
  return images?.topics?.[topic] ?? images?.fallback ?? null;
}

/** Builds the public snapshot from GSAM's `boards` and latest `ai_briefing` report responses. */
export function publicIntelligence({ boards, briefing }) {
  const views = (boards?.boards ?? [])
    .filter((view) => BOARDS.includes(view.board))
    .map((view) => ({ board: view.board, date: date(view.snapshotDate), comparedTo: date(view.comparedTo), entries: (view.entries ?? []).map(boardEntry).filter(Boolean) }))
    .filter((view) => view.entries.length);
  const sections = briefing?.status === 'published' ? briefing.sections ?? {} : {};
  return {
    version: PUBLIC_INTELLIGENCE_VERSION,
    date: date(briefing?.reportDate) ?? views[0]?.date ?? null,
    headline: briefing?.status === 'published' ? text(briefing.headline, 240) : null,
    boards: views,
    news: (sections.news ?? []).map(newsItem).filter(Boolean).slice(0, 16),
    movers: (sections.radar?.movers ?? []).map(mover).filter(Boolean).slice(0, 8),
  };
}
