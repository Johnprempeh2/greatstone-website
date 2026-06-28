import PanelFrame from './PanelFrame.jsx';

// Saved sections: a reusable named-block library. App owns the data + mutations; this renders the library
// (Insert a copy into the current page / Rename / Remove) and a block browser (pick a page → Save one of
// its blocks). Nothing here touches Puck — Insert is a pure store append handled in App, then the editor
// re-reads it on its next mount.
export default function SavedSectionsPanel({
  sections = [], pages = {}, order = [], current,
  browseSlug, browseBlocks = [], labelFor,
  onBrowse, onSave, onInsert, onRename, onRemove, onClose, embedded,
}) {
  const title = (slug) => (pages[slug] && pages[slug].title) || slug;
  const label = (type) => (labelFor && labelFor(type)) || type;
  const currentTitle = title(current);

  return (
    <PanelFrame embedded={embedded} label={<>Saved sections {sections.length ? <span className="gs-panel-count">{sections.length}</span> : null}</>} name="Saved sections" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>
          Save a configured block once and reuse it anywhere. Browse a page below and <strong>Save</strong> a
          block to your library, then <strong>Insert</strong> a copy into a page — it lands at the bottom,
          ready to drag into place in the editor. Each insert is an independent copy.
        </p>

        <h3 className="gs-ss-h">Your saved sections</h3>
        {sections.length === 0 ? (
          <p className="gs-ss-empty" role="status">No saved sections yet. Browse a page below and save a block to reuse it anywhere.</p>
        ) : (
          <ul className="gs-ss-list">
            {sections.map((sec) => (
              <li className="gs-ss-row" key={sec.id}>
                <div className="gs-ss-main">
                  <span className="gs-ss-label">{sec.label}</span>
                  <span className="gs-ss-chip">{label(sec.type)}</span>
                </div>
                <div className="gs-ss-acts">
                  <button type="button" className="gs-btn primary sm" onClick={() => onInsert(sec.id)} aria-label={'Insert “' + sec.label + '” into ' + currentTitle}>Insert into “{currentTitle}”</button>
                  <button type="button" className="gs-btn ghost sm" onClick={() => onRename(sec.id)} aria-label={'Rename “' + sec.label + '”'}>Rename</button>
                  <button type="button" className="gs-btn ghost sm gs-page-del" onClick={() => onRemove(sec.id)} aria-label={'Remove “' + sec.label + '”'}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <h3 className="gs-ss-h gs-ss-h2">Save a block from a page</h3>
        <div className="gs-ss-browse">
          <label className="gs-ss-pickl">
            <span>Page</span>
            <select value={browseSlug || ''} onChange={(e) => onBrowse(e.target.value)} aria-label="Page to browse for blocks">
              {order.map((slug) => <option key={slug} value={slug}>{title(slug)}</option>)}
            </select>
          </label>
        </div>
        {browseBlocks.length === 0 ? (
          <p className="gs-ss-empty">This page has no blocks to save.</p>
        ) : (
          <ul className="gs-ss-list">
            {browseBlocks.map((b) => (
              <li className="gs-ss-row" key={b.id}>
                <div className="gs-ss-main">
                  <span className="gs-ss-label">{label(b.type)}</span>
                  {b.summary ? <span className="gs-ss-summary">{b.summary}</span> : null}
                </div>
                <button type="button" className="gs-btn ghost sm" onClick={() => onSave({ type: b.type, props: b.props })} aria-label={'Save the ' + label(b.type) + ' block from ' + title(browseSlug)}>Save</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PanelFrame>
  );
}
