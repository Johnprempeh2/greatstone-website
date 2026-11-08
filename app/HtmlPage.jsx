// GRE-3776: the renderer for schema 2 releases. A page is HTML inside the shared chrome (header, nav and
// footer are HTML documents too) with one site stylesheet. Every document is sanitised here, at render
// time, and becomes React elements; no HTML string reaches the browser unescaped.
import { createElement } from 'react';
import { sanitiseHtml } from '../next-proof/html-sanitiser.mjs';
import { sanitiseCss } from '../next-proof/css-sanitiser.mjs';
import { ISLANDS, islandPlaceholderCss } from '../next-proof/islands.mjs';
import { CHROME_KEYS } from '../next-proof/chrome-keys.mjs';
import { IslandBlock } from './ProofBlocks.jsx';
import { CookieSettings } from './ConsentAnalytics.jsx';
import { AccountEntry, AnimationIsland, QuoteIsland, SiteSearch, StoneIsland } from './islands.jsx';
import ProductListIsland from './ProductListIsland.jsx';
import IntelDashboardIsland from './IntelDashboardIsland.jsx';
import { Region } from './html-regions.mjs';
import TwoDoorsLanding from './TwoDoorsLanding.jsx';
import formBlocks from '../next-proof/frozen/form-blocks.json';
import HtmlBehaviours from './HtmlBehaviours.jsx';
import { ldScript } from '../src/lib/ld-json.mjs';
import { publicNavOrder } from '../src/lib/nav-order.js';
import { siteChrome } from './site-chrome.mjs';

const REACT_NAMES = { class: 'className', tabindex: 'tabIndex', colspan: 'colSpan', rowspan: 'rowSpan', srcset: 'srcSet', datetime: 'dateTime', hreflang: 'hrefLang' };
const BOOLEANS = new Set(['hidden', 'open', 'reversed']);
const COMPONENTS = { CookieSettings, QuoteIsland, AccountEntry, StoneIsland, AnimationIsland, ProductList: ProductListIsland, TwoDoorsLanding, SiteSearch, IntelDashboard: IntelDashboardIsland };
// Islands that read release data on the server get the release; browser islands get only their props.
const RELEASE_ISLANDS = new Set(['ProductList']);
// GRE-3862: the site search gets the public pages it lists, not the whole release.
const searchLinks = (release) => {
  const { order, pages, paths } = siteChrome(release);
  return publicNavOrder(order, pages, false).map((slug) => ({ label: pages[slug].title, href: paths[slug] }));
};
// GRE-3778: the frozen landing renders Puck blocks, which need the page's forms and paths.
const PAGE_ISLANDS = new Set(['TwoDoorsLanding']);

// GRE-3778: SVG presentation attributes (stroke-width, stop-color…) take React's camelCase names.
const reactName = (name) => REACT_NAMES[name]
  || (name.includes('-') && !/^(data|aria)-/.test(name) ? name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()) : name);

function reactProps(attributes) {
  return Object.fromEntries(Object.entries(attributes).map(([name, value]) => [reactName(name), BOOLEANS.has(name) ? true : value]));
}

function toReact(nodes, context, path = 'n') {
  return nodes.map((node, index) => {
    const key = `${path}.${index}`;
    if (node.type === 'text') return node.value;
    if (node.type === 'island') {
      const island = ISLANDS[node.name];
      const rendered = islandElement(node, island, context, key);
      // GSAM live design: mark what an island renders, so the editor's Pick can say it is built in code
      // (locked) instead of offering a removal that could never save. display: contents keeps the layout.
      return context.markIslands && !context.placeholders
        ? createElement('div', { key, 'data-gs-island': node.name, 'data-gs-island-label': island.label, style: { display: 'contents' } }, rendered)
        : rendered;
    }
    return createElement(node.tag, { key, ...reactProps(node.attributes) }, node.children.length ? toReact(node.children, context, key) : undefined);
  });
}

function islandElement(node, island, context, key) {
  // GRE-3777: the placeholder view shows the tag as GSAM live design does, with islandPlaceholderCss.
  if (context.placeholders) return createElement('gs-island', { key, name: node.name, ...node.attributes });
  if (island.component) return createElement(COMPONENTS[island.component],
    { key, ...node.props, ...(RELEASE_ISLANDS.has(island.component) ? { release: context.release } : {}),
      ...(PAGE_ISLANDS.has(island.component) ? { forms: context.forms, pagePaths: context.pagePaths } : {}),
      ...(island.component === 'SiteSearch' ? { links: context.searchLinks ||= searchLinks(context.release) } : {}) });
  // GRE-3778: a block island exported from a Puck page (forms; GRE-3789 the catalogue) keeps its published props (`data-block`, frozen at export).
  const { blockId, ...props } = node.props;
  const frozen = blockId && Object.hasOwn(formBlocks, blockId) ? formBlocks[blockId] : {};
  return <IslandBlock key={key} type={island.block} props={{ ...frozen, ...props, id: `island-${key.replace(/\./g, '-')}` }}
    pageSlug={context.pageSlug} forms={context.forms} pagePaths={context.pagePaths} />;
}

function region(document, scope, context) {
  const { nodes, removed } = sanitiseHtml(document?.html, { media: context.media });
  const css = sanitiseCss(document?.css, { scope, media: context.media });
  context.removed.push(...removed.map((item) => `${scope}: ${item}`), ...css.removed.map((item) => `${scope}: ${item}`));
  return { children: toReact(nodes, context, scope), css: css.css };
}

export default function HtmlPage({ page, release, placeholders = false, markIslands = false }) {
  const context = { media: release.media, forms: release.collections?.forms, pageSlug: page.slug,
    pagePaths: release.pages.map((item) => item.path), removed: [], release, placeholders, markIslands };
  const site = sanitiseCss(release.stylesheet, { media: release.media, fontFace: true });
  context.removed.push(...site.removed.map((item) => `stylesheet: ${item}`));
  const chrome = Object.fromEntries(CHROME_KEYS.map((key) => [key, region(release.chrome?.[key], key, context)]));
  const body = region(page, 'page', context);
  if (context.removed.length) console.warn(`[html-page] release ${release.release.number} ${page.path}: removed ${context.removed.join(', ')}`);
  const css = [site.css, placeholders ? islandPlaceholderCss() : '', ...CHROME_KEYS.map((key) => chrome[key].css), body.css].filter(Boolean).join('\n');
  // GRE-3789: FAQ structured data comes from page SEO (plain text, escaped by ldScript).
  const faq = page.seo?.faq?.length ? ldScript({ '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: page.seo.faq.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }) : '';
  return <>
    {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
    {faq && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faq }} />}
    <Region scope="header">{chrome.header.children}</Region>
    <Region scope="nav">{chrome.nav.children}</Region>
    {/* GSAM edits a page as <main id="gs-page">, so the page agent writes its CSS as `#gs-page …`. This wrapper
        makes those selectors match here too; without it every agent layout (a carousel row) fell back to stacking. */}
    <Region scope="page" as="main" attributes={{ 'data-org-id': release.orgId, 'data-release': release.release.number }}><div id="gs-page" style={{ display: 'contents' }}>{body.children}</div></Region>
    <Region scope="footer">{chrome.footer.children}</Region>
    {!placeholders && <HtmlBehaviours path={page.path} title={page.title} />}
  </>;
}
