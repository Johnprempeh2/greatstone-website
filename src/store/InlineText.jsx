// Edit a field where it sits, instead of opening a drawer over the record to change one paragraph.
//
// The drawer is right for CREATING an item: a dozen fields, validation, a decision. It is wrong for
// correcting a sentence you are looking at, because it covers the thing you are correcting it
// against and makes a one-word fix a five-click errand. Two affordances for two different jobs.
//
// Everything still goes through the same runOp the drawer uses, so validation, the version check,
// the change log and attribution all apply. This is a different way IN, not a second way to write.
import React, { useState, useRef, useEffect } from 'react';

/**
 * @param value        what is stored now
 * @param onSave       async (next) => void — must throw to report a failure
 * @param label        what this field is, for the accessible name and the edit prompt
 * @param placeholder  shown in the empty editor
 * @param empty        what to say when there is nothing yet and nobody can edit
 * @param multiline    textarea rather than input
 * @param can          { can: boolean, why: string } — the same shape the rest of the portal uses
 * @param render       optional (value) => node, for a field whose STORED form is not its READ form.
 *                     A list edits as one item per line and reads as a list; without this it comes
 *                     back as a run-on paragraph the moment the editor closes, which is worse than
 *                     the drawer it replaced.
 */
export default function InlineText({
  value, onSave, label, placeholder = '', empty = null, multiline = true, can = { can: true },
  rows = 4, className = '', render = null,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const field = useRef(null);

  // ⚠ THE GUARD USED TO PROTECT THE CASE THAT CANNOT HAPPEN.
  // Re-seeding only `if (!editing)` is right for keeping the display fresh, but it protects nothing:
  // when nobody is editing there is no draft to lose. The case that CAN hurt is the opposite one —
  // the stored value moves WHILE you are typing (a colleague, an MCP session, or your own save in
  // another editor on the same page), and commit() then writes your draft over their change with
  // nothing said. `base` is the value this edit started from, so a commit can notice.
  const [base, setBase] = useState(value || '');
  useEffect(() => { if (!editing) { setDraft(value || ''); setBase(value || ''); } }, [value, editing]);
  const movedUnderneath = editing && (value || '') !== base;
  // ⚠ SELECT ONLY A SINGLE-LINE FIELD. On a textarea, select() highlights the whole stored value,
  // so clicking a five-line passage to fix one word and typing a character replaced all of it.
  // Correct for a one-line input, destructive for prose.
  useEffect(() => {
    if (!editing || !field.current) return;
    field.current.focus();
    if (!multiline) field.current.select?.();
    else field.current.setSelectionRange?.(field.current.value.length, field.current.value.length);
  }, [editing, multiline]);

  const dirty = (draft || '') !== (value || '');

  const commit = async () => {
    if (!dirty) { setEditing(false); setErr(null); return; }
    // Somebody else changed this while it was open. Say so once, and let the next press go through:
    // refusing outright would strand the typist with no way to keep their own words.
    if (movedUnderneath && !err) {
      setErr('This changed while you were typing. Press Save again to replace it with your version, '
        + 'or Cancel to keep theirs.');
      setBase(value || '');
      return;
    }
    setBusy(true); setErr(null);
    try { await onSave(draft); setEditing(false); }
    catch (e) { setErr(e.message || 'That could not be saved.'); }
    finally { setBusy(false); }
  };
  const cancel = () => { setDraft(value || ''); setErr(null); setEditing(false); };

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
    // Cmd/Ctrl+Enter saves from anywhere in the field. In a single-line input plain Enter does too,
    // because a form field that ignores Enter feels broken.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !multiline)) { e.preventDefault(); commit(); }
  };

  if (!editing) {
    const has = String(value || '').trim().length > 0;
    if (!has && !can.can) return empty ? <p className="dd-inline-none">{empty}</p> : null;
    // ⚠ THIS BRANCH IGNORED `render`, so the one audience that cannot edit — every client, and any
    // staff member without author rights — saw a list as the newline-joined string it is STORED as.
    // That is verbatim the failure `render` was added to prevent, left in place for the readers who
    // have no way to work around it.
    if (!can.can) return <p className={`dd-inline-v ${className}`}>{render ? render(value) : value}</p>;
    // A real button, so it is reachable and announced. The whole passage is the target: hunting for
    // a pencil is the thing that makes inline editing feel worse than a form.
    return (
      <button type="button" className={`dd-inline ${has ? '' : 'is-empty'} ${className}`}
        onClick={() => setEditing(true)} aria-label={has ? `Edit ${label}` : `Record ${label.toLowerCase()}`}>
        {/* ⚠ NOT `Add ${label}`. The labels here are noun phrases and questions, so prefixing the
            verb produced "Add Owned by", "Add How it is calculated", "Add What period it covers":
            broken English on five stacked prompts of one KPI page. The label alone, with the "+"
            carrying the meaning, reads in every case and matches the "+ Add a pillar" chips already
            on these screens. The spoken label below stays a full sentence for assistive tech. */}
        {/* Sentence case for the prompt only: a third of these labels are written lowercase
            because they read that way spoken ("Edit what limits it"), and showing them verbatim put
            "+ what limits it" among "+ Owned by" and "+ How it is calculated". The label itself is
            left exactly as the call site wrote it. */}
        <span className="dd-inline-v">{has ? (render ? render(value) : value) : `+ ${String(label).charAt(0).toUpperCase()}${String(label).slice(1)}`}</span>
        <span className="dd-inline-hint" aria-hidden="true">{has ? 'Edit' : 'Add'}</span>
      </button>
    );
  }

  const Field = multiline ? 'textarea' : 'input';
  return (
    <div className={`dd-inline-e ${className}`}>
      <Field ref={field} value={draft} disabled={busy} rows={multiline ? rows : undefined}
        aria-label={label} placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} />
      {err && <p className="dd-inline-err" role="alert">{err}</p>}
      <div className="dd-inline-t">
        <button type="button" className="gs-btn primary sm" disabled={busy || !dirty} onClick={commit}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="gs-btn ghost sm" disabled={busy} onClick={cancel}>Cancel</button>
        <span className="dd-inline-k" aria-hidden="true">
          {multiline ? '⌘↩ to save' : '↩ to save'} · Esc to cancel
        </span>
      </div>
    </div>
  );
}
