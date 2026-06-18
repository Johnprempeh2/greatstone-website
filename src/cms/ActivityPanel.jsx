// Activity: the page's governance audit trail — who moved it through draft → review → approved →
// published, and when. The store captured statusHistory all along (+ approvedBy) but nothing showed
// it; this surfaces it as a read-only timeline. Distinct from History (which restores version
// snapshots): Activity is the accountability log. In production this maps to the Laravel audit log.
import PanelFrame from './PanelFrame.jsx';

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
  if (to === 'draft') return from === 'published' ? 'Unpublished, back to draft' : 'Returned to draft';
  return (STATUS_LABEL[from] || from) + ' → ' + (STATUS_LABEL[to] || to);
}

export default function ActivityPanel({ statusHistory = [], status, approvedBy, activity = [], pageTitle, onClose, embedded }) {
  // unified feed: this page's status/governance events + the site-wide catalogue & team audit log
  const pageEvents = statusHistory.map((e) => ({ ts: e.ts, by: e.by, label: eventLabel(e.from, e.to), note: e.note, scope: pageTitle || 'This page' }));
  const siteEvents = (activity || []).map((a) => ({ ts: a.ts, by: a.by, label: a.label, scope: 'Catalogue & team' }));
  const events = pageEvents.concat(siteEvents).sort((a, b) => b.ts - a.ts);
  return (
    <PanelFrame embedded={embedded} label="Activity" onClose={onClose}>
      <div className="gs-panel-body">
        <div className="gs-activity-now">
          <span className="gs-activity-dot" data-status={status} aria-hidden="true" />
          <span>This page is <strong>{STATUS_LABEL[status] || status}</strong>{approvedBy ? ' · approved by ' + approvedBy : ''}</span>
        </div>
        {events.length === 0 && <p className="gs-empty">No activity yet. Page status changes and catalogue/team edits are recorded here with who and when.</p>}
        <ol className="gs-versions">
          {events.map((e, i) => (
            <li className="gs-version" key={e.ts + '-' + i}>
              <div className="gs-version-dot" aria-hidden="true" />
              <div className="gs-version-main">
                <div className="gs-version-top">
                  <span className="gs-version-label">{e.label}</span>
                  {i === 0 && <span className="gs-version-tag">latest</span>}
                </div>
                <div className="gs-version-when">{when(e.ts)}{e.by ? ' · ' + e.by : ''} · <span className="gs-activity-scope">{e.scope}</span></div>
                {e.note ? <div className="gs-activity-note">“{e.note}”</div> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </PanelFrame>
  );
}
