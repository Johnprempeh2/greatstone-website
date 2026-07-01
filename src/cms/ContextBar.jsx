import { useState, useRef, useEffect, useCallback } from 'react';
import { createUsePuck } from '@measured/puck';
import { SECTION_SURFACES, SECTION_ACCENTS, SECTION_SPACES, SURROUNDS, PADS } from '../lib/block-style.mjs';
import { CTA_SIZES } from '../lib/cta-style.mjs';
import {
  capsFor, hasTextStyles,
  nextSection, sectionValue, nextAppearance, appearanceValue, nextCta, ctaValue,
} from '../lib/context-bar-model.mjs';

// The universal contextual toolbar: a compact strip pinned as the second row of the editor top bar that reflects
// the CURRENTLY selected block and offers its block-level style controls one click from the top, Canva-style.
//
// Why a strip and not a floating on-canvas bar: Puck runs with the iframe disabled so the sidebar RichTextField
// owns the text caret in the main document; Puck's own on-canvas editing is plaintext-only, so a bar over the
// canvas would have no rich-text selection to format. Text run colour/highlight/B-I-U therefore stay solely in
// RichTextField (the "Text styles" deep-link jumps there); THIS strip governs the selected BLOCK.
//
// Neatness: the two quick, visual choices (Background surface + Accent) stay inline as pills; the denser, less
// frequent controls (spacing, surround/padding, button size) live behind a compact "More" popover so the strip
// stays uncluttered on even the busiest block. Everything is enum-only and writes the SAME props the sidebar
// fields write, via a `replace` dispatch through the tested resolvers, so undo/redo + autosave + the sidebar all
// stay in lockstep and no new sanitiser surface is introduced.
//
// Rendered INSIDE Puck's context (headerActions), like UndoRedo, so createUsePuck works. Lives in its own module
// so it loads with the lazy editor chunk and never touches the public bundle.
const usePuckSel = createUsePuck();

// Puck RE-MOUNTS the headerActions override subtree on every edit (App autosaves → setState → a fresh inline
// `overrides={{...}}` object → Puck remounts the override components). So component-local state here is wiped on
// each keystroke. We persist the one piece of UI state (is the More popover open?) in module scope so it survives
// those remounts; the panel's control VALUES are always derived from the Puck selection, so they need no persist.
let moreOpenPersist = false;

