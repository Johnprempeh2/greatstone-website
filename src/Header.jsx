import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { STAGE_OPTIONS } from './stage-presets.js';
import { Search } from './blocks/icons.jsx';
import { ROLES } from './cms/auth.js';

const LOGO = 'https://greatstone-home.netlify.app/assets/greatstone-logo-web.png';
// the view-mode 3D switcher flips to its light-surface variant when a light scene (tide family) sits
// behind the header, so the control stays legible over a bright background
const LIGHT_KINDS = new Set(['tide', 'tideRadial', 'tideCalm']);
const firstSceneKind = (bg) => {
  if (bg && typeof bg === 'object' && Array.isArray(bg.scenes)) return bg.scenes[0] && bg.scenes[0].kind;
  const opt = STAGE_OPTIONS.find((o) => o.id === bg);
  return opt && opt.scenes && opt.scenes[0];
};
const Chevron = (p) => (<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...p}><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>);

// Site chrome (view mode). The page links sit inline while they fit; when they don't, they
// collapse into a single "Pages" dropdown (measured, not breakpoint-guessed, so it works for
// any number of pages). Editing affordances appear only for a signed-in user with edit rights.
export default function Header({ order, pages, current, query, onSearch, onNavigate, onNewPage, onShop, shopActive, onAccount, accountActive, onEdit, bg, onSetBg, onCommand, user, canEdit, onSignOut }) {
  const q = (query || '').trim().toLowerCase();
  const visible = q ? order.filter((s) => (pages[s].title || s).toLowerCase().includes(q) || s.includes(q)) : order;

  const wrapRef = useRef(null);
  const neededRef = useRef(0);
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // collapse the inline nav into a dropdown when the links overflow the row
  useLayoutEffect(() => {
    const wrap = wrapRef.current; if (!wrap) return;
    const measure = () => {
      if (!collapsed) neededRef.current = wrap.scrollWidth; // intrinsic links width, cached while inline
      const next = neededRef.current > wrap.clientWidth + 1;
      setCollapsed((c) => (c !== next ? next : c));
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(wrap);
    return () => ro.disconnect();
  }, [collapsed, order.length, q]);

  // close the dropdown on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => { if (!e.target.closest || !e.target.closest('.gs-navmenu')) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  return (
    <header className="gs-header">
      <a className="gs-logo" href="#" onClick={(e) => { e.preventDefault(); onNavigate(order[0]); }}>
        <img src={LOGO} alt="Greatstone International" width="800" height="160" decoding="async" />
      </a>

      <div className={'gs-navwrap' + (collapsed ? ' is-collapsed' : '')} ref={wrapRef}>
        {collapsed ? (
          <div className="gs-navmenu">
            <button className="gs-navmenu-btn" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-haspopup="true">
              <span>{(pages[current] && pages[current].title) || 'Pages'}</span><Chevron />
            </button>
            {menuOpen && (
              <div className="gs-navmenu-pop" role="menu">
                {visible.map((slug) => (
                  <button key={slug} role="menuitem" className={'gs-navmenu-item' + (slug === current && !shopActive ? ' is-active' : '')}
                    onClick={() => { onNavigate(slug); setMenuOpen(false); }}>{pages[slug].title}</button>
                ))}
                {onShop && <button role="menuitem" className={'gs-navmenu-item' + (shopActive ? ' is-active' : '')} onClick={() => { onShop(); setMenuOpen(false); }}>Shop</button>}
                {onAccount && <button role="menuitem" className={'gs-navmenu-item' + (accountActive ? ' is-active' : '')} onClick={() => { onAccount(); setMenuOpen(false); }}>Account</button>}
                {visible.length === 0 && <span className="gs-navmenu-empty">no pages match “{query}”</span>}
              </div>
            )}
          </div>
        ) : (
          <nav className="gs-nav">
            {visible.map((slug) => (
              <button key={slug} className={'gs-navlink' + (slug === current && !shopActive ? ' is-active' : '')} onClick={() => onNavigate(slug)}>
                {pages[slug].title}
              </button>
            ))}
            {onShop && <button className={'gs-navlink' + (shopActive ? ' is-active' : '')} onClick={onShop}>Shop</button>}
            {onAccount && <button className={'gs-navlink' + (accountActive ? ' is-active' : '')} onClick={onAccount}>Account</button>}
            {visible.length === 0 && <span className="gs-nomatch">no pages match “{query}”</span>}
          </nav>
        )}
      </div>

      <div className="gs-tools">
        <button className="gs-cmdbtn" onClick={onCommand} title="Command palette (⌘K)" aria-label="Command palette">
          <Search /><kbd>⌘K</kbd>
        </button>
        <div className="gs-search">
          <Search />
          <input value={query} onChange={(e) => onSearch(e.target.value)} placeholder="Search pages" aria-label="Search pages" />
        </div>

        {user ? (
          <>
            {canEdit && (
              <>
                <label className={'gs-bg' + (LIGHT_KINDS.has(firstSceneKind(bg)) ? ' dark' : '')}>
                  <span>3D</span>
                  <select value={bg} onChange={(e) => onSetBg(e.target.value)}>
                    {STAGE_OPTIONS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                  </select>
                </label>
                <button className="gs-btn ghost" onClick={onNewPage}>+ New page</button>
                <button className="gs-btn primary" onClick={onEdit}>Edit page</button>
              </>
            )}
            <span className="gs-userchip" title={user.email}>{user.name} · {ROLES[user.role] ? ROLES[user.role].label : user.role}</span>
            <button className="gs-signout" onClick={onSignOut} title="Sign out">Sign out</button>
          </>
        ) : null}
      </div>
    </header>
  );
}
