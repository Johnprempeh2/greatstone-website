import { useState, useEffect, useRef, useMemo } from 'react';

// Cmd/Ctrl-K command palette: every studio action one keystroke away — jump to a page,
// switch the 3D background, add a block, set status, preview, publish. Keyboard-first,
// fuzzy-filtered, grouped. The command list is supplied by App so it always reflects state.
export default function CommandPalette({ open, onClose, commands }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQ(''); setSel(0);
    const restore = document.activeElement;                          // the trigger (toolbar button / Cmd-K)
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';                         // lock background scroll while open
    const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 20);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      if (restore && restore.focus) restore.focus();                 // restore focus to the trigger (WCAG 2.4.3)
    };
  }, [open]);

  const filtered = useMemo(() => {
    const s = (q || '').trim().toLowerCase();
    if (!s) return commands;
    return commands.filter((c) => (c.label + ' ' + (c.hint || '') + ' ' + (c.group || '')).toLowerCase().includes(s));
  }, [q, commands]);

  useEffect(() => { setSel(0); }, [q]);
  // keep the highlighted row in view during keyboard navigation
  useEffect(() => { if (open && listRef.current) { const el = listRef.current.querySelector('.is-sel'); if (el) el.scrollIntoView({ block: 'nearest' }); } }, [sel, q, open]);
  if (!open) return null;

  const run = (c) => { if (!c || c.disabled) return; onClose(); c.run(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(filtered[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    // the search input is the only focusable control — trap Tab on it so focus can't slip behind the open palette
    else if (e.key === 'Tab') { e.preventDefault(); inputRef.current && inputRef.current.focus(); }
  };

  return (
    <div className="gs-cmd-backdrop" onMouseDown={onClose}>
      <div className="gs-cmd" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="gs-cmd-search">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6"/><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a command or search pages…"
            aria-label="Command" role="combobox" aria-expanded="true" aria-controls="gs-cmd-list" aria-autocomplete="list"
            aria-activedescendant={filtered[sel] ? 'gs-cmd-' + filtered[sel].id : undefined} />
          <kbd>esc</kbd>
        </div>
        <ul className="gs-cmd-list" id="gs-cmd-list" role="listbox" ref={listRef}>
          {filtered.map((c, i) => (
            <li key={c.id} id={'gs-cmd-' + c.id} role="option" aria-selected={i === sel} aria-disabled={c.disabled || undefined}
              className={'gs-cmd-item' + (i === sel ? ' is-sel' : '') + (c.disabled ? ' is-disabled' : '')}
              onMouseEnter={() => setSel(i)} onMouseDown={(e) => { e.preventDefault(); run(c); }}>
              {c.group ? <span className="gs-cmd-group">{c.group}</span> : null}
              <span className="gs-cmd-label">{c.label}</span>
              {c.hint ? <span className="gs-cmd-hint">{c.hint}</span> : null}
            </li>
          ))}
          {!filtered.length && <li className="gs-cmd-empty">No matches for “{q}”</li>}
        </ul>
      </div>
    </div>
  );
}
