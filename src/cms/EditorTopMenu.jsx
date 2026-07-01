import { useState, useRef, useEffect } from 'react';
import { ROLE_LABEL } from './staffRoles.mjs';

// Consolidated navigation + account menu for the page-editor top bar. The toolbar was carrying every "take me
// back" + account control inline (Hub, View site, Command palette, identity, Sign out) alongside the editing
// controls, leaving no room to breathe. This tucks the navigation/account actions behind ONE button so the
// editing controls (page, Studio, status, undo, publish) lead. The optional `items` slot lets other features
// (e.g. the per-section guide/tutorial) add their own entries without re-touching the toolbar.
// Accessible menu: aria-haspopup/expanded on the trigger, role=menu/menuitem on the list, Escape + click-outside
// close and restore focus to the trigger, and basic up/down arrow roving.
export default function EditorTopMenu({ user, onHub, onSite, onCmd, onSignOut, items = [] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current && btnRef.current.focus(); return; }
      // Tab must not leave focus stranded behind an open menu: close it and let focus flow to the next control
      if (e.key === 'Tab') { setOpen(false); return; }
      const els = Array.from(popRef.current ? popRef.current.querySelectorAll('[role="menuitem"]') : []);
      if (!els.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const i = els.indexOf(document.activeElement);
        els[e.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length].focus();
      } else if (e.key === 'Home') { e.preventDefault(); els[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); els[els.length - 1].focus(); }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    // move focus into the menu so keyboard users land on the first item
    const first = popRef.current && popRef.current.querySelector('[role="menuitem"]');
    if (first) first.focus();
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const run = (fn) => () => { setOpen(false); btnRef.current && btnRef.current.focus(); if (fn) fn(); };

  return (
    <div className="gs-em" ref={wrapRef}>
      <button ref={btnRef} type="button" className={'gs-btn ghost sm gs-em-btn' + (open ? ' is-on' : '')}
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} title="Menu and account"
        onKeyDown={(e) => { if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setOpen(true); } }}>
        <span className="gs-em-diamond" aria-hidden="true">◇</span> Menu
      </button>
      {open ? (
        <div className="gs-em-pop" role="menu" aria-label="Editor menu" ref={popRef}>
          <button role="menuitem" className="gs-em-item" onClick={run(onHub)}><span className="gs-em-ico" aria-hidden="true">◇</span> Admin hub</button>
          <button role="menuitem" className="gs-em-item" onClick={run(onSite)}><span className="gs-em-ico" aria-hidden="true">↗</span> View live site</button>
          <button role="menuitem" className="gs-em-item" onClick={run(onCmd)}><span className="gs-em-ico" aria-hidden="true">⌕</span> Search and commands <kbd className="gs-em-kbd">⌘K</kbd></button>
          {items.length ? <div className="gs-em-sep" role="separator" /> : null}
          {items.map((it, i) => (
            <button key={i} role="menuitem" className="gs-em-item" onClick={run(it.onClick)}>
              <span className="gs-em-ico" aria-hidden="true">{it.icon || '•'}</span> {it.label}
            </button>
          ))}
          <div className="gs-em-sep" role="separator" />
          <div className="gs-em-who">
            <span className="gs-em-name">{user.name}</span>
            <span className="gs-em-role">{ROLE_LABEL[user.role] || user.role}</span>
            <span className="gs-em-email">{user.email}</span>
          </div>
          <button role="menuitem" className="gs-em-item gs-em-signout" onClick={run(onSignOut)}><span className="gs-em-ico" aria-hidden="true">⎋</span> Sign out</button>
        </div>
      ) : null}
    </div>
  );
}
