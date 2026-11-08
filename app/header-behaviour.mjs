// GRE-3862: the behaviour of the exported studio header (next-proof/html-chrome.mjs), the part
// src/Header.jsx did in React. Like the page behaviours (app/html-behaviours.mjs) it only toggles
// attributes, classes and the phone menu's label on markup the header already holds: no fetch, no HTML.
//
// - Marks the page: `aria-current` and `is-active` on its links, `is-active` on a dropdown holding it,
//   and `td-header` on the pages listed in `data-td-paths`.
// - Fits the bar: the links that do not fit move into "More" (the hidden row `.gs-nav-measure` gives each
//   label's width); under 761px, or with fewer than three in the bar, the phone menu replaces the bar.
// - Opens the menus: hover with a short grace delay, click, ArrowDown; arrow keys, Home and End move
//   through the items; Escape and an outside click close, and Escape returns focus to the button.
// - Counts the CTA clicks (`data-cta`) as the Header did: cta_click, book_deep_dive, and where.
const MIN_INLINE = 3;
const CLOSE_DELAY = 220;
const ITEM = '.gs-navmenu-item';

const urlOf = (href, win) => { try { return new win.URL(href, win.location.href); } catch { return null; } };

function markPage(header, path, win) {
  const td = (header.getAttribute('data-td-paths') || '').split(/\s+/).filter(Boolean);
  header.classList.toggle('td-header', td.includes(path));
  for (const link of header.querySelectorAll('.gs-nav a[href], .gs-navmenu a[href]')) {
    const url = urlOf(link.getAttribute('href'), win);
    // A page link is current on its page; a link to a part of the page (`#…`) is not, but it still marks its dropdown.
    link.toggleAttribute('data-here', url?.pathname === path);
    const current = !link.matches('[data-cta]') && url?.pathname === path && !url.hash;
    link.classList.toggle('is-active', current);
    if (current) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  return td.includes(path);
}

// A dropdown is marked when it holds a link to this page; "More" only for the links it shows.
function markGroups(header) {
  for (const group of header.querySelectorAll('.gs-nav .gs-navgroup')) {
    group.querySelector('.gs-navgroup-btn')?.classList.toggle('is-active', Boolean(group.querySelector('a[data-here]:not([hidden])')));
  }
}

// One menu button and the menu it controls (`aria-controls`).
function menu(button, win, { hover = null } = {}) {
  const document = button.ownerDocument;
  const list = document.getElementById(button.getAttribute('aria-controls'));
  if (!list) return null;
  const items = () => [...list.querySelectorAll(ITEM)].filter((item) => !item.hidden);
  let timer = null;
  const cancel = () => { if (timer) { win.clearTimeout(timer); timer = null; } };
  const isOpen = () => button.getAttribute('aria-expanded') === 'true';
  const set = (open, { focus = false } = {}) => {
    cancel();
    button.setAttribute('aria-expanded', String(open));
    list.hidden = !open;
    if (open && focus) win.setTimeout(() => (list.querySelector(`${ITEM}.is-active:not([hidden])`) || items()[0])?.focus(), 20);
  };
  const onButton = (event) => {
    if (event.type === 'click') set(hover ? true : !isOpen(), { focus: true });
    else if (event.key === 'ArrowDown') { event.preventDefault(); set(true, { focus: true }); }
  };
  const onList = (event) => {
    if (event.type === 'click') { if (event.target.closest?.('a')) set(false); return; }
    const all = items();
    if (!all.length) return;
    const index = all.indexOf(document.activeElement);
    const next = { ArrowDown: (index + 1) % all.length, ArrowUp: (index - 1 + all.length) % all.length, Home: 0, End: all.length - 1 }[event.key];
    if (next !== undefined) { event.preventDefault(); all[next].focus(); }
  };
  const onDocument = (event) => {
    if (!isOpen()) return;
    if (event.type === 'keydown') { if (event.key === 'Escape') { set(false); button.focus(); } return; }
    if (!(hover || button.parentElement).contains(event.target)) set(false);
  };
  const enter = () => { cancel(); if (!isOpen()) set(true); };
  const leave = () => { cancel(); timer = win.setTimeout(() => set(false), CLOSE_DELAY); };
  button.addEventListener('click', onButton); button.addEventListener('keydown', onButton);
  list.addEventListener('click', onList); list.addEventListener('keydown', onList);
  document.addEventListener('mousedown', onDocument); document.addEventListener('keydown', onDocument);
  hover?.addEventListener('mouseenter', enter); hover?.addEventListener('mouseleave', leave);
  return () => {
    cancel();
    button.removeEventListener('click', onButton); button.removeEventListener('keydown', onButton);
    list.removeEventListener('click', onList); list.removeEventListener('keydown', onList);
    document.removeEventListener('mousedown', onDocument); document.removeEventListener('keydown', onDocument);
    hover?.removeEventListener('mouseenter', enter); hover?.removeEventListener('mouseleave', leave);
  };
}

// How many of the bar's links fit beside "More", and whether the phone menu replaces the bar. The same
// sums as src/Header.jsx.
export function fitBar({ widths, moreWidth, gap, available, pinned, narrow }) {
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, widths.length - 1);
  let fit = widths.length;
  if (pinned || total > available + 1) {
    let used = moreWidth; fit = 0;
    while (fit < widths.length && used + gap + widths[fit] <= available + 1) { used += gap + widths[fit]; fit++; }
  }
  return { fit, collapsed: narrow || fit < Math.min(MIN_INLINE, widths.length) };
}

