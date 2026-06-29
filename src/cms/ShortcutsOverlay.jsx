import { useState, useEffect, useRef, useMemo } from 'react';
import { SHORTCUT_GROUPS, matchShortcuts, formatChord, chordLabel } from '../lib/shortcuts-model.mjs';

// Keyboard-shortcut reference overlay. Opens from anywhere via "?" (or the ⌘K command "Keyboard
// shortcuts"). Clones the CommandPalette a11y scaffolding: role=dialog/aria-modal, focus the search on
// open, restore focus to the trigger on close (WCAG 2.4.3), lock background scroll, Esc + Tab-trap.
// Every chord is grounded in a real handler (shortcuts-model). Read-only — it changes nothing.
function detectMac() {
  if (typeof navigator === 'undefined') return true;
  return /Mac|iPhone|iPad|iPod/i.test((navigator.platform || '') + ' ' + (navigator.userAgent || ''));
}

export default function ShortcutsOverlay({ open, onClose }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  const isMac = useMemo(detectMac, []);

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
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    // the search input is the only focusable control — trap Tab on it so focus can't slip behind the overlay
    else if (e.key === 'Tab') { e.preventDefault(); inputRef.current && inputRef.current.focus(); }
  };

  return (
    <div className="gs-cmd-backdrop" onMouseDown={onClose}>
      <div className="gs-cmd gs-sc" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="gs-cmd-search">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6"/><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} type="text" placeholder="Search shortcuts…" aria-label="Search keyboard shortcuts" />
          <kbd>esc</kbd>
        </div>
        <div className="gs-sc-body">
          <p className="gs-sc-intro">Move around the studio faster. Press <kbd>?</kbd> any time to reopen this.</p>
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