export default function ContextBar() {
  const selectedItem = usePuckSel((s) => s.selectedItem);
  const dispatch = usePuckSel((s) => s.dispatch);
  const getSelectorForId = usePuckSel((s) => s.getSelectorForId);
  const [moreOpen, setMoreOpenState] = useState(moreOpenPersist);
  const setMoreOpen = useCallback((v) => {
    setMoreOpenState((cur) => { const nv = typeof v === 'function' ? v(cur) : v; moreOpenPersist = nv; return nv; });
  }, []);
  const moreWrapRef = useRef(null);
  const moreBtnRef = useRef(null);

  // close the More popover on Escape (return focus to the trigger) or a click outside it. No auto-focus into the
  // panel: because the subtree remounts on every edit, moving focus on open would yank it away mid-change.
  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e) => { if (moreWrapRef.current && !moreWrapRef.current.contains(e.target)) setMoreOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setMoreOpen(false); moreBtnRef.current && moreBtnRef.current.focus(); } };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [moreOpen, setMoreOpen]);

  // close a stale popover only when the user selects a genuinely DIFFERENT block. Editing a value dispatches a
  // `replace` that momentarily re-resolves the selection (same id), which must NOT close the popover mid-edit;
  // tracking the previous non-null id ignores those null/same-id blips and reacts only to a real block switch.
  const selId = selectedItem && selectedItem.props ? selectedItem.props.id : null;
  const prevIdRef = useRef(selId);
  useEffect(() => {
    if (selId && selId !== prevIdRef.current) setMoreOpen(false);
    if (selId) prevIdRef.current = selId;
  }, [selId]);

  if (!selectedItem) {
    return (
      <div className="gs-ctx-bar is-empty" role="toolbar" aria-label="Block styling">
        <span className="gs-ctx-hint">Select a block to style it.</span>
      </div>
    );
  }

  const type = selectedItem.type;
  const props = selectedItem.props || {};
  const section = props._section;
  const appearance = props.appearance;
  const ctaStyle = props.ctaStyle;
  const caps = capsFor(type);

  // one write path for every group: set a prop object on the selected block via a Puck `replace` (goes through
  // the block's own tested resolver on render). getSelectorForId resolves the zone even at page root.
  const setProp = (propName, value) => {
    const sel = getSelectorForId(props.id);
    if (!sel) return;
    dispatch({ type: 'replace', destinationIndex: sel.index, destinationZone: sel.zone, data: { ...selectedItem, props: { ...props, [propName]: value } } });
  };
  const setSection = (key, id) => setProp('_section', nextSection(section, key, id));
  const setAppearance = (key, id) => setProp('appearance', nextAppearance(appearance, key, id));
  const setCta = (key, id) => setProp('ctaStyle', nextCta(ctaStyle, key, id));

  // deep-link to the block's inline text formatting (colour/highlight/B-I-U live in the sidebar Body field, the
  // only place a text caret exists) rather than duplicate a second colour system on the strip
  const openTextStyles = () => {
    const el = document.querySelector('[data-tour="rt-edit"]');
    if (el) { try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch { /* ignore */ } el.focus(); }
  };
  const noBlur = (e) => e.preventDefault(); // keep any live text selection alive while a strip control is pressed

  const pills = (label, options, current, onPick, titlePrefix) => (
    <span className="gs-ctx-group" role="group" aria-label={label}>
      <span className="gs-ctx-glabel">{label}</span>
      {options.map((o) => {
        const on = current === o.id;
        return (
          <button key={o.id} type="button" className={'gs-ctx-pill' + (on ? ' is-on' : '')} aria-pressed={on}
            title={titlePrefix + ': ' + o.label} onMouseDown={noBlur} onClick={() => onPick(o.id)}>{o.label}</button>
        );
      })}
    </span>
  );

  return (
    <div className="gs-ctx-bar" role="toolbar" aria-label={'Style the selected ' + type + ' block'}>
      <span className="gs-ctx-label" title="The selected block">{type}</span>
      <span className="gs-ctx-sep" aria-hidden="true" />
      {pills('Background', SECTION_SURFACES, sectionValue(section, 'surface'), (id) => setSection('surface', id), 'Background')}
      <span className="gs-ctx-sep" aria-hidden="true" />
      {pills('Accent', SECTION_ACCENTS, sectionValue(section, 'accent'), (id) => setSection('accent', id), 'Accent')}
      <span className="gs-ctx-sep" aria-hidden="true" />
      {/* the denser, less-frequent controls live behind a compact popover so the strip stays neat */}
      <span className="gs-ctx-more" ref={moreWrapRef}>
        <button ref={moreBtnRef} type="button" className={'gs-ctx-pill gs-ctx-morebtn' + (moreOpen ? ' is-on' : '')}
          aria-haspopup="true" aria-expanded={moreOpen} onMouseDown={noBlur} onClick={() => setMoreOpen((o) => !o)}>More ▾</button>
        {moreOpen ? (
          <div className="gs-ctx-pop" role="group" aria-label="More block styles">
            <div className="gs-ctx-poprow">
              <label className="gs-ctx-field"><span>Space above</span>
                <select value={sectionValue(section, 'spaceTop')} onChange={(e) => setSection('spaceTop', e.target.value)}>
                  {SECTION_SPACES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
              <label className="gs-ctx-field"><span>Space below</span>
                <select value={sectionValue(section, 'spaceBottom')} onChange={(e) => setSection('spaceBottom', e.target.value)}>
                  {SECTION_SPACES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
            </div>
            {caps.appearance ? (
              <div className="gs-ctx-poprow">
                <label className="gs-ctx-field"><span>Text box</span>
                  <select value={appearanceValue(appearance, 'surround')} onChange={(e) => setAppearance('surround', e.target.value)}>
                    {SURROUNDS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
                <label className="gs-ctx-field"><span>Padding</span>
                  <select value={appearanceValue(appearance, 'pad')} onChange={(e) => setAppearance('pad', e.target.value)}>
                    {PADS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </label>
              </div>
            ) : null}
            {caps.cta ? (
              <div className="gs-ctx-poprow">
                {pills('Button size', CTA_SIZES, ctaValue(ctaStyle, 'size'), (id) => setCta('size', id), 'Button size')}
              </div>
            ) : null}
          </div>
        ) : null}
      </span>
      {hasTextStyles(type) ? (
        <>
          <span className="gs-edit-spacer" aria-hidden="true" />
          <button type="button" className="gs-ctx-link" title="Jump to inline text formatting (bold, colour, highlight)"
            onMouseDown={noBlur} onClick={openTextStyles}><span aria-hidden="true">✎</span> Text styles</button>
        </>
      ) : null}
    </div>
  );
}
