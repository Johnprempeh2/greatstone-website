// GRE-3776: the island tag contract for schema 2 (HTML) pages.
// Page HTML places and configures an island with <gs-island name="…" data-…>; the engine renders it.
// Only names listed here render, and only the data attributes listed for that name reach the island.
// Every attribute value must match its pattern; anything else is dropped by the sanitiser.
// GRE-3777: every island also has a label and a placeholder, which GSAM live design shows where the
// island cannot run (see islandPlaceholderCss and the /_islands answer).
import { BACKGROUND_EFFECTS, COLOURS } from './motion-contract.mjs';

export const ISLAND_CONTRACT = 1;

const formKey = /^[a-z0-9][a-z0-9-]{0,63}$/;
const formAttributes = { 'data-form': { prop: 'formKey', pattern: formKey }, 'data-block': { prop: 'blockId', pattern: formKey } };
const slug = /^[a-z0-9][a-z0-9-]{0,119}$/;
const oneOf = (values) => new RegExp(`^(?:${values.map((value) => value.replace(/[.]/g, '\\.')).join('|')})$`);
const enumRule = (prop, values) => ({ prop, pattern: oneOf(values), values });
const ANIMATION_EFFECTS = BACKGROUND_EFFECTS.map((effect) => effect.slice(3));

