import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { STAGE_OPTIONS } from './stage-presets.js';
import { Search } from './blocks/icons.jsx';
import { ROLE_LABEL } from './cms/staffRoles.mjs';
import { track } from './lib/analytics.js';
import { safeHref } from './lib/safe-url.js';
import { PRIMARY_CTA_LABEL } from './lib/brand.mjs';
import { getSession, onAuth } from './store/customerAuth.mjs';

const LOGO = '/assets/greatstone-logo-web.png';
const LOGO_WEBP = '/assets/greatstone-logo-web.webp'; // 47% smaller twin; only offered when the logo is the built-in default (a CMS-overridden logo has no .webp sibling)
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

// The persistent primary CTA ("Begin the Conversation") lands the visitor on the booking page (slug BOOK_PAGE).
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
  // footerOnly pages (Terms, Privacy, …) belong in the footer's legal row, never the header — so the
  // order-fallback (used when no nav tree is configured) skips them just as the configured tree omits them.
  if (!Array.isArray(nav) || !nav.length) nav = (order || []).filter((slug) => !(pages[slug] && pages[slug].footerOnly)).map((slug) => ({ type: 'page', pageSlug: slug }));
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
  // A real link, not a button: a page has an address now, so let people cmd-click it into a new tab, copy
  // the link, see where it goes on hover, and let a crawler follow it. The click is still intercepted for
  // the SPA transition, but only for an unmodified left click.
  return (
    <a
      aria-current={active ? 'page' : undefined}
      className={className + (active ? ' is-active' : '')}
      href={'#' + item.slug}
      onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; e.preventDefault(); onNavigate(item.slug); }}
    >{item.label}</a>
  );
}

// An inline nav dropdown (desktop). Opens on hover and on click/Enter; full menu-button keyboard pattern
// (ArrowDown opens + enters the menu, roving Up/Down/Home/End, Escape closes + restores focus, outside
// click closes). Highlights itself when the current page is one of its members. The DX Dev Tools
// group holds the Products route (kind 'shop'); "More" holds only genuine overflow.
function NavGroup({ label, members, current, shopActive, onNavigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const active = shopActive ? members.some((m) => m.kind === 'shop') : members.some((m) => m.kind === 'page' && m.slug === current);

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
          {members.map((m, i) => m.kind === 'shop' ? (
            <button key="shop" className={'gs-navmenu-item' + (shopActive ? ' is-active' : '')} aria-current={shopActive ? 'page' : undefined}
              onClick={() => { m.onSelect(); setOpen(false); }}>{m.label}</button>
          ) : (
            <NavLeaf key={m.slug || m.href || i} item={m} current={current} shopActive={shopActive} className="gs-navmenu-item"
              onNavigate={(slug) => { onNavigate(slug); setOpen(false); }} />
          ))}
        </div>
      )}
    </div>
  );
}

// Fewer inline links than this and the "More" split stops helping: the whole bar folds into one menu.
const MIN_INLINE = 3;

