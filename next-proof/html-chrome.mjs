// GRE-3862 (switch S4): the studio header and footer (src/Header.jsx, src/Footer.jsx, put in the Next shell
// by GRE-3715) as schema 2 chrome. The exporter takes them from the engine's server render, where the
// menus are closed and the header knows the page it is on, and makes one HTML document of each that
// every page shares:
//
// - Header: the page marks go (`aria-current`, `is-active`, `td-header`); the header behaviour
//   (app/header-behaviour.mjs) sets them for the page in the browser. Each dropdown, the "More" menu and
//   the phone menu are written out, hidden, from the navigation model the Header uses
//   (src/lib/nav-model.mjs); the behaviour opens them and decides which links fit the bar. The CTA
//   becomes a link to the booking page; sign-in and search become islands.
// - Footer: its inline <style> moves to the footer CSS, SVG paint given as `var()` (which the sanitiser
//   refuses in an attribute) moves to a class, and cookie settings becomes an island.
import { createHash } from 'node:crypto';
import { BOOK_PAGE, buildNavModel, headerLeaves } from '../src/lib/nav-model.mjs';

const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 10);

// The pages whose header takes the Two Doors look (`td-header`) and names no page in the phone menu.
export const TD_PATHS = ['/', '/dev-tools'];
// A hidden part stays hidden even where the header's CSS gives it a display (the menus are flex).
// The CTA is a link now: no underline and a button's line height. Its display stays the site's, which
// hides it on phones; where a touch screen gives it a 44px height, its label stays centred.
export const HEADER_CSS = ['.gs-header [hidden]{display:none !important}', '.gs-header a.gs-btn{text-decoration:none;line-height:normal}',
  '@media (pointer:coarse) and (min-width:761px){.gs-header a.gs-book{display:inline-flex;align-items:center}}'].join('\n');

function element(document, tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) if (value !== undefined && value !== null && value !== false) node.setAttribute(name, value === true ? '' : value);
  node.append(...children);
  return node;
}

// One menu link, as the Header writes it: page and web links with their label and optional subtext.
function menuLink(document, item, hrefFor, className, attributes = {}) {
  if (item.kind === 'shop') return element(document, 'a', { role: 'menuitem', class: className, href: item.href, ...attributes }, [item.label]);
  const label = element(document, 'span', {}, [item.label, ...(item.subtext ? [element(document, 'small', {}, [item.subtext])] : [])]);
  const external = item.kind === 'url' && item.newTab;
  return element(document, 'a', { role: 'menuitem', class: className, href: item.kind === 'url' ? item.href : hrefFor(item.slug),
    ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {}), ...attributes }, [label]);
}

