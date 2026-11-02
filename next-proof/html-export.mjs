// GRE-3778 (switch S4): the one-time export of today's Puck pages to schema 2 HTML pages.
// The engine renders each page once from its blocks; this module turns that server render into the
// `{ html, css }` documents GSAM keeps as revision 1 of each page, with the shared chrome and one site
// stylesheet. It runs once, at migration time; the site itself never calls it.
import { createHash } from 'node:crypto';
import { Window } from 'happy-dom';

// Blocks that need code to work become islands (next-proof/islands.mjs). `attributes` reads the island's
// data attributes from the block's published props.
export const BLOCK_ISLANDS = {
  BookDeepDive: { name: 'enquiry-form', attributes: (props) => ({ 'data-form': props.formKey }) },
  AiBaselineSurvey: { name: 'ai-baseline-survey', attributes: (props) => ({ 'data-form': props.formKey }) },
  AiCostCalculator: { name: 'ai-cost-calculator', attributes: (props) => ({ 'data-form': props.formKey }) },
};
// The frozen landing (Two Doors, v15) moves as it is: one island renders its published blocks unchanged.
export const FROZEN_LANDING = { path: '/', island: 'two-doors-landing' };
// Blocks whose controls need code that has no island yet (GRE-3777). They export as their still render.
export const NEEDS_ISLAND = new Set(['ServiceCatalog', 'Faq', 'IndustryPicker', 'Panels', 'Team', 'MaturityMap', 'Ladder', 'IntelBand']);

let parserWindow;
function parse(html) {
  parserWindow ||= new Window({ settings: {
    disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true,
    disableIframePageLoading: true, disableComputedStyleRendering: true,
  } });
  return new parserWindow.DOMParser().parseFromString(html, 'text/html');
}

// Comments go first: the CSS sanitiser refuses CSS containing `<`, and today's stylesheets only have
// it in comments. Strings are kept as they are.
export function stripCssComments(css) {
  let out = '';
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (char === '"' || char === "'") {
      const end = css.indexOf(char, i + 1);
      if (end === -1) return out + css.slice(i);
      out += css.slice(i, end + 1);
      i = end;
    } else if (char === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 1;
    } else out += char;
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 10);

// The sanitiser drops `style` attributes, so each one becomes a page class with the same declarations.
// `!important` keeps the precedence an inline style had over the site's class rules.
export function inlineStylesToClasses(root) {
  const rules = new Map();
  for (const element of root.querySelectorAll('[style]')) {
    const declarations = element.getAttribute('style').split(';').map((item) => item.trim()).filter(Boolean)
      .map((item) => (/!important$/i.test(item) ? item : `${item} !important`));
    element.removeAttribute('style');
    if (!declarations.length) continue;
    const body = declarations.join(';');
    const name = `s-${hash(body)}`;
    rules.set(name, `.${name}{${body}}`);
    element.classList.add(name);
  }
  return [...rules.values()].join('\n');
}

// React's generated ids (`:r1:`) and the engine's reserved prefixes fail the sanitiser's id rule, which
// would break the aria links between controls and panels. Each gets a stable page id, references too.
const SAFE_ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const RESERVED_ID = /^(gs-|__next|next-|_)/i;
const ID_REFERENCES = ['aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-owns', 'aria-activedescendant'];
export function renameUnsafeIds(root) {
  const renamed = new Map();
  for (const element of root.querySelectorAll('[id]')) {
    const id = element.id;
    if (SAFE_ID.test(id) && !RESERVED_ID.test(id)) continue;
    const name = `x-${hash(id)}`;
    renamed.set(id, name);
    element.id = name;
  }
  if (!renamed.size) return renamed;
  for (const element of root.querySelectorAll(ID_REFERENCES.map((name) => `[${name}]`).join(','))) {
    for (const name of ID_REFERENCES) {
      const value = element.getAttribute(name);
      if (value) element.setAttribute(name, value.split(/\s+/).map((id) => renamed.get(id) || id).join(' '));
    }
  }
  for (const link of root.querySelectorAll('a[href^="#"]')) {
    const target = renamed.get(decodeURIComponent(link.getAttribute('href').slice(1)));
    if (target) link.setAttribute('href', `#${target}`);
  }
  return renamed;
}