// Site chrome (view mode). The page links sit inline while they fit. When they don't, the ones at the end of
// the nav order move into a "More" menu, so a laptop keeps the first launch pages one click away (GRE-659
// review); only when fewer than MIN_INLINE fit, or on a phone, does the bar collapse into a single dropdown.
// All measured, not breakpoint-guessed. Editing affordances appear only for a signed-in user with edit rights.
export default function Header({ order, pages, navigation, current, query, onSearch, onNavigate, onNewPage, onShop, shopActive, onAccount, accountActive, onEdit, bg, onSetBg, onCommand, user, canEdit, onSignOut, logo, ctaLabel, siteName }) {
  const [clientSignedIn, setClientSignedIn] = useState(false);
  useEffect(() => {
    let mounted = true;
    getSession().then((session) => { if (mounted) setClientSignedIn(!!session); });
    const { data } = onAuth((session) => { if (mounted) setClientSignedIn(!!session); });
    return () => { mounted = false; data?.subscription?.unsubscribe?.(); };
  }, []);
  const accountLabel = clientSignedIn ? 'Account' : 'Sign in';
  // global chrome from Site-Settings (fall back to the build-time defaults if a prop is missing)
  const logoSrc = logo || LOGO;
  const bookLabel = ctaLabel || PRIMARY_CTA_LABEL; // Ben's fixed primary CTA wording
  const brandName = siteName || 'Greatstone International';
  const q = (query || '').trim().toLowerCase();
  // nav is driven by the editable CMS navigation tree (state.navigation); public sees only published
  // pages, editors see everything, and a blank tree falls back to page order so the bar is never empty.
  const navModel = buildNavModel(navigation, order, pages, canEdit, q).map((item) =>
    item.kind === 'page' && item.slug === 'dev-tools' && onShop
      ? { kind: 'group', label: item.label, members: [item, { kind: 'shop', label: 'Products', onSelect: onShop }] }
      : item);
  // the persistent CTA lands on the Contact / booking page (form + one-click Calendly) instead of
  // jumping straight to Calendly. Keep the GA4 value (book_deep_dive) stable so history doesn't fragment.
  const goBook = (where) => { track('cta_click', { cta: 'book_deep_dive', cta_location: where }); onNavigate(BOOK_PAGE); };
  // the collapsed toggle should name the user's ACTUAL location, including the Products/account routes
  const menuLabel = shopActive ? 'Products' : accountActive ? 'Your account' : (current === 'home' || current === 'dev-tools') ? 'Menu' : (pages[current] && pages[current].title) || 'Menu';

  // the inline bar's items in priority order (the configured nav); the end of the list is the first to move
  // into "More" when the row is narrow. The storefront sits under DX Dev Tools.
  // The booking page's nav entry also sits in "More": the lime CTA beside the bar already goes there, and two
  // copies of the same action side by side compete (GRE-659 review). The phone menu keeps the full tree.
  const isBookLeaf = (it) => it.kind === 'page' && it.slug === BOOK_PAGE;
  const baseLeaves = navModel.filter((it) => !isBookLeaf(it));
  const pins = navModel.filter(isBookLeaf);
  const hasNamedMore = baseLeaves.some((it) => it.kind === 'group' && it.label === 'More');
  const leaves = hasNamedMore ? baseLeaves.map((it) => it.kind === 'group' && it.label === 'More' ? { ...it, members: [...it.members, ...pins] } : it) : baseLeaves;
  const pinnedMore = hasNamedMore ? [] : pins;
  const leavesKey = leaves.map((l) => l.kind + ':' + l.label).join('|') + '|' + pinnedMore.length;

  const wrapRef = useRef(null);
  const measureRef = useRef(null);
  const [collapsed, setCollapsed] = useState(false);
  const [fit, setFit] = useState(Infinity); // how many leaves sit inline; the rest go into "More"
  const [menuOpen, setMenuOpen] = useState(false);

  // Measure every label once in a hidden row (always rendered, so it works in any state), then fit as many
  // as the row allows, leaving room for the "More" button when anything overflows.
  useLayoutEffect(() => {
    const wrap = wrapRef.current; const row = measureRef.current; if (!wrap || !row) return;
    const measure = () => {
      const kids = Array.from(row.children);
      const widths = kids.slice(0, -1).map((k) => k.getBoundingClientRect().width);
      const moreW = kids.length ? kids[kids.length - 1].getBoundingClientRect().width : 0;
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const avail = wrap.clientWidth;
      const total = widths.reduce((a, w) => a + w, 0) + gap * Math.max(0, widths.length - 1);
      let n = widths.length;
      if (pinnedMore.length || total > avail + 1) {
        let used = moreW; n = 0;
        while (n < widths.length && used + gap + widths[n] <= avail + 1) { used += gap + widths[n]; n++; }
      }
      // collapse in the mobile band too (<=760px, where studio.css hides the persistent .gs-book CTA), so the
      // dropdown's booking item stays reachable.
      const narrow = typeof matchMedia !== 'undefined' && matchMedia('(max-width:760px)').matches;
      const next = narrow || n < Math.min(MIN_INLINE, widths.length);
      setCollapsed((c) => (c !== next ? next : c));
      setFit((f) => (f !== n ? n : f));
    };
    measure();
    // the row is observed too: it resizes when the web font arrives, which changes every label's width
    const ro = new ResizeObserver(measure); ro.observe(wrap); ro.observe(row);
    return () => ro.disconnect();
  }, [leavesKey]);
  const inlineLeaves = leaves.slice(0, fit);
  // a group that overflows gives its members to "More" (one level of menu, not a menu inside a menu)
  const moreLeaves = [...leaves.slice(fit).flatMap((it) => (it.kind === 'group' ? it.members : [it])), ...pinnedMore];

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
    <a key={m.slug} role="menuitem" href={'#' + m.slug} aria-current={m.slug === current && !shopActive ? 'page' : undefined} className={'gs-navmenu-item' + (sub ? ' is-sub' : '') + (m.slug === current && !shopActive ? ' is-active' : '')} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) { setMenuOpen(false); return; } e.preventDefault(); onNavigate(m.slug); setMenuOpen(false); }}>{m.label}</a>
  );

  return (
    <header className={'gs-header' + (current === 'home' || current === 'dev-tools' ? ' td-header' : '')}>
      <a className="gs-logo" href="#" aria-label={brandName} onClick={(e) => { e.preventDefault(); onNavigate(order[0]); }}>
        <picture>
          {logoSrc === LOGO && <source type="image/webp" srcSet={LOGO_WEBP} />}
          <img src={logoSrc} alt={brandName} width="800" height="160" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </picture>
      </a>

      <div className={'gs-navwrap' + (collapsed ? ' is-collapsed' : '')} ref={wrapRef}>
        {/* hidden copy of the bar's labels, used only to measure them (see the layout effect above) */}
        <div className="gs-nav gs-nav-measure" ref={measureRef} aria-hidden="true">
          {leaves.map((it, i) => <span key={i} className={'gs-navlink' + (it.kind === 'group' ? ' gs-navgroup-btn' : '')}>{it.label}{it.kind === 'group' ? <Chevron /> : null}</span>)}
          <span className="gs-navlink gs-navgroup-btn">More<Chevron /></span>
        </div>
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
                    {it.members.map((m) => m.kind === 'shop'
                      ? <button key="shop" role="menuitem" className={'gs-navmenu-item is-sub' + (shopActive ? ' is-active' : '')} onClick={() => { m.onSelect(); setMenuOpen(false); }}>Products</button>
                      : menuLeaf(m, true))}
                  </div>
                ) : menuLeaf(it, false))}
                <button role="menuitem" className="gs-navmenu-item gs-navmenu-book" onClick={() => { setMenuOpen(false); goBook('menu'); }}>{bookLabel}</button>
                {navModel.length === 0 && <span className="gs-navmenu-empty">no pages match “{query}”</span>}
              </div>
            )}
          </nav>
        ) : (
          <nav className="gs-nav" aria-label="Primary">
            {inlineLeaves.map((it, i) => it.kind === 'group' ? (
              <NavGroup key={'g' + i} label={it.label} members={it.members} current={current} shopActive={shopActive} onNavigate={onNavigate} />
            ) : (
              <NavLeaf key={it.slug || it.href || i} item={it} current={current} shopActive={shopActive} onNavigate={onNavigate} className="gs-navlink" />
            ))}
            {moreLeaves.length ? <NavGroup label="More" members={moreLeaves} current={current} shopActive={shopActive} onNavigate={onNavigate} /> : null}
            {navModel.length === 0 && <span className="gs-nomatch">no pages match “{query}”</span>}
          </nav>
        )}
      </div>

      <div className="gs-tools">
        {/* persistent, always-visible primary CTA + account icon (Ben's 18 Jun review). The CTA navigates
            to the Contact / booking page rather than opening Calendly directly. */}
        <button className="gs-btn primary gs-book" onClick={() => goBook('header')}>{bookLabel}</button>
        {onAccount && (
          <button className={'gs-accountbtn' + (accountActive ? ' is-active' : '')} onClick={onAccount} aria-label={accountLabel} title={accountLabel}>
            <UserIcon /><span className="gs-accountlabel">{accountLabel}</span>
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
