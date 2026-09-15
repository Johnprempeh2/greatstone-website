// Add and remove a relation where it is shown, instead of opening the drawer over it.
//
// ⚠ THE DRAWER IS FOR CREATING AN ITEM. It is a dozen fields, validation and a decision, and it is
// the wrong instrument for "this proposal also changes process 04", which is one fact you are
// looking straight at. Every relation in this record was drawer-only, so the smallest possible
// change to a link meant leaving the thing you were reading, finding the field among twenty, and
// coming back to check.
//
// ⚠ IT WRITES THROUGH THE SAME runOp AS THE DRAWER. Same validation, same version check, same
// change log, same attribution. A different way IN, never a second way to write.
import React, { useState, useRef, useEffect, useId } from 'react';
import { Icon } from './DeepDiveIcons.jsx';

export default function InlineLinks({
  value = [], options = [], onChange, can = { can: false }, label,
  href = null, empty = 'Nothing linked yet.', addLabel = 'Add',
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const btn = useRef(null);
  const box = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    const onDown = (e) => {
      if (box.current?.contains(e.target) || btn.current?.contains(e.target)) return;
      setOpen(false);
    };
    addEventListener('keydown', onKey); addEventListener('pointerdown', onDown);
    return () => { removeEventListener('keydown', onKey); removeEventListener('pointerdown', onDown); };
  }, [open]);

  const chosen = new Set(value);
  const offer = options.filter((o) => !chosen.has(o.id))
    .filter((o) => !q || `${o.label} ${o.sub || ''}`.toLowerCase().includes(q.toLowerCase()));

  const write = async (next) => {
    setBusy(true); setErr(null);
    try { await onChange(next); setQ(''); }
    // ⚠ The error is shown HERE rather than thrown away. A refused link that silently does nothing
    // is the failure this whole record is built to avoid.
    catch (e) { setErr(e.message || String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="dd-links">
      <ul className="dd-links-l">
        {value.map((v) => {
          const o = options.find((x) => x.id === v);
          return (
            <li key={v} className={`dd-link${o ? '' : ' is-lost'}`}>
              {/* ⚠ A link the record cannot resolve is SHOWN, not dropped. Quietly hiding it would
                  make the tie look complete when it is broken. */}
              {o && href
                ? <a href={href(o.id)}>{o.label}</a>
                : <span>{o ? o.label : 'no longer in this record'}</span>}
              {can.can && (
                <button type="button" className="dd-link-x" disabled={busy}
                  aria-label={`Remove ${o ? o.label : 'this link'}`}
                  onClick={() => write(value.filter((x) => x !== v))}>&times;</button>
              )}
            </li>
          );
        })}
        {!value.length && !can.can && <li className="dd-links-none">{empty}</li>}
        {can.can && (
          <li className="dd-links-add">
            <button type="button" ref={btn} className="dd-link-add" aria-expanded={open}
              aria-haspopup="listbox" aria-controls={id} disabled={busy}
              onClick={() => setOpen((v) => !v)}>
              {Icon.add({ size: 12 })} {addLabel}
            </button>
            {open && (
              <div className="dd-links-pop" ref={box} id={id}>
                {options.length > 7 && (
                  <input className="dd-links-q" value={q} autoFocus
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={`Find a ${label || 'link'}`} aria-label={`Find a ${label || 'link'}`} />
                )}
                <ul role="listbox" aria-label={label}>
                  {offer.length ? offer.map((o) => (
                    <li key={o.id}>
                      <button type="button" role="option" aria-selected="false" disabled={busy}
                        onClick={() => { write([...value, o.id]); setOpen(false); }}>
                        <b>{o.label}</b>{o.sub ? <span>{o.sub}</span> : null}
                      </button>
                    </li>
                  )) : (
                    <li className="dd-links-empty">
                      {options.length ? 'Nothing left to link.' : `No ${label || 'item'} in this record yet.`}
                    </li>
                  )}
                </ul>
              </div>
            )}
          </li>
        )}
      </ul>
      {err && <p className="dd-links-err" role="alert">{err}</p>}
    </div>
  );
}
