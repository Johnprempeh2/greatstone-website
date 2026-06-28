import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { STAGE_OPTIONS } from './stage-presets.js';
import { Search } from './blocks/icons.jsx';
import { ROLE_LABEL } from './cms/staffRoles.mjs';
import { track } from './lib/analytics.js';
import { safeHref } from './lib/safe-url.js';

const LOGO = '/assets/greatstone-logo-web.png';
// the view-mode 3D switcher flips to its light-surface variant when a light scene (tide family) sits
// behind the header, so the control stays legible over a bright background
const LIGHT_KINDS = new Set(['tide', 'tideRadial', 'tideCalm']);
const firstSceneKind = (bg) => {
  if (bg && typeof bg === 'object' && Array.isArray(bg.scenes)) return bg.scenes[0] && bg.scenes[0].kind;
  const opt = STAGE_OPTIONS.find((o) => o.id === bg);
  return opt && opt.scenes && opt.scenes[0];
};
const Chevron = (p) => (<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...p}><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>);
const UserIcon = (p) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}><circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.8" /><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>);

// The persistent "Book a Diagnostic" CTA lands the visitor on the booking page (slug BOOK_PAGE).
const BOOK_PAGE = 'contact';

// Resolve one CMS navigation item into a render model node, or null to drop it. A page item is dropped
// for the public when its page is unpublished or missing; an editor sees all. label blank on a page item
// falls back to the page's own title. Groups resolve their children the same way and drop if empty.
function resolveNavItem(item, pages, canEdit) {
  if (!item || item.visible === false) return null;
  if (item.type === 'group') {
    const members = (item.children || []).map((c) => resolveNavItem(c, pages, canEdit)).filter(Boolean);
    if (!members.length) return null;
    return { kind: 'group', label: item.label || 'More', members };
  }
  if (item.type === 'link') {
    if (!item.href) return null;
    return { kind: 'url', href: item.href, label: item.label || item.href, newTab: !!item.newTab };
  }
  // default: a page link
  const slug = item.pageSlug;
  const p = slug && pages[slug];
  if (!p) return null;
  if (!canEdit && !(p.status === 'published' || p.published)) return null;
  return { kind: 'page', slug, label: item.label || p.title || slug };
}

// Build the header nav render model from the CMS navigation tree. Falls back to a flat list of pages
// (in page order) if the tree is empty, so the bar is never blank. When searching (q) we flatten the
// groups and filter by label so every match surfaces.
function buildNavModel(navigation, order, pages, canEdit, q) {
  let nav = navigation;
  if (!Array.isArray(nav) || !nav.length) nav = (order || []).map((slug) => ({ type: 'page', pageSlug: slug }));
  const items = nav.map((i) => resolveNavItem(i, pages, canEdit)).filter(Boolean);
  if (!q) return items;
  const flat = [];
  items.forEach((it) => { if (it.kind === 'group') flat.push(...it.members); else flat.push(it); });
  return flat.filter((it) => (it.label || '').toLowerCase().includes(q));
}

// render a single page/url leaf as an inline nav link (page = SPA navigate; url = anchor, internal
// '#…' hrefs are caught by App's global click handler, external opens per newTab)
function NavLeaf({ item, current, shopActive, onNavigate, className }) {
  if (item.kind === 'url') {
    return <a className={className} href={safeHref(item.href)} target={item.newTab ? '_blank' : undefined} rel={item.newTab ? 'noopener noreferrer' : undefined}>{item.label}</a>;
  }
  const active = item.slug === current && !shopActive;
  return <button aria-current={active ? 'page' : undefined} className={className + (active ? ' is-active' : '')} onClick={() => onNavigate(item.slug)}>{item.label}</button>;
}

