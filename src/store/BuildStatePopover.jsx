// Where a proposal stands, and why, as one control.
//
// ⚠ ONE OF THESE, NOT ONE PER PAGE. The rule it enforces lives in the schema: buildItem THROWS when
// the new state is in BUILD_STATES_NEEDING_WHY and the reason is blank, and that list is FOUR
// states, not just "cancelled". Under consideration, deferred, tabled and cancelled all demand a
// reason. A second copy of this pane on the process page would be a second copy of a rule that has
// already moved once, and this file has a note recording what happened last time a build constant
// was privately duplicated.
//
// ⚠ AND IT SUBMITS BOTH FIELDS TOGETHER. Saving the state alone produces a refusal every single
// time somebody stops a proposal, which is precisely when they least want an argument with the tool.
import React, { useState, useRef } from 'react';
import Popover from './Popover.jsx';
import {
  BUILD_STATES, BUILD_STATE_WORD, BUILD_STATE_MEANS, BUILD_STATES_NEEDING_WHY,
} from '../data/deepdive-schema.mjs';

export default function BuildStatePopover({ build, can, busy, onSave, size = 'md' }) {
  const btn = useRef(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ state: build.state, stateWhy: build.stateWhy || '' });

  const word = BUILD_STATE_WORD[build.state] || build.state;
  if (!can?.can) {
    return <span className={`dd-chip dd-bstate dd-bstate-${build.state}`}>{word}</span>;
  }
  return (
    <>
      <button type="button" ref={btn}
        className={`dd-chip dd-bstate dd-bstate-${build.state} is-set${size === 'sm' ? ' is-sm' : ''}`}
        aria-haspopup="dialog" aria-expanded={open} disabled={busy}
        onClick={() => { setDraft({ state: build.state, stateWhy: build.stateWhy || '' }); setOpen((v) => !v); }}>
        {word}
        <span className="dd-chip-caret" aria-hidden="true">▾</span>
        <span className="gs-sr-only">Change where {build.name} stands</span>
      </button>
      {open && (
        <Popover label={`Where ${build.name} stands`} anchorRef={btn} onClose={() => setOpen(false)}
          onSave={() => onSave(draft)}>
          <label>
            State
            <select value={draft.state}
              onChange={(e) => setDraft((d) => ({ ...d, state: e.target.value }))}>
              {BUILD_STATES.map((b) => <option key={b} value={b}>{BUILD_STATE_WORD[b] || b}</option>)}
            </select>
          </label>
          <p className="dd-pop-say">{BUILD_STATE_MEANS[draft.state]}</p>
          {BUILD_STATES_NEEDING_WHY.includes(draft.state) && (
            <label>
              Why <span style={{ fontWeight: 400 }}>(required)</span>
              <textarea rows="3" value={draft.stateWhy} required
                placeholder="What the decision actually rested on, so somebody can revisit it later knowing that."
                onChange={(e) => setDraft((d) => ({ ...d, stateWhy: e.target.value }))} />
            </label>
          )}
        </Popover>
      )}
    </>
  );
}
