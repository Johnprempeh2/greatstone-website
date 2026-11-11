// The website guide's two inputs, built from what the site publishes: the pages a visitor may be taken to (the
// allow-list) and the words the guide may draw on. Nothing here is written by hand about Greatstone: every fact
// comes from the release, the published service catalogue or the software catalogue. Pure, so the function and
// the tests build the same thing from the same inputs.
import { sitemapUrls } from '../../app/sitemap-urls.mjs';
import { serviceCatalogueFromRelease } from '../service-pages.mjs';
import { catalogueFromRelease } from '../catalogue-data.mjs';
import { landingData } from '../landing-copy.mjs';
import { ISLANDS } from '../islands.mjs';
import { serviceSlug } from '../../src/store/service-lookup.mjs';
import { fmtMoney } from '../../src/lib/pricing.mjs';

// The two pages built in code rather than in the release, named as their own <title> names them.
const CODE_PAGE_TITLES = { '/shop': 'Software Catalogue', '/ai-market-intelligence': 'AI Market Intelligence', '/gs-agentic-manager': 'GS Agentic Manager' };
const PAGE_CHARS = 2500;
// ponytail: the whole catalogue goes in the prompt. Past this many products the rest are left to the shop page;
// move to a search tool if the catalogue outgrows it.
const MAX_PRODUCTS = 300;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', pound: '£', middot: '·', hellip: '…' };
const decode = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
  if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? whole;
  const code = name[1].toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
});

