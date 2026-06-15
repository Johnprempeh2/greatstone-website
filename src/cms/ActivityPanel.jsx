// Activity: the page's governance audit trail — who moved it through draft → review → approved →
// published, and when. The store captured statusHistory all along (+ approvedBy) but nothing showed
// it; this surfaces it as a read-only timeline. Distinct from History (which restores version
// snapshots): Activity is the accountability log. In production this maps to the Laravel audit log.
const STATUS_LABEL = { draft: 'Draft', review: 'In review', approved: 'Approved', published: 'Published' };

function when(ts) {
  const d = new Date(ts);
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
  if (diff < 86400) return Math.floor(diff / 3600) + ' h ago';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function eventLabel(from, to) {
  if (to === 'review') return 'Submitted for review';
  if (to === 'approved') return 'Approved';
  if (to === 'published') return 'Published';
  if (to === 'draft') return from === 'published' ? 'Unpublished — back to draft' : 'Returned to draft';
  return (STATUS_LABEL[from] || from) + ' → ' + (STATUS_LABEL[to] || to);
}

export default function ActivityPanel({ statusHistory = [], status, approvedBy, onClose }) {
  const events = statusHistory.slice().reverse(); // newest first
  return (
    <aside className="gs-panel" role="dialog" aria-label="Activity">
      <div className="gs-panel-head">
        <h3>Activity</h3>
        <button className="gs-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="gs-panel-body">
        <div className="gs-activity-now">
          <span className="gs-activity-dot" data-status={status} aria-hidden="true" />
          <span>Currently <strong>{STATUS_LABEL[status] || status}</strong>{approvedBy ? ' · approved by ' + approvedBy : ''}</span>
        </div>
        {events.length === 0 && <p className="gs-empty">No activity yet. Submitting for review, approving and publishing are recorded here with who and when.</p>}
        <ol className="gs-versions">
          {events.map((e, i) => (
            <li className="gs-version" key={e.ts + '-' + i}>
              <div className="gs-version-dot" aria-hidden="true" />
              <div className="gs-version-main">
                <div className="gs-version-top">
                  <span className="gs-version-label">{eventLabel(e.from, e.to)}</span>
                  {i === 0 && <span className="gs-version-tag">latest</span>}
                </div>
                <div className="gs-version-when">{when(e.ts)}{e.by ? ' · ' + e.by : ''}</div>
                {e.note ? <div className="gs-activity-note">“{e.note}”</div> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