function pop(document, { id, label, labelledBy, className = 'gs-navmenu-pop gs-navgroup-pop' }, items) {
  return element(document, 'div', { class: className, role: 'menu', id, ...(labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': label }), hidden: true }, items);
}

// `site` is the chrome data the Next shell passes the Header (app/site-chrome.mjs): order, pages, paths,
// navigation and settings.
export function exportHeader(document, site) {
  const source = document.querySelector('header.gs-header');
  if (!source) return null;
  const header = source.cloneNode(true);
  const hrefFor = (slug) => site.paths[slug] || '/';
  const navModel = buildNavModel(site.navigation, site.order, site.pages, false, '', { kind: 'shop', label: 'Products', href: '/shop' });
  const { leaves, pinnedMore } = headerLeaves(navModel);
  const bookLabel = header.querySelector('.gs-book')?.textContent || '';

  header.classList.remove('td-header');
  header.setAttribute('data-behaviour', 'site-header');
  header.setAttribute('data-td-paths', TD_PATHS.join(' '));
  for (const node of header.querySelectorAll('[aria-current]')) node.removeAttribute('aria-current');
  for (const node of header.querySelectorAll('.is-active')) node.classList.remove('is-active');

  const nav = header.querySelector('nav.gs-nav');
  const chevron = header.querySelector('.gs-navgroup-btn svg');
  if (!nav || !chevron || nav.children.length !== leaves.length) throw new Error(`header: the bar holds ${nav?.children.length} items, the navigation ${leaves.length}`);
  // The bar: every item is numbered, so the behaviour can move the ones that do not fit into "More".
  [...nav.children].forEach((item, index) => {
    item.setAttribute('data-leaf', String(index));
    const leaf = leaves[index];
    if (leaf.kind !== 'group') return;
    const button = item.querySelector('button');
    const id = `navgroup-${index}`;
    button.setAttribute('aria-controls', id);
    item.append(pop(document, { id, label: leaf.label }, leaf.members.map((member) => menuLink(document, member, hrefFor, 'gs-navmenu-item'))));
  });
  // "More": one entry per link the bar could move into it (a group gives its members), plus the pinned ones.
  const moreItems = [
    ...leaves.flatMap((leaf, index) => (leaf.kind === 'group' ? leaf.members : [leaf]).map((member) => menuLink(document, member, hrefFor, 'gs-navmenu-item', { 'data-leaf': String(index), hidden: true }))),
    ...pinnedMore.map((member) => menuLink(document, member, hrefFor, 'gs-navmenu-item', { 'data-leaf': 'pin' })),
  ];
  nav.append(element(document, 'div', { class: 'gs-navgroup', 'data-more': true, hidden: true }, [
    element(document, 'button', { type: 'button', class: 'gs-navlink gs-navgroup-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'navgroup-more' }, ['More', chevron.cloneNode(true)]),
    pop(document, { id: 'navgroup-more', label: 'More' }, moreItems),
  ]));
  // The phone menu: the whole tree, grouped, then the booking link. Its label names the page in the browser.
  const sections = navModel.map((item) => (item.kind === 'group'
    ? element(document, 'div', { class: 'gs-navmenu-section', role: 'presentation' }, [
      element(document, 'span', { class: 'gs-navmenu-grouplabel', 'aria-hidden': 'true' }, [item.label]),
      ...item.members.map((member) => menuLink(document, member, hrefFor, 'gs-navmenu-item is-sub'))])
    : menuLink(document, item, hrefFor, 'gs-navmenu-item')));
  nav.after(element(document, 'nav', { class: 'gs-navmenu', 'aria-label': 'Primary', hidden: true }, [
    element(document, 'button', { type: 'button', id: 'navmenu-btn', class: 'gs-navmenu-btn', 'aria-expanded': 'false', 'aria-haspopup': 'menu', 'aria-controls': 'navmenu-pop', 'aria-label': 'Open navigation' },
      [element(document, 'span', { 'data-menu-label': true }, ['Menu']), chevron.cloneNode(true)]),
    pop(document, { id: 'navmenu-pop', labelledBy: 'navmenu-btn', className: 'gs-navmenu-pop' },
      [...sections, element(document, 'a', { role: 'menuitem', class: 'gs-navmenu-item gs-navmenu-book', href: hrefFor(BOOK_PAGE), 'data-cta': 'menu' }, [bookLabel])]),
  ]));

  // The tools: the CTA is a link to the booking page; sign-in and search run as islands.
  header.querySelector('.gs-book')?.replaceWith(element(document, 'a', { class: 'gs-btn primary gs-book', href: hrefFor(BOOK_PAGE), 'data-cta': 'header' }, [bookLabel]));
  header.querySelector('.gs-accountbtn')?.replaceWith(element(document, 'gs-island', { name: 'account-entry', 'data-style': 'header' }));
  header.querySelector('.gs-cmdbtn')?.replaceWith(element(document, 'gs-island', { name: 'site-search' }));
  return { html: header.outerHTML.replace(/<!-- -->/g, ''), css: HEADER_CSS };
}

// SVG paint attributes the sanitiser refuses (a CSS variable) become a class with the same paint.
const PAINT_ATTRIBUTES = ['fill', 'stroke', 'stop-color'];
export function svgPaintToClasses(root) {
  const rules = new Map();
  for (const node of root.querySelectorAll('svg, svg *')) {
    const declarations = PAINT_ATTRIBUTES.filter((name) => /^var\(--[a-zA-Z0-9_-]+\)$/.test(node.getAttribute(name) || ''))
      .map((name) => { const value = node.getAttribute(name); node.removeAttribute(name); return `${name}:${value}`; });
    if (!declarations.length) continue;
    const body = declarations.join(';');
    const name = `p-${hash(body)}`;
    rules.set(name, `.${name}{${body}}`);
    node.classList.add(name);
  }
  return [...rules.values()];
}

export function exportFooter(document) {
  const source = document.querySelector('footer.site-footer');
  if (!source) return null;
  const footer = source.cloneNode(true);
  const css = [...footer.querySelectorAll('style')].map((style) => { const text = style.textContent; style.remove(); return text; });
  css.push(...svgPaintToClasses(footer));
  // Cookie settings reopens the consent banner; the island shows only where analytics is configured.
  const cookie = element(document, 'gs-island', { name: 'cookie-settings' });
  const existing = footer.querySelector('.foot-cookie-settings');
  if (existing) existing.replaceWith(cookie);
  else {
    let legal = footer.querySelector('nav.foot-legal');
    if (!legal) {
      legal = element(document, 'nav', { class: 'foot-legal', 'aria-label': 'Legal' });
      const notice = footer.querySelector('.legal');
      if (notice) notice.before(legal); else footer.append(legal);
    }
    legal.append(cookie);
  }
  return { html: footer.outerHTML.replace(/<!-- -->/g, ''), css: css.join('\n') };
}
