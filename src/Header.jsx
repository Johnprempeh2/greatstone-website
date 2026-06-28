import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { STAGE_OPTIONS } from './stage-presets.js';
import { Search } from './blocks/icons.jsx';
import { ROLE_LABEL } from './cms/staffRoles.mjs';
import { publicNavOrder } from './lib/nav-order.js';
import { track } from './lib/analytics.js';

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

// Nav grouping (header bar only — the footer + ⌘K still list every page so nothing becomes unreachable).
// The four "who we are / how we work" pages collapse into one dropdown so the bar stays calm. NAV_HIDDEN
// drops pages whose job a more prominent control already does: the persistent "Book a Diagnostic" CTA is
// the Contact page, so a separate Contact link is a duplicate (the page stays reachable via the CTA, the
// footer and ⌘K). The booking page slug.
const BOOK_PAGE = 'contact';
const NAV_GROUPS = [{ label: 'Who We Are', slugs: ['about', 'method', 'climb', 'industries'] }];
const NAV_HIDDEN = new Set([BOOK_PAGE]);

// Build the ordered nav model from the visible page slugs: a flat list of {link} and {group} items.
// A group is emitted at the position of its first present member; the rest of its members are folded in.
// When the visitor is searching (q), we flatten (no groups) so every match surfaces.
function buildNavModel(slugs, q) {
  if (q) return slugs.filter((s) => !NAV_HIDDEN.has(s)).map((s) => ({ type: 'link', slug: s }));
  const groupFor = {};
  NAV_GROUPS.forEach((g) => g.slugs.forEach((s) => { groupFor[s] = g; }));
  const done = new Set();
  const model = [];
  for (const s of slugs) {
    if (NAV_HIDDEN.has(s)) continue;
    const g = groupFor[s];
    if (g) {
      if (done.has(g.label)) continue;
      done.add(g.label);
      const members = slugs.filter((m) => g.slugs.includes(m) && !NAV_HIDDEN.has(m));
      if (members.length) model.push({ type: 'group', group: g, members });
    } else {
      model.push({ type: 'link', slug: s });
    }
  }
  return model;
}

