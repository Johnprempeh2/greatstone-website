import { useState, useEffect, useRef, useMemo } from 'react';
import { SHORTCUT_GROUPS, matchShortcuts, formatChord, chordLabel } from '../lib/shortcuts-model.mjs';
import { TOURS } from '../lib/tour-model.mjs';

// The guided walkthroughs, in the order a new starter meets them. Each replays its tour from step one.
const GUIDES = [
  { id: 'hub', label: 'Admin hub tour', hint: 'the whole studio in a minute' },
  { id: 'editor', label: 'Page editor guide', hint: 'blocks, text and publishing' },
  { id: 'catalogue', label: 'Catalogue guide', hint: 'offerings, pricing and enquiries' },
  { id: 'quality', label: 'Quality and releases guide', hint: 'checks and the go-live queue' },
].filter((g) => TOURS[g.id]);

// Keyboard-shortcut reference overlay. Opens from anywhere via "?" (or the ⌘K command "Keyboard
// shortcuts"). Clones the CommandPalette a11y scaffolding: role=dialog/aria-modal, focus the search on
// open, restore focus to the trigger on close (WCAG 2.4.3), lock background scroll, Esc + Tab-trap.
// Every chord is grounded in a real handler (shortcuts-model). Read-only — it changes nothing.
function detectMac() {
  if (typeof navigator === 'undefined') return true;
  return /Mac|iPhone|iPad|iPod/i.test((navigator.platform || '') + ' ' + (navigator.userAgent || ''));
}

export default function ShortcutsOverlay({ open, onClose, onReplay }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const isMac = useMemo(detectMac, []);
  const showGuides = !!onReplay && GUIDES.length > 0 && !q.trim();

  useEffect(() => {
    if (!open) return;
    setQ('');
    const restore = document.activeElement;                          // the trigger (toolbar / "?")
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';                         // lock background scroll while open
    const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 20);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      if (restore && restore.focus) restore.focus();                 // restore focus to the trigger (WCAG 2.4.3)
    };
  }, [open]);

  const result = useMemo(() => matchShortcuts(SHORTCUT_GROUPS, q, isMac), [q, isMac]);
  if (!open) return null;

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab') return;
    // wrap focus within the dialog (search input + any guide buttons) so it can never slip behind the overlay.
    // getClientRects() (not offsetParent) is the robust visible-check: offsetParent is null for a position:fixed
    // ancestor and its descendants, which would collapse the set and make the guide buttons unreachable.
    const root = dialogRef.current; if (!root) return;
    const foci = Array.from(root.querySelectorAll('input, button')).filter((el) => !el.disabled && el.getClientRects().length > 0);
    if (foci.length < 2) { e.preventDefault(); inputRef.current && inputRef.current.focus(); return; }
    const first = foci[0], last = foci[foci.length - 1], active = document.activeElement;
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    else if (!foci.includes(active)) { e.preventDefault(); first.focus(); } // focus drifted outside: pull it back in
  };

  return (
    <div className="gs-cmd-backdrop" onMouseDown={onClose}>
      <div ref={dialogRef} className="gs-cmd gs-sc" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts and guides" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="gs-cmd-search">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6"/><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} type="text" placeholder="Search shortcuts…" aria-label="Search keyboard shortcuts" />
          <kbd>esc</kbd>
        </div>
        <div className="gs-sc-body">
          <p className="gs-sc-intro">Move around the studio faster. Press <kbd>?</kbd> any time to reopen this.</p>
          {showGuides ? (
            <section className="gs-sc-group gs-sc-guides" aria-label="Guided walkthroughs">
              <h3 className="gs-sc-grouptitle">Guided walkthroughs</h3>
              <p className="gs-sc-guidesnote">New here, or want a refresher? Replay any tour from the start.</p>
              <ul className="gs-sc-guidelist">
                {GUIDES.map((g) => (
                  <li key={g.id}>
                    <button type="button" className="gs-sc-guide" onClick={() => { onReplay(g.id); onClose(); }}>
                      <span className="gs-sc-guide-play" aria-hidden="true">▷</span>
                      <span className="gs-sc-guide-txt"><span className="gs-sc-guide-l">{g.label}</span><span className="gs-sc-guide-h">{g.hint}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {result.total === 0 ? (
            <p className="gs-la-clean" role="status">No shortcuts match “{q}”.</p>
          ) : (
            result.groups.map((g) => (
              <section className="gs-sc-group" key={g.id} aria-label={g.title}>
                <h3 className="gs-sc-grouptitle">{g.title}</h3>
                <ul className="gs-sc-list">
                  {g.items.map((it, i) => (
                    <li className="gs-sc-row" key={g.id + i}>
                      <span className="gs-sc-label">{it.label}{it.hint ? <span className="gs-sc-hint"> ({it.hint})</span> : null}</span>
                      <span className="gs-sc-keys" aria-label={chordLabel(it.keys, isMac)}>
                        {formatChord(it.keys, isMac).map((k, j) => <kbd key={j}>{k}</kbd>)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
