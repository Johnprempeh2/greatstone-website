import { useState, useRef, useEffect, useCallback } from 'react';
import { createUsePuck } from '@measured/puck';
import { SECTION_SURFACES, SECTION_ACCENTS, SECTION_SPACES, SURROUNDS, PADS, TEXT_SCALES } from '../lib/block-style.mjs';
import { CTA_SIZES } from '../lib/cta-style.mjs';
import { RT_COLORS, RT_HIGHLIGHTS, RT_HEX } from '../lib/richtext-marks.mjs';
import {
  capsFor, ALIGNS,
  nextSection, sectionValue, nextAppearance, appearanceValue, nextCta, ctaValue, nextAlign, alignValue,
} from '../lib/context-bar-model.mjs';
import { focusedEditor, activeMarks, applyMark, applyColor, applyHighlight, applyList, applyIndent, clearFormat } from '../lib/rich-text-format.mjs';

// The universal editing dashboard: a tabbed strip pinned as the second row of the editor top bar, Word/Canva
// style. THREE tabs:
//   Text       — formats whatever rich-text field you are editing (bold/italic/underline, brand colour, a
//                highlight "text box", bullets, indent). Works on ANY text field, in any block; the caret lives
//                in the side-panel field (Puck's on-canvas text is plaintext-only), so this drives that field.
//   Background — the selected BLOCK's surface band + palette accent.
//   Layout     — the selected block's alignment, spacing, surround/padding, text size and button size.
//
// Everything is enum-only and writes through the tested resolvers (block controls) or the shared, sanitised
// rich-text ops (text controls), so undo/redo + autosave + the side panel all stay in lockstep and no new
// security surface is introduced. Rendered INSIDE Puck's context (headerActions), lazy, editor-only.
const usePuckSel = createUsePuck();

// Puck REMOUNTS the headerActions subtree on every edit (App autosaves -> new inline overrides object), wiping
// component state. Persist the one bit of UI state (the active tab) in module scope so it survives the remounts.
let activeTabPersist = 'text';