// An inline nav dropdown (desktop). Opens on hover and on click/Enter; full menu-button keyboard pattern
// (ArrowDown opens + enters the menu, roving Up/Down/Home/End, Escape closes + restores focus, outside
// click closes). Highlights itself when the current page is one of its members.
function NavGroup({ label, members, current, shopActive, onNavigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const active = members.some((m) => m.kind === 'page' && m.slug === current) && !shopActive;

  // Hover intent: open immediately, but close on a short grace delay that is cancelled the moment the
  // cursor re-enters the group (button OR menu). This is what stops the menu vanishing while the cursor
  // travels across the gap between the button and the popover — far more robust than a CSS hover bridge,
  // and it also tolerates the open animation, diagonal paths and fast cursors. Touch/click + keyboard are
  // unaffected (they toggle `open` directly). The timer is always cleared on unmount.
  const closeTimer = useRef(null);
  const cancelClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const openNow = () => { cancelClose(); setOpen(true); };
  const scheduleClose = () => { cancelClose(); closeTimer.current = setTimeout(() => setOpen(false), 220); };
  useEffect(() => () => cancelClose(), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!ref.current || !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); if (btnRef.current) btnRef.current.focus(); } };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  useEffect(() => {
    if (!open || !popRef.current) return;
    const items = popRef.current.querySelectorAll('.gs-navmenu-item');
    const activeEl = popRef.current.querySelector('.gs-navmenu-item.is-active');
    const t = setTimeout(() => (activeEl || items[0]) && (activeEl || items[0]).focus(), 20);
    return () => clearTimeout(t);
  }, [open]);

  const onMenuKey = (e) => {
    const items = popRef.current ? Array.from(popRef.current.querySelectorAll('.gs-navmenu-item')) : [];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
  };

  return (
    <div className="gs-navgroup" ref={ref} onMouseEnter={openNow} onMouseLeave={scheduleClose}>
      <button ref={btnRef} className={'gs-navlink gs-navgroup-btn' + (active ? ' is-active' : '')}
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } }}>
        {label}<Chevron />
      </button>
      {open && (
        <div className="gs-navmenu-pop gs-navgroup-pop" role="menu" aria-label={label} ref={popRef} onKeyDown={onMenuKey}>
          {members.map((m, i) => (
            <NavLeaf key={m.slug || m.href || i} item={m} current={current} shopActive={shopActive} className="gs-navmenu-item"
              onNavigate={(slug) => { onNavigate(slug); setOpen(false); }} />
          ))}
        </div>
      )}
    </div>
  );
}