// An inline nav dropdown (desktop). Opens on hover and on click/Enter; full menu-button keyboard pattern
// (ArrowDown opens + enters the menu, roving Up/Down/Home/End, Escape closes + restores focus, outside
// click closes). Highlights itself when the current page is one of its members.
function NavGroup({ group, members, pages, current, onNavigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const active = members.includes(current);

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
    <div className="gs-navgroup" ref={ref} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button ref={btnRef} className={'gs-navlink gs-navgroup-btn' + (active ? ' is-active' : '')}
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } }}>
        {group.label}<Chevron />
      </button>
      {open && (
        <div className="gs-navmenu-pop gs-navgroup-pop" role="menu" aria-label={group.label} ref={popRef} onKeyDown={onMenuKey}>
          {members.map((slug) => (
            <button key={slug} role="menuitem" aria-current={slug === current ? 'page' : undefined}
              className={'gs-navmenu-item' + (slug === current ? ' is-active' : '')}
              onClick={() => { onNavigate(slug); setOpen(false); }}>
              {(pages[slug] && pages[slug].title) || slug}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Site chrome (view mode). The page links sit inline while they fit; when they don't, they
// collapse into a single "Pages" dropdown (measured, not breakpoint-guessed, so it works for
// any number of pages). Editing affordances appear only for a signed-in user with edit rights.
export default function Header({ order, pages, current, query, onSearch, onNavigate, onNewPage, onShop, shopActive, onAccount, accountActive, onEdit, bg, onSetBg, onCommand, user, canEdit, onSignOut, logo, ctaLabel, siteName }) {
  // global chrome from Site-Settings (fall back to the build-time defaults if a prop is missing)
  const logoSrc = logo || LOGO;
  const bookLabel = ctaLabel || 'Book a Diagnostic';
  const brandName = siteName || 'Greatstone International';
  const q = (query || '').trim().toLowerCase();
  // public visitors only see published pages (a never-published draft is hidden); editors see everything
  // so they can navigate to their own drafts. The home page (order[0]) is always kept.
  const navOrder = publicNavOrder(order, pages, canEdit);
  const visible = q ? navOrder.filter((s) => ((pages[s] && pages[s].title) || s).toLowerCase().includes(q) || s.includes(q)) : navOrder;
  const navModel = buildNavModel(visible, q);
  // the persistent CTA now lands the visitor on the Contact / booking page (which carries the framing,
  // the form and the one-click Calendly option) instead of jumping straight to Calendly. Keep the GA4
  // value (book_deep_dive) stable so the metric's history doesn't fragment.
  const goBook = (where) => { track('cta_click', { cta: 'book_deep_dive', cta_location: where }); onNavigate(BOOK_PAGE); };
  // the collapsed toggle should name the user's ACTUAL location, including the Products/account routes
  // (which live in this same menu) rather than the last content page's title
  const menuLabel = shopActive ? 'Products' : accountActive ? 'Your account' : (pages[current] && pages[current].title) || 'Pages';

  const wrapRef = useRef(null);
  const neededRef = useRef(0);
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // collapse the inline nav into a dropdown when the links overflow the row
  useLayoutEffect(() => {
    const wrap = wrapRef.current; if (!wrap) return;
    const measure = () => {
      if (!collapsed) neededRef.current = wrap.scrollWidth; // intrinsic links width, cached while inline
      // collapse to the dropdown when the inline links overflow OR the viewport is in the mobile band
      // (<=760px, where studio.css hides the persistent .gs-book CTA). That keeps the dropdown's lime
      // "Book a Deep Dive" item the guaranteed booking entry point on every narrow viewport, not only
      // when the links happen to overflow. (Keep this breakpoint in sync with studio.css's .gs-book hide.)
      const narrow = typeof matchMedia !== 'undefined' && matchMedia('(max-width:760px)').matches;
      const next = narrow || neededRef.current > wrap.clientWidth + 1;
      setCollapsed((c) => (c !== next ? next : c));
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(wrap);
    return () => ro.disconnect();
  }, [collapsed, order.length, q]);

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
  // ArrowDown on the closed toggle opens the menu (Enter/Space already toggle via the button's onClick)
  const onMenuBtnKey = (e) => { if (e.key === 'ArrowDown' && !menuOpen) { e.preventDefault(); setMenuOpen(true); } };

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
                {navModel.map((it) => it.type === 'group' ? (
                  <div key={it.group.label} className="gs-navmenu-section" role="presentation">
                    <span className="gs-navmenu-grouplabel" aria-hidden="true">{it.group.label}</span>
                    {it.members.map((slug) => (
                      <button key={slug} role="menuitem" aria-current={slug === current && !shopActive ? 'page' : undefined} className={'gs-navmenu-item is-sub' + (slug === current && !shopActive ? ' is-active' : '')}
                        onClick={() => { onNavigate(slug); setMenuOpen(false); }}>{(pages[slug] && pages[slug].title) || slug}</button>
                    ))}
                  </div>
                ) : (
                  <button key={it.slug} role="menuitem" aria-current={it.slug === current && !shopActive ? 'page' : undefined} className={'gs-navmenu-item' + (it.slug === current && !shopActive ? ' is-active' : '')}
                    onClick={() => { onNavigate(it.slug); setMenuOpen(false); }}>{(pages[it.slug] && pages[it.slug].title) || it.slug}</button>
                ))}
                {onShop && <button role="menuitem" aria-current={shopActive ? 'page' : undefined} className={'gs-navmenu-item' + (shopActive ? ' is-active' : '')} onClick={() => { onShop(); setMenuOpen(false); }}>Products</button>}
                <button role="menuitem" className="gs-navmenu-item gs-navmenu-book" onClick={() => { setMenuOpen(false); goBook('menu'); }}>{bookLabel}</button>
                {onAccount && <button role="menuitem" className={'gs-navmenu-item' + (accountActive ? ' is-active' : '')} onClick={() => { onAccount(); setMenuOpen(false); }}>Your account</button>}
                {visible.length === 0 && <span className="gs-navmenu-empty">no pages match “{query}”</span>}
              </div>
            )}
          </nav>
        ) : (
          <nav className="gs-nav" aria-label="Primary">
            {navModel.map((it) => it.type === 'group' ? (
              <NavGroup key={it.group.label} group={it.group} members={it.members} pages={pages} current={shopActive ? null : current} onNavigate={onNavigate} />
            ) : (
              <button key={it.slug} aria-current={it.slug === current && !shopActive ? 'page' : undefined} className={'gs-navlink' + (it.slug === current && !shopActive ? ' is-active' : '')} onClick={() => onNavigate(it.slug)}>
                {(pages[it.slug] && pages[it.slug].title) || it.slug}
              </button>
            ))}
            {onShop && <button aria-current={shopActive ? 'page' : undefined} className={'gs-navlink' + (shopActive ? ' is-active' : '')} onClick={onShop}>Products</button>}
            {visible.length === 0 && <span className="gs-nomatch">no pages match “{query}”</span>}
          </nav>
        )}
      </div>

      <div className="gs-tools">
        {/* persistent, always-visible primary CTA + account icon (Ben's 18 Jun review) — outside the
            signed-in block below so public visitors see them too. The CTA now navigates to the Contact /
            booking page rather than opening Calendly directly. */}
        <button className="gs-btn primary gs-book" onClick={() => goBook('header')}>{bookLabel}</button>
        {onAccount && (
          <button className={'gs-accountbtn' + (accountActive ? ' is-active' : '')} onClick={onAccount} aria-label="Your account" aria-current={accountActive ? 'page' : undefined} title="Your account">
            <UserIcon />
          </button>
        )}
        {/* the inline page-search input was redundant with the ⌘K command palette (which searches +
            navigates); removing it frees the row so the reordered nav stays inline on desktop and the
            header reads cleaner (Ben's 18 Jun review). ⌘K remains the search affordance. */}
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
