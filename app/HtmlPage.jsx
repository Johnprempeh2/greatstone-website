// GRE-3776: the renderer for schema 2 releases. A page is HTML inside the shared chrome (header, nav and
// footer are HTML documents too) with one site stylesheet. Every document is sanitised here, at render
// time, and becomes React elements; no HTML string reaches the browser unescaped.
import { createElement } from 'react';
import { sanitiseHtml } from '../next-proof/html-sanitiser.mjs';
import { sanitiseCss } from '../next-proof/css-sanitiser.mjs';
import { ISLANDS } from '../next-proof/islands.mjs';
import { CHROME_KEYS } from '../next-proof/gsam-release.mjs';
import { IslandBlock } from './ProofBlocks.jsx';
import { CookieSettings } from './ConsentAnalytics.jsx';
import TwoDoorsLanding from './TwoDoorsLanding.jsx';

const REACT_NAMES = { class: 'className', colspan: 'colSpan', rowspan: 'rowSpan', srcset: 'srcSet', datetime: 'dateTime', hreflang: 'hrefLang' };
const BOOLEANS = new Set(['hidden', 'open', 'reversed']);
const COMPONENTS = { CookieSettings, TwoDoorsLanding };

function reactProps(attributes) {
  return Object.fromEntries(Object.entries(attributes).map(([name, value]) => [REACT_NAMES[name] || name, BOOLEANS.has(name) ? true : value]));
}

function toReact(nodes, context, path = 'n') {
  return nodes.map((node, index) => {
    const key = `${path}.${index}`;
    if (node.type === 'text') return node.value;
    if (node.type === 'island') {
      const island = ISLANDS[node.name];
      if (island.component) return createElement(COMPONENTS[island.component], { key, forms: context.forms, pagePaths: context.pagePaths });
      return <IslandBlock key={key} type={island.block} props={{ ...node.props, id: `island-${key.replace(/\./g, '-')}` }}
        pageSlug={context.pageSlug} forms={context.forms} pagePaths={context.pagePaths} />;
    }
    return createElement(node.tag, { key, ...reactProps(node.attributes) }, node.children.length ? toReact(node.children, context, key) : undefined);
  });
}

function region(document, scope, context) {
  const { nodes, removed } = sanitiseHtml(document?.html, { media: context.media });
  const css = sanitiseCss(document?.css, { scope, media: context.media });
  context.removed.push(...removed.map((item) => `${scope}: ${item}`), ...css.removed.map((item) => `${scope}: ${item}`));
  return { children: toReact(nodes, context, scope), css: css.css };
}

export default function HtmlPage({ page, release }) {
  const context = { media: release.media, forms: release.collections?.forms, pageSlug: page.slug,
    pagePaths: release.pages.map((item) => item.path), removed: [] };
  const site = sanitiseCss(release.stylesheet, { media: release.media, fontFace: true });
  context.removed.push(...site.removed.map((item) => `stylesheet: ${item}`));
  const chrome = Object.fromEntries(CHROME_KEYS.map((key) => [key, region(release.chrome?.[key], key, context)]));
  const body = region(page, 'page', context);
  if (context.removed.length) console.warn(`[html-page] release ${release.release.number} ${page.path}: removed ${context.removed.join(', ')}`);
  const css = [site.css, ...CHROME_KEYS.map((key) => chrome[key].css), body.css].filter(Boolean).join('\n');
  return <>
    {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
    <div data-gs-scope="header">{chrome.header.children}</div>
    <div data-gs-scope="nav">{chrome.nav.children}</div>
    <main data-gs-scope="page" data-org-id={release.orgId} data-release={release.release.number}>{body.children}</main>
    <div data-gs-scope="footer">{chrome.footer.children}</div>
  </>;
}