// Site chrome (view mode). The page links sit inline while they fit; when they don't, they
// collapse into a single dropdown (measured, not breakpoint-guessed). Editing affordances appear
// only for a signed-in user with edit rights.
export default function Header({ order, pages, navigation, current, query, onSearch, onNavigate, onNewPage, onShop, shopActive, onAccount, accountActive, onEdit, bg, onSetBg, onCommand, user, canEdit, onSignOut, logo, ctaLabel, siteName }) {
  // global chrome from Site-Settings (fall back to the build-time defaults if a prop is missing)
  const logoSrc = logo || LOGO;
  const bookLabel = ctaLabel || 'Book a Diagnostic';
  const brandName = siteName || 'Greatstone International';
  const q = (query || '').trim().toLowerCase();
  // nav is driven by the editable CMS navigation tree (state.navigation); public sees only published
  // pages, editors see everything, and a blank tree falls back to page order so the bar is never empty.
  const navModel = buildNavModel(navigation, order, pages, canEdit, q);
  // the persistent CTA lands on the Contact / booking page (form + one-click Calendly) instead of
  // jumping straight to Calendly. Keep the GA4 value (book_deep_dive) stable so history doesn't fragment.
  const goBook = (where) => { track('cta_click', { cta: 'book_deep_dive', cta_location: where }); onNavigate(BOOK_PAGE); };
  // the collapsed toggle should name the user's ACTUAL location, including the Products/account routes
  const menuLabel = shopActive ? 'Products' : accountActive ? 'Your account' : (pages[current] && pages[current].title) || 'Menu';

  const wrapRef = useRef(null);
  const neededRef = useRef(0);
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // collapse the inline nav into a dropdown when the links overflow the row
  useLayoutEffect(() => {
    const wrap = wrapRef.current; if (!wrap) return;
    const measure = () => {
      if (!collapsed) neededRef.current = wrap.scrollWidth; // intrinsic links width, cached while inline
      // collapse when the inline links overflow OR the viewport is in the mobile band (<=760px, where
      // studio.css hides the persistent .gs-book CTA), so the dropdown's booking item stays reachable.
      const narrow = typeof matchMedia !== 'undefined' && matchMedia('(max-width:760px)').matches;
      const next = narrow || neededRef.current > wrap.clientWidth + 1;
      setCollapsed((c) => (c !== next ? next : c));
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(wrap);
    return () => ro.disconnect();
  }, [collapsed, navModel.length, q]);

  const menuBtnRef = useRef(null);
  const menuPopRef = useRef(null);

  // close the dropdown on outside click / Escape; Escape returns focus to the toggle (menu-button pattern)
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => { if (!e.target.closest || !e.target.closest('.gs-navmenu')) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setMenuOpen(false); if (menuBtnRef.current) menuBtnRef.current.focus(); } };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  // when the menu opens, move focus to the active item (or the first) so arrow keys take over
  useEffect(() => {
    if (!menuOpen || !menuPopRef.current) return;
    const items = menuPopRef.current.querySelectorAll('.gs-navmenu-item');
    if (!items.length) return;
    const active = menuPopRef.current.querySelector('.gs-navmenu-item.is-active');
    const t = setTimeout(() => (active || items[0]).focus(), 20);
    return () => clearTimeout(t);
  }, [menuOpen]);

  // roving arrow-key navigation within the open menu (ARIA menu pattern)
  const onMenuKey = (e) => {
    const items = menuPopRef.current ? Array.from(menuPopRef.current.querySelectorAll('.gs-navmenu-item')) : [];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
  };
  const onMenuBtnKey = (e) => { if (e.key === 'ArrowDown' && !menuOpen) { e.preventDefault(); setMenuOpen(true); } };

  // render a leaf inside the collapsed menu (page = menuitem button; url = menuitem anchor)
  const menuLeaf = (m, sub) => m.kind === 'url' ? (
    <a key={m.href} role="menuitem" className={'gs-navmenu-item' + (sub ? ' is-sub' : '')} href={safeHref(m.href)} target={m.newTab ? '_blank' : undefined} rel={m.newTab ? 'noopener noreferrer' : undefined} onClick={() => setMenuOpen(false)}>{m.label}</a>
  ) : (
    <button key={m.slug} role="menuitem" aria-current={m.slug === current && !shopActive ? 'page' : undefined} className={'gs-navmenu-item' + (sub ? ' is-sub' : '') + (m.slug === current && !shopActive ? ' is-active' : '')} onClick={() => { onNavigate(m.slug); setMenuOpen(false); }}>{m.label}</button>
  );

  return (
    <header className="gs-header">
      <a className="gs-logo" href="#" aria-label={brandName} onClick={(e) => { e.preventDefault(); onNavigate(order[0]); }}>
        <img src={logoSrc} alt={brandName} width="800" height="160" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      </a>

      <div className={'gs-navwrap' + (collapsed ? ' is-collapsed' : '')} ref={wrapRef}>
        {collapsed ? (
          <nav className="gs-navmenu" aria-label="Primary">
            <button ref={menuBtnRef} id="gs-navmenu-btn" className="gs-navmenu-btn" onClick={() => setMenuOpen((o) => !o)} onKeyDown={onMenuBtnKey} aria-expanded={menuOpen} aria-haspopup="menu" aria-controls="gs-navmenu-pop" aria-label="Open navigation">
              <span>{menuLabel}</span><Chevron />
            </button>
            {menuOpen && (
              <div className="gs-navmenu-pop" id="gs-navmenu-pop" role="menu" aria-labelledby="gs-navmenu-btn" ref={menuPopRef} onKeyDown={onMenuKey}>
                {navModel.map((it, i) => it.kind === 'group' ? (
                  <div key={'g' + i} className="gs-navmenu-section" role="presentation">
                    <span className="gs-navmenu-grouplabel" aria-hidden="true">{it.label}</span>
                    {it.members.map((m) => menuLeaf(m, true))}
                  </div>
                ) : menuLeaf(it, false))}
                {onShop && <button role="menuitem" aria-current={shopActive ? 'page' : undefined} className={'gs-navmenu-item' + (shopActive ? ' is-active' : '')} onClick={() => { onShop(); setMenuOpen(false); }}>Products</button>}
                <button role="menuitem" className="gs-navmenu-item gs-navmenu-book" onClick={() => { setMenuOpen(false); goBook('menu'); }}>{bookLabel}</button>
                {onAccount && <button role="menuitem" className={'gs-navmenu-item' + (accountActive ? ' is-active' : '')} onClick={() => { onAccount(); setMenuOpen(false); }}>Your account</button>}
                {navModel.length === 0 && <span className="gs-navmenu-empty">no pages match “{query}”</span>}
              </div>
            )}
          </nav>
        ) : (
          <nav className="gs-nav" aria-label="Primary">
            {navModel.map((it, i) => it.kind === 'group' ? (
              <NavGroup key={'g' + i} label={it.label} members={it.members} current={current} shopActive={shopActive} onNavigate={onNavigate} />
            ) : (
              <NavLeaf key={it.slug || it.href || i} item={it} current={current} shopActive={shopActive} onNavigate={onNavigate} className="gs-navlink" />
            ))}
            {onShop && <button aria-current={shopActive ? 'page' : undefined} className={'gs-navlink' + (shopActive ? ' is-active' : '')} onClick={onShop}>Products</button>}
            {navModel.length === 0 && <span className="gs-nomatch">no pages match “{query}”</span>}
          </nav>
        )}
      </div>

      <div className="gs-tools">
        {/* persistent, always-visible primary CTA + account icon (Ben's 18 Jun review). The CTA navigates
            to the Contact / booking page rather than opening Calendly directly. */}
        <button className="gs-btn primary gs-book" onClick={() => goBook('header')}>{bookLabel}</button>
        {onAccount && (
          <button className={'gs-accountbtn' + (accountActive ? ' is-active' : '')} onClick={onAccount} aria-label="Your account" aria-current={accountActive ? 'page' : undefined} title="Your account">
            <UserIcon />
          </button>
        )}
        {/* the inline page-search input was redundant with the ⌘K command palette; removing it frees the
            row so the nav stays inline on desktop. ⌘K remains the search affordance. */}
        <button className="gs-cmdbtn" onClick={onCommand} title="Command palette (⌘K)" aria-label="Search and commands">
          <Search /><kbd>⌘K</kbd>
        </button>

        {user ? (
          <>
            {canEdit && (
              <>
                <label className={'gs-bg' + (LIGHT_KINDS.has(firstSceneKind(bg)) ? ' dark' : '')}>
                  <span>3D</span>
                  {/* bg can be a preset id (string) or a per-page custom scene track (object). A raw
                      object value would stringify to "[object Object]", match no option and blank the
                      control, so show a disabled "Custom" state instead; picking any preset overrides it. */}
                  <select value={typeof bg === 'string' ? bg : '__custom'} onChange={(e) => onSetBg(e.target.value)}>
                    {typeof bg !== 'string' && <option value="__custom" disabled>Custom (scene track)</option>}
                    {STAGE_OPTIONS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                  </select>
                </label>
                <button className="gs-btn ghost" onClick={onNewPage}>+ New page</button>
                <button className="gs-btn primary" onClick={onEdit}>Edit page</button>
              </>
            )}
            <span className="gs-userchip" title={user.email}><span style={{ display: 'inline-block', maxWidth: '14ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>{user.name}</span> · {ROLE_LABEL[user.role] || user.role}</span>
            <button className="gs-signout" onClick={onSignOut} title="Sign out">Sign out</button>
          </>
        ) : null}
      </div>
    </header>
  );
}
