// A closed vocabulary, changed where it is read.
//
// ⚠ THE FAILURE THIS EXISTS TO AVOID HAS HAPPENED THREE TIMES IN THIS CODEBASE: a <select> whose
// options do not include the stored value silently reports the FIRST option instead, and the next
// save writes that over what was actually there. A grade set by an MCP session, or a value from
// before a vocabulary changed, is erased by somebody editing an unrelated field.
//
// So an unrecognised value is never dropped. It is kept as a selected option and labelled as not
// one of this record's choices, which makes it survive a save AND makes it visible, which is the
// only honest handling: the record cannot know whether it is stale data or a vocabulary that has
// moved on, and quietly picking one is how information disappears.
import React, { useState, useRef } from 'react';

export default function InlineSelect({
  value, options, onSave, label, can = { can: true }, tone = null, empty = 'Not set',
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const sel = useRef(null);

  const known = options.some((o) => o.id === value);
  const current = options.find((o) => o.id === value);

  if (!can.can) {
    return <span className={`dd-isel-v${tone ? ` dd-isel-${tone}` : ''}`}>{current ? current.label : (value || empty)}</span>;
  }

  const change = async (next) => {
    if (next === value) return;
    setBusy(true); setErr(null);
    try { await onSave(next); }
    // Shown on the control. A refused change that says nothing leaves somebody believing it took.
    catch (e) { setErr(e.message || String(e)); if (sel.current) sel.current.value = value; }
    finally { setBusy(false); }
  };

  return (
    <span className="dd-isel">
      <select ref={sel} className={`dd-isel-s${tone ? ` dd-isel-${tone}` : ''}`} value={value ?? ''}
        aria-label={label} disabled={busy} onChange={(e) => change(e.target.value)}>
        {/* ⚠ The stored value FIRST and always, even when the vocabulary does not know it. */}
        {!known && value ? (
          <option value={value}>{value} (not one of this record&rsquo;s choices)</option>
        ) : null}
        {!known && !value ? <option value="">{empty}</option> : null}
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {err && <span className="dd-isel-err" role="alert">{err}</span>}
    </span>
  );
}