export default function ContextBar() {
  const selectedItem = usePuckSel((s) => s.selectedItem);
  const dispatch = usePuckSel((s) => s.dispatch);
  const getSelectorForId = usePuckSel((s) => s.getSelectorForId);
  const [tab, setTabState] = useState(activeTabPersist);
  const setTab = useCallback((t) => { activeTabPersist = t; setTabState(t); }, []);
  // bump on selectionchange so the Text tab reflects the caret's active marks (bold/colour/highlight)
  const [, setSelTick] = useState(0);
  useEffect(() => {
    const on = () => setSelTick((n) => (n + 1) & 1023);
    document.addEventListener('selectionchange', on);
    return () => document.removeEventListener('selectionchange', on);
  }, []);

  const noBlur = (e) => e.preventDefault(); // keep the editor's live selection alive while a control is pressed

  // ── Text tab: drive the focused rich-text field ──────────────────────────────────────────────────────────
  const ed = focusedEditor();
  const marks = activeMarks(ed);
  const doMark = (m) => { const e = focusedEditor(); if (e) applyMark(e, m); };
  const doColor = (cls) => { const e = focusedEditor(); if (e) applyColor(e, cls); };
  const doHi = (cls) => { const e = focusedEditor(); if (e) applyHighlight(e, cls); };
  const doList = () => { const e = focusedEditor(); if (e) applyList(e); };
  const doIndent = (out) => { const e = focusedEditor(); if (e) applyIndent(e, out); };
  const doClear = () => { const e = focusedEditor(); if (e) clearFormat(e); };

  const textTab = (
    <div className="gs-ctx-panel" role="group" aria-label="Text formatting">
      {!ed ? <span className="gs-ctx-hint">Click into any text on the page, then format it here.</span> : null}
      <span className="gs-ctx-group">
        <button type="button" className={'gs-ctx-btn' + (marks.bold ? ' is-on' : '')} aria-pressed={marks.bold} title="Bold (Cmd/Ctrl+B)" aria-label="Bold" disabled={!ed} onMouseDown={noBlur} onClick={() => doMark('bold')}><b>B</b></button>
        <button type="button" className={'gs-ctx-btn' + (marks.italic ? ' is-on' : '')} aria-pressed={marks.italic} title="Italic (Cmd/Ctrl+I)" aria-label="Italic" disabled={!ed} onMouseDown={noBlur} onClick={() => doMark('italic')}><i>I</i></button>
        <button type="button" className={'gs-ctx-btn' + (marks.underline ? ' is-on' : '')} aria-pressed={marks.underline} title="Underline (Cmd/Ctrl+U)" aria-label="Underline" disabled={!ed} onMouseDown={noBlur} onClick={() => doMark('underline')}><u>U</u></button>
      </span>
      <span className="gs-ctx-sep" aria-hidden="true" />
      <span className="gs-ctx-group" role="group" aria-label="Text colour">
        <span className="gs-ctx-glabel">Colour</span>
        {RT_COLORS.map((c) => {
          const on = marks.colorClass === c.className;
          return <button key={'c' + c.id} type="button" className={'gs-ctx-sw' + (c.id ? '' : ' is-clear') + (on ? ' is-on' : '')} aria-pressed={on}
            title={'Text colour: ' + c.label} aria-label={'Text colour ' + c.label} disabled={!ed} style={c.id ? { color: RT_HEX[c.id] } : undefined}
            onMouseDown={noBlur} onClick={() => doColor(c.className)}>A</button>;
        })}
      </span>
      <span className="gs-ctx-sep" aria-hidden="true" />
      <span className="gs-ctx-group" role="group" aria-label="Highlight">
        <span className="gs-ctx-glabel">Highlight</span>
        {RT_HIGHLIGHTS.map((h) => {
          const on = marks.hiClass === h.className;
          return <button key={'h' + h.id} type="button" className={'gs-ctx-sw gs-ctx-hi' + (h.id ? '' : ' is-clear') + (on ? ' is-on' : '')} aria-pressed={on}
            title={'Highlight: ' + h.label} aria-label={'Highlight ' + h.label} disabled={!ed} style={h.id ? { background: RT_HEX[h.colour], color: '#0e1611', borderRadius: h.shape === 'pill' ? '999px' : undefined } : undefined}
            onMouseDown={noBlur} onClick={() => doHi(h.className)}>{h.id ? '■' : '✕'}</button>;
        })}
      </span>
      <span className="gs-ctx-sep" aria-hidden="true" />
      <span className="gs-ctx-group" role="group" aria-label="Lists and indent">
        <button type="button" className="gs-ctx-btn" title="Bulleted list" aria-label="Bulleted list" disabled={!ed} onMouseDown={noBlur} onClick={doList}>&#8226;&#8226;</button>
        <button type="button" className="gs-ctx-btn" title="Decrease indent" aria-label="Decrease indent" disabled={!ed} onMouseDown={noBlur} onClick={() => doIndent(true)}>&#8676;</button>
        <button type="button" className="gs-ctx-btn" title="Increase indent" aria-label="Increase indent" disabled={!ed} onMouseDown={noBlur} onClick={() => doIndent(false)}>&#8677;</button>
      </span>
      <span className="gs-ctx-sep" aria-hidden="true" />
      <button type="button" className="gs-ctx-btn gs-ctx-clear" title="Clear formatting" aria-label="Clear formatting" disabled={!ed} onMouseDown={noBlur} onClick={doClear}>Clear</button>
    </div>
  );

  // ── Block tabs: need a selected block ────────────────────────────────────────────────────────────────────
  const props = selectedItem ? (selectedItem.props || {}) : null;
  const type = selectedItem ? selectedItem.type : null;
  const section = props ? props._section : null;
  const appearance = props ? props.appearance : null;
  const ctaStyle = props ? props.ctaStyle : null;
  const caps = type ? capsFor(type) : {};

  const setProp = (propName, value) => {
    if (!props) return;
    const sel = getSelectorForId(props.id);
    if (!sel) return;
    dispatch({ type: 'replace', destinationIndex: sel.index, destinationZone: sel.zone, data: { ...selectedItem, props: { ...props, [propName]: value } } });
  };
  const setSection = (key, id) => setProp('_section', nextSection(section, key, id));
  const setAppearance = (key, id) => setProp('appearance', nextAppearance(appearance, key, id));
  const setCta = (key, id) => setProp('ctaStyle', nextCta(ctaStyle, key, id));

  const pills = (label, options, current, onPick, titlePrefix) => (
    <span className="gs-ctx-group" role="group" aria-label={label}>
      <span className="gs-ctx-glabel">{label}</span>
      {options.map((o) => {
        const on = current === o.id;
        return <button key={o.id} type="button" className={'gs-ctx-pill' + (on ? ' is-on' : '')} aria-pressed={on}
          title={titlePrefix + ': ' + o.label} onMouseDown={noBlur} onClick={() => onPick(o.id)}>{o.label}</button>;
      })}
    </span>
  );
  const selectField = (label, options, current, onPick) => (
    <label className="gs-ctx-field"><span>{label}</span>
      <select value={current} onChange={(e) => onPick(e.target.value)}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );

  const backgroundTab = !selectedItem ? (
    <div className="gs-ctx-panel"><span className="gs-ctx-hint">Select a block to set its background.</span></div>
  ) : (
    <div className="gs-ctx-panel" role="group" aria-label="Block background">
      <span className="gs-ctx-label" title="The selected block">{type}</span>
      <span className="gs-ctx-sep" aria-hidden="true" />
      {pills('Background', SECTION_SURFACES, sectionValue(section, 'surface'), (id) => setSection('surface', id), 'Background')}
      <span className="gs-ctx-sep" aria-hidden="true" />
      {pills('Accent', SECTION_ACCENTS, sectionValue(section, 'accent'), (id) => setSection('accent', id), 'Accent')}
      {caps.appearance ? (
        <>
          <span className="gs-ctx-sep" aria-hidden="true" />
          {selectField('Text box', SURROUNDS, appearanceValue(appearance, 'surround'), (v) => setAppearance('surround', v))}
        </>
      ) : null}
    </div>
  );

  const layoutTab = !selectedItem ? (
    <div className="gs-ctx-panel"><span className="gs-ctx-hint">Select a block to change its layout.</span></div>
  ) : (
    <div className="gs-ctx-panel" role="group" aria-label="Block layout">
      <span className="gs-ctx-label" title="The selected block">{type}</span>
      {caps.align ? (<><span className="gs-ctx-sep" aria-hidden="true" />{pills('Align', ALIGNS, alignValue(props.align, type), (id) => setProp('align', nextAlign(props.align, id, type)), 'Align')}</>) : null}
      <span className="gs-ctx-sep" aria-hidden="true" />
      {selectField('Space above', SECTION_SPACES, sectionValue(section, 'spaceTop'), (v) => setSection('spaceTop', v))}
      {selectField('Space below', SECTION_SPACES, sectionValue(section, 'spaceBottom'), (v) => setSection('spaceBottom', v))}
      {caps.appearance ? (
        <>
          {selectField('Padding', PADS, appearanceValue(appearance, 'pad'), (v) => setAppearance('pad', v))}
          {selectField('Text size', TEXT_SCALES, appearanceValue(appearance, 'textScale'), (v) => setAppearance('textScale', v))}
        </>
      ) : null}
      {caps.cta ? (<>{pills('Button size', CTA_SIZES, ctaValue(ctaStyle, 'size'), (id) => setCta('size', id), 'Button size')}</>) : null}
    </div>
  );

  return (
    <div className="gs-ctx-bar" role="toolbar" aria-label="Editing dashboard">
      <div className="gs-ctx-tabs" role="tablist" aria-label="What to edit">
        <button type="button" role="tab" aria-selected={tab === 'text'} className={'gs-ctx-tab' + (tab === 'text' ? ' is-on' : '')} onMouseDown={noBlur} onClick={() => setTab('text')}>Text</button>
        <button type="button" role="tab" aria-selected={tab === 'background'} className={'gs-ctx-tab' + (tab === 'background' ? ' is-on' : '')} onMouseDown={noBlur} onClick={() => setTab('background')}>Background</button>
        <button type="button" role="tab" aria-selected={tab === 'layout'} className={'gs-ctx-tab' + (tab === 'layout' ? ' is-on' : '')} onMouseDown={noBlur} onClick={() => setTab('layout')}>Layout</button>
      </div>
      {tab === 'text' ? textTab : tab === 'background' ? backgroundTab : layoutTab}
    </div>
  );
}
