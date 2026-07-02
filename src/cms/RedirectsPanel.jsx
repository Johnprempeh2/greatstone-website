import { useState } from 'react';
import PanelFrame from './PanelFrame.jsx';

// Redirects manager: view, add, repoint and remove the slug-rename forwarding table (state.redirects).
// App owns the table + mutations (listRedirects(state) → rows, addRedirect/setRedirect/removeRedirect);
// this is presentational — every status comes pre-computed. Reuses the gs-la-pill colours (text+colour).
const STATUS = {
  ok: { label: 'Active', pill: 'is-recoverable', say: (t) => 'forwards to “' + t + '”' },
  'target-missing': { label: 'Dead end', pill: 'is-broken', say: () => 'its target no longer exists. Repoint or remove it' },
  shadowed: { label: 'Shadowed', pill: 'is-orphan', say: (_t, f) => '“' + f + '” is a live page now, so this redirect never fires' },
};
const ERRORS = {
  empty: 'Choose both an old path and a destination page.',
  same: 'The old path and the destination are the same.',
  'from-reserved': 'That path is a fixed route and can’t be redirected.',
  'from-live': 'That path is a live page. A redirect from it would never fire. Rename or delete the page instead.',
  exists: 'A redirect from that path already exists. Edit it in the table below.',
  cycle: 'That would create a redirect loop.',
};

export default function RedirectsPanel({ rows = [], pages = {}, order = [], error = null, onAdd, onRepoint, onRemove, onClose, embedded }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const title = (slug) => (pages[slug] && pages[slug].title) || slug;
  const submit = (e) => { e.preventDefault(); if (onAdd(from.trim(), to.trim())) { setFrom(''); setTo(''); } };

  return (
    <PanelFrame embedded={embedded} label={<>Redirects {rows.length ? <span className="gs-panel-count">{rows.length}</span> : null}</>} name="Redirects" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>
          When you rename a page’s URL, the old path is kept here so old links still reach it. You can also add
          one by hand, repoint it, or remove a stale one. <strong>Active</strong> redirects forward to a live
          page; <strong>Dead end</strong> ones point at a page that no longer exists; <strong>Shadowed</strong>
          ones can’t fire because their old path is a live page again. Removing an Active redirect may strand
          old links. Link health will flag any that break.
        </p>

        <form className="gs-redir-add" onSubmit={submit} aria-label="Add a redirect">
          <div className="gs-redir-addrow">
            <label className="gs-redir-l">
              <span>Old path (slug)</span>
              <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="e.g. old-services"
                aria-describedby={error ? 'gs-redir-err' : undefined} aria-invalid={error ? true : undefined} />
            </label>
            <span className="gs-redir-arrow" aria-hidden="true">→</span>
            <label className="gs-redir-l">
              <span>Forward to page</span>
              <select value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Choose a page…</option>
                {order.map((slug) => <option key={slug} value={slug}>{title(slug)}</option>)}
              </select>
            </label>
            <button type="submit" className="gs-btn primary sm">Add redirect</button>
          </div>
          {error && <p id="gs-redir-err" className="gs-redir-err" role="alert">{ERRORS[error] || 'That redirect isn’t valid.'}</p>}
        </form>

        {rows.length === 0 ? (
          <p className="gs-la-clean" role="status">No redirects yet. Renaming a page’s URL adds one automatically, or add one above.</p>
        ) : (
          <div className="gs-redir-tablewrap">
            <table className="gs-redir-table">
              <caption className="gs-sr-only">Redirects: old path, destination, status</caption>
              <thead>
                <tr><th scope="col">Old path</th><th scope="col">Forwards to</th><th scope="col">Status</th><th scope="col"><span className="gs-sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const s = STATUS[r.status] || STATUS['target-missing'];
                  const dest = r.resolved ? title(r.resolved) : r.to;
                  return (
                    <tr key={r.from}>
                      <td><code className="gs-redir-path">/{r.from}</code></td>
                      <td>
                        <select className="gs-redir-to" value={pages[r.to] ? r.to : ''} onChange={(e) => onRepoint(r.from, e.target.value)} aria-label={'Repoint the redirect from ' + r.from}>
                          {!pages[r.to] && <option value="">/{r.to} (missing)</option>}
                          {order.map((slug) => <option key={slug} value={slug}>{title(slug)}</option>)}
                        </select>
                      </td>
                      <td className="gs-redir-status">
                        <span className={'gs-la-pill ' + s.pill}>{s.label}</span>
                        <span className="gs-redir-say">{s.say(dest, r.from)}</span>
                      </td>
                      <td><button type="button" className="gs-btn ghost sm" onClick={() => onRemove(r.from)} aria-label={'Remove the redirect from ' + r.from}>Remove</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PanelFrame>
  );
}