/** The words a visitor reads in a piece of HTML: no scripts, styles, tags or comments. One line per block. */
export function htmlText(html) {
  return decode(String(html ?? '')
    .replace(/<(script|style|svg|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|h[1-6]|li|section|article|header|footer|tr|blockquote|figcaption|summary|dt|dd)\s*>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' '))
    .split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

// Block props that are not words for a visitor: ids, links, images, layout switches and form furniture.
const NOT_WORDS = /^(_|id$|aria|icon|anchor)|(Id|Href|Url|Src|Image|Icon|Level|Label|Placeholder|Email)$/;
// Review-only drafts and button furniture on the landing (src/blocks/TwoDoors.jsx shows the drafts only in a
// review build, and the client strip's names are not in the release, so its heading says nothing on its own).
const NOT_PUBLISHED = /^(draft|pending|clients(Heading|Kicker)$|more(Closed|Open)$|swipeHint$|proofLink$|toolLink)|(Draft|Cta)$/;
const LOOKS_LIKE_A_VALUE = /^([a-z0-9_-]+|https?:\S+|mailto:\S+|[/#]\S*)$/;
// The landing hides a kicker that still holds its placeholder; a string with no letters is an arrow or a bullet.
const NOT_A_SENTENCE = (text) => LOOKS_LIKE_A_VALUE.test(text) || /^copy placeholder/i.test(text) || !/\p{L}/u.test(text);
// No verified case study is published yet, so the landing hides this block (see landing-copy.mjs); so does the guide.
const HIDDEN_BLOCKS = new Set(['TwoDoorsProof', 'ServiceCatalog']);

/** Every visitor-facing string in a list of content blocks, in page order, each once. */
export function blockText(blocks) {
  const seen = new Set();
  const walk = (value, key) => {
    if (typeof value === 'string') {
      const text = htmlText(value);
      if (text && !NOT_A_SENTENCE(text)) seen.add(text);
    } else if (Array.isArray(value)) value.forEach((item) => walk(item, key));
    else if (value && typeof value === 'object') {
      for (const [name, inner] of Object.entries(value)) if (!NOT_WORDS.test(name) && !NOT_PUBLISHED.test(name)) walk(inner, name);
    }
  };
  for (const block of Array.isArray(blocks) ? blocks : []) if (block && !HIDDEN_BLOCKS.has(block.type)) walk(block.props);
  return [...seen].join('\n');
}

const ISLAND_TAG = /<gs-island\b[^>]*\bname="([a-z0-9-]+)"[^>]*>/g;
const attribute = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

function pageText(page) {
  if (typeof page.html !== 'string') return blockText(page.data?.content);
  const parts = [htmlText(page.html)];
  for (const [tag, name] of page.html.matchAll(ISLAND_TAG)) {
    // The landing's words live in its frozen blocks plus the page's own overrides, not in the page HTML.
    if (name === 'two-doors-landing') parts.push(blockText(landingData(decode(attribute(tag, 'data-copy') || '')).content));
    // Other interactive parts (a form, a calculator) are named as the site's own island contract names them.
    else if (ISLANDS[name]?.block && name !== 'service-catalog') parts.push(`On this page: ${ISLANDS[name].label}. ${ISLANDS[name].placeholder}`);
  }
  return parts.filter(Boolean).join('\n');
}

const clip = (text, max) => (text.length <= max ? text : `${text.slice(0, text.lastIndexOf(' ', max))} …`);
const line = (...parts) => parts.filter(Boolean).join(' ');
const sentence = (label, value) => (value ? `${label}: ${String(value).trim().replace(/[.\s]+$/, '')}.` : '');
const titleFromPath = (path) => path.split('/').filter(Boolean).pop()?.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) || 'Home';

/**
 * What the guide knows and where it may send a visitor.
 * `catalogue` is the software catalogue; pass it priced (priceCatalogue) and each product says what its card says.
 * Unpriced, products carry no price at all, so the guide has none to quote.
 * @returns {{ routes: Array<{ path: string, title: string }>, text: string, contactPath: string | null }}
 */
export function buildSiteKnowledge(release, { frozenBlocks = {}, catalogue = catalogueFromRelease(release) } = {}) {
  const pages = new Map(release.pages.map((page) => [page.path, page]));
  const routes = new Map();
  const add = (path, title) => { if (!routes.has(path)) routes.set(path, { path, title: String(title || titleFromPath(path)).trim() }); };

  const sections = [];
  const pageLines = [];
  for (const path of sitemapUrls(release, '').map((entry) => entry.url)) {
    const page = pages.get(path);
    add(path, page?.title || CODE_PAGE_TITLES[path]);
    pageLines.push(line(`## ${routes.get(path).title} (${path})`, page?.seo?.description ? `\n${htmlText(page.seo.description)}` : '',
      page ? `\n${clip(pageText(page), PAGE_CHARS)}` : ''));
  }
  sections.push(`# Pages\n\n${pageLines.join('\n\n')}`);

  const services = serviceCatalogueFromRelease(release, frozenBlocks);
  // Service pages exist only when a published page lists the services (path is that page).
  if (services.path) {
    const rows = services.services.filter((service) => service?.name && serviceSlug(service)).map((service) => {
      const path = `/service/${serviceSlug(service)}`;
      add(path, service.name);
      return line(`- ${service.name} (${path}).`, sentence('Category', service.category), htmlText(service.oneLiner),
        sentence('Format', service.format), sentence('Outcome', htmlText(service.outcome)), sentence('For', htmlText(service.idealClient)));
    });
    sections.push(`# Services (${rows.length}). Each has its own page. The full list is on ${services.path}\n\n${rows.join('\n')}`);
  }

  const vendors = (catalogue?.vendors || []).filter((vendor) => vendor?.slug && vendor?.name);
  const offerings = (catalogue?.offerings || []).filter((item) => item?.slug && item?.name);
  if (offerings.length) {
    for (const vendor of vendors) add(`/shop/${encodeURIComponent(vendor.slug)}`, `${vendor.name} software`);
    const rows = offerings.slice(0, MAX_PRODUCTS).map((item) => {
      const path = `/product/${encodeURIComponent(item.slug)}`;
      add(path, item.name);
      // The words on the product card, and only when the live price was read (app/catalogue.jsx).
      const price = !item.pricing ? '' : item.pricing.final == null ? 'Price on application.' : `Price: from ${fmtMoney(item.pricing.final, item.pricing.currency)} + VAT.`;
      return line(`- ${item.name} (${path}).`, sentence('Vendor', item.vendor?.name), sentence('Category', item.category?.name),
        htmlText(item.short_description), price);
    });
    const more = offerings.length > MAX_PRODUCTS ? `\nThe software catalogue has ${offerings.length - MAX_PRODUCTS} more products than are listed here. They are on /shop` : '';
    sections.push(`# Software products (${offerings.length}), sold through the software catalogue on /shop\n\n${rows.join('\n')}${more}`);
    if (vendors.length) sections.push(`# Software vendors\n\n${vendors.map((vendor) => `- ${vendor.name} (/shop/${encodeURIComponent(vendor.slug)})`).join('\n')}`);
  }

  return {
    routes: [...routes.values()],
    // The wrapper the prompt puts this in must not be closable from inside it.
    text: sections.join('\n\n').replace(/<\/?site_content>/gi, ''),
    contactPath: routes.has('/contact') ? '/contact' : null,
  };
}
