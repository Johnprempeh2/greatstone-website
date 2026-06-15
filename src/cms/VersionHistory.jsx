// Version history: every publish snapshots the page. Restore rolls the editor back to any
// snapshot (which you then re-publish), so a bad edit is never more than two clicks from
// undone. Interim store is localStorage; in production these are the Laravel page snapshots.
function when(ts) {
  const d = new Date(ts);
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
  if (diff < 86400) return Math.floor(diff / 3600) + ' h ago';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function VersionHistory({ versions = [], onRestore, onClose }) {
  return (
    <aside className="gs-panel" role="dialog" aria-label="Version history">
      <div className="gs-panel-head">
        <h3>Version history</h3>
        <button className="gs-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="gs-panel-body">
        {versions.length === 0 && <p className="gs-empty">No snapshots yet. Publishing the page saves one here.</p>}
        <ol className="gs-versions">
          {versions.map((v, i) => (
            <li className="gs-version" key={v.id || v.ts}>
              <div className="gs-version-dot" aria-hidden="true" />
              <div className="gs-version-main">
                <div className="gs-version-top">
                  <span className="gs-version-label">{v.label || 'Published'}</span>
                  {i === 0 && <span className="gs-version-tag">latest</span>}
                </div>
                <div className="gs-version-when">{when(v.ts)}{v.by ? ' · ' + v.by : ''}</div>
              </div>
              <button className="gs-btn ghost sm" onClick={() => onRestore(v)}>Restore</button>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
