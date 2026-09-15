// A small pane of fields, anchored to the thing it changes.
//
// ⚠ THE THIRD INSTRUMENT, AND IT EXISTS BECAUSE TWO WERE NOT ENOUGH. InlineText edits one
// paragraph where it sits; InlineLinks edits one relation where it sits; the side drawer is a
// twenty-five field form for creating an item from nothing. Between them sits everything that is
// two to six fields which only make sense TOGETHER: a state and the reason for it, a score pair, a
// link and what it shows. Those went to the drawer because there was nowhere else, and the drawer
// is the wrong size for them by an order of magnitude.
//
// ⚠ IT PORTALS TO <body>. The record drawer learned this the hard way: a panel rendered inside the
// page is trapped by any ancestor that creates a stacking context, and the scrim ends up behind the
// content it is meant to cover. The canvas, the tab panel and the sticky bar all create one.
//
// ⚠ AND IT SUBMITS THE FIELDS TOGETHER. A state of "cancelled" refuses to save without a reason;
// saving them one at a time would fail on the first. One write, one validation, one log entry.
import React, { useState, useRef, useEffect, useLayoutEffect, useId } from 'react';
import { createPortal } from 'react-dom';

/** Where the pane sits: under the trigger, nudged so it never leaves the viewport. */
function place(anchor, pane) {
  const a = anchor.getBoundingClientRect();
  const w = pane.offsetWidth || 320;
  const h = pane.offsetHeight || 220;
  const pad = 10;
  let left = a.left;
  let top = a.bottom + 8;
  if (left + w > innerWidth - pad) left = Math.max(pad, innerWidth - w - pad);
  // Flip above when there is no room below and there is room above.
  if (top + h > innerHeight - pad && a.top - h - 8 > pad) top = a.top - h - 8;
  return { left: Math.max(pad, left), top: Math.max(pad, Math.min(top, innerHeight - h - pad)) };
}

export default function Popover({
  label, children, onSave, onClose, anchorRef, saveLabel = 'Save', wide = false,
}) {
  const pane = useRef(null);
  const [at, setAt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const id = useId();

  // Measured after paint, before the browser shows it: placing it from a guess makes it jump.
  useLayoutEffect(() => {
    if (!anchorRef?.current || !pane.current) return undefined;
    const put = () => setAt(place(anchorRef.current, pane.current));
    put();
    addEventListener('resize', put);
    addEventListener('scroll', put, true);
    return () => { removeEventListener('resize', put); removeEventListener('scroll', put, true); };
  }, [anchorRef]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); anchorRef?.current?.focus(); }
    };
    const onDown = (e) => {
      if (pane.current?.contains(e.target) || anchorRef?.current?.contains(e.target)) return;
      onClose();
    };
    addEventListener('keydown', onKey, true);
    addEventListener('pointerdown', onDown);
    // The first field, so a keyboard reaches the content rather than the pane.
    const first = pane.current?.querySelector('input, select, textarea, button');
    first?.focus();
    return () => { removeEventListener('keydown', onKey, true); removeEventListener('pointerdown', onDown); };
  }, [onClose, anchorRef]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await onSave(); onClose(); anchorRef?.current?.focus(); }
    // ⚠ SHOWN, NOT SWALLOWED, and the pane STAYS OPEN. Closing on a refusal would throw away what
    // somebody typed and tell them nothing about why.
    catch (e2) { setErr(e2.message || String(e2)); }
    finally { setBusy(false); }
  };

  return createPortal(
    <div className={`dd-pop${wide ? ' is-wide' : ''}`} ref={pane} role="dialog" aria-modal="false"
      aria-label={label} aria-describedby={id}
      style={at ? { left: at.left, top: at.top } : { opacity: 0, pointerEvents: 'none' }}>
      <form onSubmit={submit}>
        <p className="dd-pop-h" id={id}>{label}</p>
        <div className="dd-pop-b">{children}</div>
        {err && <p className="dd-pop-err" role="alert">{err}</p>}
        <div className="dd-pop-f">
          <button type="button" className="gs-btn ghost sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="gs-btn primary sm" disabled={busy}>
            {busy ? 'Saving…' : saveLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
