// Long prose, folded to its first few lines until somebody asks for the rest.
//
// ⚠ THE CONTROL ONLY APPEARS WHEN THERE IS ACTUALLY MORE. A "read more" on text that is already
// complete is a small lie, and a reader who presses one and gets nothing stops pressing them. So
// the clamp is measured rather than assumed, and the button is rendered off the measurement.
//
// ⚠ AND THE MEASUREMENT ONLY MEANS ANYTHING WHILE THE TEXT IS CLAMPED. Once expanded, scrollHeight
// equals clientHeight, so a naive re-measure decides nothing is clipped and removes the control
// that closes it again. The clipped verdict is therefore taken while closed and held.
import React, { useState, useRef, useEffect, useId } from 'react';

export default function More({
  children, lines = 3, className = '', label = 'Read more', less = 'Show less',
}) {
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  const body = useRef(null);
  const id = useId();

  useEffect(() => {
    const el = body.current;
    if (!el || open) return undefined;          // see the note above: only measure while clamped
    const check = () => setClipped(el.scrollHeight > el.clientHeight + 2);
    check();
    // Re-measure on resize: the same paragraph clips at one width and not another, so a verdict
    // taken once at load is wrong the moment the window changes.
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children, open, lines]);

  return (
    <div className={`dd-more ${className}`}>
      <div ref={body} id={id} className={`dd-more-b${open ? ' is-open' : ''}`}
        style={open ? undefined : { WebkitLineClamp: lines }}>
        {children}
      </div>
      {clipped && (
        <button type="button" className="dd-more-x" aria-expanded={open} aria-controls={id}
          onClick={() => setOpen((v) => !v)}>
          {open ? less : label}
        </button>
      )}
    </div>
  );
}
