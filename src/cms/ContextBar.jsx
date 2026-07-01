import { createUsePuck } from '@measured/puck';
import { SECTION_SURFACES, SECTION_ACCENTS } from '../lib/block-style.mjs';
import { nextSection, sectionValue, hasTextStyles } from '../lib/context-bar-model.mjs';

// The universal contextual toolbar: a compact strip pinned as the second row of the editor top bar that reflects
// the CURRENTLY selected block and offers its block-level style controls one click from the top, Canva-style.
//
// Why a strip and not a floating on-canvas bar: Puck runs with the iframe disabled so the sidebar RichTextField
// owns the text caret in the main document; Puck's own on-canvas editing is plaintext-only, so a bar over the
// canvas would have no rich-text selection to format. Text run colour/highlight/B-I-U therefore stay solely in
// RichTextField; THIS strip governs the selected BLOCK (its background surface, and later accent/spacing/CTA).
//
// Single source of truth: the strip owns NO state. It reads the selection from Puck and writes the same _section
// prop the sidebar Section field writes, via a `replace` dispatch — so undo/redo, autosave and the sidebar field
// all stay in lockstep automatically, and the value flows through the tested sectionClass() resolver (the block
// re-derives its safe wrapper class on render). It can only ever emit a known enum id (see context-bar-model).
//
// Rendered INSIDE Puck's context (headerActions), like UndoRedo, so createUsePuck works. Lives in its own module
// so it loads with the lazy editor chunk and never touches the public bundle.
const usePuckSel = createUsePuck();

export default function ContextBar() {
  const selectedItem = usePuckSel((s) => s.selectedItem);
  const dispatch = usePuckSel((s) => s.dispatch);
  const getSelectorForId = usePuckSel((s) => s.getSelectorForId);

  if (!selectedItem) {
    return (
      <div className="gs-ctx-bar is-empty" role="toolbar" aria-label="Block styling">
        <span className="gs-ctx-hint">Select a block to style it.</span>
      </div>
    );
  }

  const type = selectedItem.type;
  const section = selectedItem.props && selectedItem.props._section;
  const currentSurface = sectionValue(section, 'surface');
  const currentAccent = sectionValue(section, 'accent');

  // set one Section key on the selected block via a Puck `replace` (goes through the tested sectionClass resolver)
  const setSection = (key, id) => {
    const sel = getSelectorForId(selectedItem.props.id); // Required<{index, zone}> — zone always resolved
    if (!sel) return;
    dispatch({
      type: 'replace',
      destinationIndex: sel.index,
      destinationZone: sel.zone,
      data: { ...selectedItem, props: { ...selectedItem.props, _section: nextSection(section, key, id) } },
    });
  };
  // deep-link to the block's inline text formatting (colour/highlight/B-I-U live in the sidebar Body field, the
  // only place a text caret exists) rather than duplicate a second colour system on the strip
  const openTextStyles = () => {
    const el = document.querySelector('[data-tour="rt-edit"]');
    if (el) { try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch { /* ignore */ } el.focus(); }
  };
  const noBlur = (e) => e.preventDefault(); // keep any live text selection alive while a strip control is pressed

  return (
    <div className="gs-ctx-bar" role="toolbar" aria-label={'Style the selected ' + type + ' block'}>
      <span className="gs-ctx-label" title="The selected block">{type}</span>
      <span className="gs-ctx-sep" aria-hidden="true" />
      <span className="gs-ctx-group" role="group" aria-label="Background surface">
        <span className="gs-ctx-glabel">Background</span>
        {SECTION_SURFACES.map((s) => {
          const on = currentSurface === s.id;
          return (
            <button key={s.id} type="button" className={'gs-ctx-pill' + (on ? ' is-on' : '')} aria-pressed={on}
              title={'Background: ' + s.label} onMouseDown={noBlur} onClick={() => setSection('surface', s.id)}>{s.label}</button>
          );
        })}
      </span>
      <span className="gs-ctx-sep" aria-hidden="true" />
      <span className="gs-ctx-group" role="group" aria-label="Accent colour">
        <span className="gs-ctx-glabel">Accent</span>
        {SECTION_ACCENTS.map((a) => {
          const on = currentAccent === a.id;
          return (
            <button key={a.id} type="button" className={'gs-ctx-pill' + (on ? ' is-on' : '')} aria-pressed={on}
              title={'Accent: ' + a.label} onMouseDown={noBlur} onClick={() => setSection('accent', a.id)}>{a.label}</button>
          );
        })}
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