function layout(header, win) {
  const wrap = header.querySelector('.gs-navwrap');
  const row = header.querySelector('.gs-nav-measure');
  const bar = header.querySelector('nav.gs-nav');
  const phone = header.querySelector('nav.gs-navmenu');
  const more = bar?.querySelector('[data-more]');
  if (!wrap || !row || !bar || !phone || !more) return null;
  const measure = () => {
    const spans = [...row.children];
    // Rects are zoomed (the wide-screen landing zooms the page, 8 Nov); clientWidth is not, so unzoom them.
    const width = (span) => span.getBoundingClientRect().width / (span.currentCSSZoom || 1);
    const widths = spans.slice(0, -1).map(width);
    const pinned = more.querySelector('[data-leaf="pin"]') !== null;
    const { fit, collapsed } = fitBar({ widths, moreWidth: spans.at(-1) ? width(spans.at(-1)) : 0,
      gap: parseFloat(win.getComputedStyle(row).columnGap) || 0, available: wrap.clientWidth, pinned,
      narrow: Boolean(win.matchMedia?.('(max-width:760px)').matches) });
    wrap.classList.toggle('is-collapsed', collapsed);
    bar.hidden = collapsed;
    phone.hidden = !collapsed;
    for (const item of bar.querySelectorAll(':scope > [data-leaf]')) item.hidden = Number(item.getAttribute('data-leaf')) >= fit;
    let moved = pinned;
    for (const item of more.querySelectorAll('[data-leaf]')) {
      const leaf = item.getAttribute('data-leaf');
      item.hidden = leaf !== 'pin' && Number(leaf) < fit;
      moved ||= !item.hidden;
    }
    more.hidden = !moved;
    markGroups(header);
  };
  measure();
  if (typeof win.ResizeObserver !== 'function') return null;
  // The row resizes too when the web font arrives, which changes every label's width.
  const observer = new win.ResizeObserver(measure);
  observer.observe(wrap); observer.observe(row);
  return () => observer.disconnect();
}

export function siteHeader(header, win, { path = win.location.pathname, title = '', track } = {}) {
  const plain = markPage(header, path, win);
  const label = header.querySelector('[data-menu-label]');
  if (label) label.textContent = plain || !title ? 'Menu' : title;
  const detach = [layout(header, win)];
  markGroups(header);
  for (const group of header.querySelectorAll('.gs-nav .gs-navgroup')) {
    const button = group.querySelector('.gs-navgroup-btn');
    if (button) detach.push(menu(button, win, { hover: group }));
  }
  const phoneButton = header.querySelector('.gs-navmenu-btn');
  if (phoneButton) detach.push(menu(phoneButton, win));
  const onClick = (event) => {
    const cta = event.target.closest?.('[data-cta]');
    if (cta && header.contains(cta)) track?.('cta_click', { cta: 'book_deep_dive', cta_location: cta.getAttribute('data-cta') });
  };
  header.addEventListener('click', onClick);
  return () => { header.removeEventListener('click', onClick); detach.forEach((stop) => stop?.()); };
}