function island(document, name, attributes = {}) {
  const tag = document.createElement('gs-island');
  tag.setAttribute('name', name);
  for (const [key, value] of Object.entries(attributes)) if (value) tag.setAttribute(key, value);
  return tag;
}

// Engine-only attributes from the block renderer. `data-gs-*` belongs to the engine and the sanitiser
// drops it; the block anchor's `gs-blk-` id is reserved too.
function stripEngineAttributes(root) {
  for (const element of root.querySelectorAll('*')) {
    for (const { name } of [...element.attributes]) if (name.startsWith('data-gs-') || name.startsWith('data-motion-')) element.removeAttribute(name);
    if (element.id?.startsWith('gs-blk-')) element.removeAttribute('id');
  }
}

// Turns one server-rendered page (the full document from the engine) into its schema 2 parts.
// `page` is the baked release page (schema 1, with Puck data). Returns the page document, the block CSS
// found inline in the render (it goes into the site stylesheet), chrome and notes for the report.
export function exportRenderedPage(documentHtml, page) {
  const document = parse(documentHtml);
  const main = document.querySelector('main');
  if (!main) throw new Error(`${page.path}: the render has no <main>`);
  const notes = [];
  const blockCss = [...main.querySelectorAll('style')].map((style) => { const css = style.textContent; style.remove(); return css; });
  const content = main.querySelector('.gs-proof-content') || main;
  const blocks = new Map((page.data?.content || []).map((block) => [block.props.id, block]));

  if (page.path === FROZEN_LANDING.path) {
    content.replaceChildren(island(document, FROZEN_LANDING.island));
    notes.push(`frozen landing: ${(page.data?.content || []).map((block) => block.type).join(', ')} render through the ${FROZEN_LANDING.island} island`);
  } else {
    for (const anchor of [...content.querySelectorAll('[data-gs-block-type]')]) {
      const type = anchor.getAttribute('data-gs-block-type');
      const block = blocks.get(anchor.getAttribute('data-gs-block-id'));
      if (BLOCK_ISLANDS[type]) {
        anchor.replaceWith(island(document, BLOCK_ISLANDS[type].name, BLOCK_ISLANDS[type].attributes(block?.props || {})));
        notes.push(`${type} → island ${BLOCK_ISLANDS[type].name}`);
      } else if (NEEDS_ISLAND.has(type)) notes.push(`${type}: still render; its controls need an island (GRE-3777)`);
    }
  }
  stripEngineAttributes(content);
  renameUnsafeIds(content);
  const css = inlineStylesToClasses(content);
  const svgs = content.querySelectorAll('svg').length;
  if (svgs) notes.push(`${svgs} inline SVG (the sanitiser drops SVG)`);
  const html = content.innerHTML.replace(/<!-- -->/g, '').trim();

  const header = document.querySelector('header.proof-header');
  const footer = document.querySelector('footer.proof-footer');
  footer?.querySelector('nav')?.append(island(document, 'cookie-settings'));
  const chrome = {
    header: { html: header?.outerHTML || '', css: '' },
    nav: { html: '', css: '' },
    footer: { html: footer?.outerHTML || '', css: '' },
  };
  return { html, css, blockCss, chrome, notes };
}

// The GSAM release page (the S1 format) for one exported page.
export function releasePage(page, { html, css }, navigation) {
  const menuIndex = navigation.findIndex((item) => item.target?.pageId === page.id);
  return {
    id: page.id, slug: page.path, title: page.title, parentPageId: null,
    menu: menuIndex === -1 ? null : 'header', menuOrder: menuIndex === -1 ? null : menuIndex + 1, navOrder: page.navOrder ?? null,
    seo: { title: page.seo?.title || page.title, description: page.seo?.description || '', noindex: page.seo?.noindex || false },
    html, css,
  };
}