export const ISLANDS = {
  'enquiry-form': { block: 'BookDeepDive', label: 'Enquiry form', placeholder: 'Name, email and message. Sends an enquiry to the team.', height: 520,
    attributes: formAttributes },
  'ai-baseline-survey': { block: 'AiBaselineSurvey', label: 'AI baseline survey', placeholder: 'The AI baseline survey and its results.', height: 560,
    attributes: formAttributes },
  'ai-cost-calculator': { block: 'AiCostCalculator', label: 'AI cost calculator', placeholder: 'The AI cost calculator and its results.', height: 560,
    attributes: formAttributes },
  // GRE-3789: the service catalogue: search, category filter, featured tabs and the inquiry basket.
  'service-catalog': { block: 'ServiceCatalog', label: 'Service catalogue', placeholder: 'Every service, with search, category filters and the inquiry basket.', height: 1200,
    attributes: { 'data-block': formAttributes['data-block'] } },
  'cookie-settings': { component: 'CookieSettings', label: 'Cookie settings', placeholder: 'Opens the cookie settings.', height: 32, inline: true, attributes: {} },
  quote: { component: 'QuoteIsland', label: 'Quote', placeholder: 'Adds a service to the basket and sends the quote request.', height: 96,
    attributes: {
      'data-service': { prop: 'service', pattern: slug },
      'data-service-name': { prop: 'serviceName', pattern: /^[A-Za-z0-9][A-Za-z0-9 &,.'()+/-]{0,79}$/ },
    } },
  // GRE-3862: `header` is the studio header's account button.
  'account-entry': { component: 'AccountEntry', label: 'Account entry', placeholder: 'Sign in, or My account when signed in.', height: 48, inline: true,
    attributes: { 'data-style': enumRule('look', ['button', 'link', 'header']) } },
  // GRE-3862: the studio header's search: the ⌘K button and the palette of the site's pages.
  'site-search': { component: 'SiteSearch', label: 'Site search', placeholder: 'Search the site (⌘K).', height: 38, inline: true, attributes: {} },
  'product-list': { component: 'ProductList', label: 'Product list', placeholder: 'Products from the catalogue collection.', height: 360,
    attributes: {
      'data-vendor': { prop: 'vendor', pattern: slug },
      'data-category': { prop: 'category', pattern: slug },
      'data-limit': { prop: 'limit', pattern: /^(?:[1-9]|1[0-9]|2[0-4])$/ },
      'data-sort': enumRule('sort', ['featured', 'az', 'price', 'price-desc']),
    } },
  'stone-3d': { component: 'StoneIsland', label: '3D stone', placeholder: 'The 3D Greatstone stone. A still image on phones and with reduced motion.', height: 420,
    attributes: { 'data-size': enumRule('size', ['hero', 'accent']) } },
  animation: { component: 'AnimationIsland', label: 'Animation', placeholder: 'A decorative background animation. Still with reduced motion.', height: 320,
    attributes: {
      'data-effect': enumRule('effect', ANIMATION_EFFECTS),
      'data-intensity': enumRule('intensity', ['subtle', 'full']),
      'data-speed': enumRule('speed', ['still', 'slow', 'normal']),
      'data-colour': enumRule('colour', COLOURS),
    } },
  // GRE-1861: the AI intelligence dashboard: overview, leaderboards, compare and news from the public snapshot.
  'intel-dashboard': { component: 'IntelDashboard', label: 'AI intelligence dashboard', placeholder: 'The AI intelligence dashboard: overview, leaderboards, compare and news.', height: 1400,
    attributes: { 'data-tab': enumRule('tab', ['overview', 'leaderboards', 'compare', 'news']) } },
  // John, 8 Nov: The Climb's chart (MaturityMap) keeps its React render, trail glow included; the HTML sanitiser refuses `filter`.
  'maturity-map': { block: 'MaturityMap', label: 'The Climb chart', placeholder: 'The Climb maturity chart, with its trail and tier cards.', height: 900,
    attributes: { 'data-block': formAttributes['data-block'] } },
  // GRE-3778: the frozen landing (Two Doors, v15) renders its published blocks unchanged.
  'two-doors-landing': { component: 'TwoDoorsLanding', label: 'Two Doors landing', placeholder: 'The frozen Two Doors landing: doors and hero.', height: 900,
    // Its words, from GSAM's Website module: a JSON object of text fields and showCue (app/TwoDoorsLanding.jsx filters it).
    attributes: { 'data-copy': { prop: 'copy', pattern: /^\{[\s\S]{0,20000}\}$/ } } },
};

// Returns the island's props and accepted attributes, or null when the name is not registered.
// `removed` collects each attribute the registry refused.
export function islandProps(name, attributes, removed = []) {
  const island = Object.hasOwn(ISLANDS, name) ? ISLANDS[name] : null;
  if (!island) return null;
  const props = {};
  const accepted = {};
  for (const [attribute, value] of attributes) {
    if (attribute === 'name') continue;
    const rule = Object.hasOwn(island.attributes, attribute) ? island.attributes[attribute] : null;
    if (rule && rule.pattern.test(value)) { props[rule.prop] = value; accepted[attribute] = value; }
    else removed.push(`gs-island[${name}] @${attribute}`);
  }
  return { props, attributes: accepted };
}

const cssString = (value) => `"${value.replace(/["\\]/g, '\\$&')}"`;

// The CSS GSAM live design adds to a draft page: each <gs-island> tag becomes a labelled box the size
// of the real island, so the page keeps its layout while the island cannot run there.
export function islandPlaceholderCss() {
  const base = 'gs-island{display:flex;flex-direction:column;justify-content:center;gap:6px;box-sizing:border-box;margin:16px 0;padding:20px 24px;'
    + 'border:1px dashed rgba(200,255,0,.55);border-radius:14px;background:repeating-linear-gradient(135deg,rgba(200,255,0,.05) 0 12px,transparent 12px 24px);'
    + 'color:#f5f5f5;font:600 15px/1.4 system-ui,sans-serif;text-align:left}'
    + 'gs-island::before{color:#c8ff00;font-size:12px;letter-spacing:.12em;text-transform:uppercase}'
    + 'gs-island::after{color:#c4c8c1;font-weight:400}';
  const rules = Object.entries(ISLANDS).map(([name, island]) => `gs-island[name=${cssString(name)}]{min-height:${island.height}px${island.inline ? ';display:inline-flex;margin:0;padding:6px 12px' : ''}}`
    + `gs-island[name=${cssString(name)}]::before{content:${cssString(`Island: ${island.label}`)}}`
    + `gs-island[name=${cssString(name)}]::after{content:${cssString(island.placeholder)}}`);
  return base + rules.join('');
}

// The island list GSAM reads from /_islands: names, labels, placeholders and the accepted attributes.
export function islandManifest() {
  return {
    islandContract: ISLAND_CONTRACT,
    islands: Object.entries(ISLANDS).map(([name, island]) => ({
      name, label: island.label, placeholder: island.placeholder, height: island.height, inline: Boolean(island.inline),
      attributes: Object.fromEntries(Object.entries(island.attributes).map(([attribute, rule]) =>
        [attribute, rule.values ? { values: rule.values } : { pattern: rule.pattern.source }])),
    })),
    placeholderCss: islandPlaceholderCss(),
  };
}
