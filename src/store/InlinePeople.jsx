// The name somebody typed, and the person the record can follow, edited together.
//
// ⚠ BOTH, NEVER ONE INSTEAD OF THE OTHER. The rule is written on the drawer's own controls: "a
// picker in place of the text is how a name matching nobody gets silently blanked". Who runs a
// process is often a description rather than a person on the org chart ("seven permanent staff
// under a field supervisor"), and half the names in a real record belong to people nobody has
// added yet. Replacing the sentence with a dropdown would delete what was actually said.
//
// ⚠ AND THEY SUBMIT AS ONE WRITE. Saving the name and the link separately makes two History entries
// for one decision, and leaves a window where the record says one and not the other.
import React, { useState, useRef } from 'react';
import Popover from './Popover.jsx';
import { itemHref } from '../lib/deepdive-route.mjs';

export default function InlinePeople({
  names = [], ids = [], people = [], onSave, label, nameField, idField,
  can = { can: false }, multiline = true, placeholder = '', describes = false, slug,
}) {
  const btn = useRef(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ text: '', ids: [] });

  const linked = ids.map((id) => people.find((n) => n.id === id)).filter(Boolean);
  const shown = Array.isArray(names) ? names : [names].filter(Boolean);
  // A typed name already covered by a link is not shown twice.
  const bare = (t) => String(t).trim().toLowerCase().replace(/^(the|a|an|one|our)\s+/, '');
  // ⚠ "CONTAINS THE NAME" WAS FAR TOO GREEDY, and it deleted the client's own words from the page.
  // "Seven permanent staff rising to forty at peak, under a field supervisor" contains "field
  // supervisor", so linking that person made the whole sentence vanish from the display while it
  // sat safely in the record. That is the exact failure this control exists to prevent, arriving
  // through the back door.
  // A typed entry is covered only when it IS the name: the line leads with it and the rest is a
  // note about them ("The field supervisor, on what a day looks like."). A sentence that merely
  // mentions somebody carries information the link does not, and stays.
  const covered = (text, name) => {
    const t = bare(text); const n = bare(name);
    if (!t.startsWith(n)) return false;
    const rest = t.slice(n.length).trim();
    return rest === '' || /^[,;:.\u2013\u2014-]/.test(rest);
  };
  const unlinked = shown.filter((n) => !linked.some((p) => covered(n, p.name)));

  const openIt = () => {
    setDraft({ text: (Array.isArray(names) ? names.join('\n') : names || ''), ids: [...ids] });
    setOpen(true);
  };

  return (
    <span className="dd-ipe">
      {/* ⚠ A linked person is the one entry here the record CAN follow, and for a while it was a
          bare span: the popover below promised "links onto a person's own page" while display
          delivered a dead end. The anchor keeps that promise; unlinked and describing entries
          stay spans, because there is no page behind them. */}
      {linked.map((p) => (slug
        ? <a key={p.id} className="dd-ipe-p" href={itemHref(slug, 'person', p.id)}>{p.name}{p.role ? <em> · {p.role}</em> : null}</a>
        : <span key={p.id} className="dd-ipe-p">{p.name}{p.role ? <em> · {p.role}</em> : null}</span>))}
      {/* ⚠ TWO DIFFERENT KINDS OF TEXT LIVE IN THIS CONTROL, and marking both the same way lies.
          `speakTo` is a LIST OF PEOPLE, so an entry with no link is a genuine gap and says so.
          `whoRuns` is a DESCRIPTION ("seven permanent staff, under a field supervisor"), which is
          not a name and is not missing a link even when somebody is linked beside it. Calling that
          "not linked to anybody" reports a gap that does not exist. */}
      {unlinked.map((n, i) => (
        <span key={`u${i}`} className={describes ? 'dd-ipe-d' : 'dd-ipe-u'}>
          {n}
          {!describes && <span className="gs-sr-only"> (not linked to anybody in the organisation)</span>}
        </span>
      ))}
      {!linked.length && !unlinked.length && <span className="dd-ipe-none">Not recorded</span>}
      {can.can && (
        <>
          <button type="button" ref={btn} className="dd-ipe-b" aria-haspopup="dialog"
            aria-expanded={open} onClick={openIt}>Change</button>
          {open && (
            <Popover label={label} anchorRef={btn} onClose={() => setOpen(false)} wide
              onSave={() => onSave({ [nameField]: draft.text, [idField]: draft.ids })}>
              <label>
                In their words
                {multiline
                  ? <textarea rows="3" value={draft.text} placeholder={placeholder}
                      onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} />
                  : <input value={draft.text} placeholder={placeholder}
                      onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} />}
              </label>
              <p className="dd-pop-say">
                Kept exactly as written. The links below are what the record can follow onto a
                person&rsquo;s own page; a name that matches nobody stays as text.
              </p>
              <fieldset className="dd-ipe-set">
                <legend>In the organisation</legend>
                <div className="rd-pills">
                  {people.length ? people.map((p) => (
                    <button key={p.id} type="button"
                      className={`rd-pill${draft.ids.includes(p.id) ? ' is-on' : ''}`}
                      aria-pressed={draft.ids.includes(p.id)}
                      onClick={() => setDraft((d) => ({ ...d,
                        ids: d.ids.includes(p.id) ? d.ids.filter((x) => x !== p.id) : [...d.ids, p.id] }))}>
                      {p.name}{p.role ? ` · ${p.role}` : ''}
                    </button>
                  )) : <p className="dd-pop-say">Nobody is in the organisation yet.</p>}
                </div>
              </fieldset>
            </Popover>
          )}
        </>
      )}
    </span>
  );
}
