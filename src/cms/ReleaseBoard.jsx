// Releases: the site-wide governance + CHANGE-REVIEW view. The top "Changes to review" queue shows every
// page with unpublished edits (drift) or never published — what changed since it went live — so a lead can
// APPROVE (publish that page's draft) or DISCARD (revert to the live version) without opening each one.
// Below, the full per-page publish-state overview. Classification + diffs come from buildReviewQueue (App).
import { useState, useEffect } from 'react';
import PanelFrame from './PanelFrame.jsx';
import { reviewBulkActions } from '../lib/review-bulk.mjs';

const STATUS = { draft: 'Draft', review: 'In review', approved: 'Approved', published: 'Published' };

function when(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
  if (diff < 86400) return Math.floor(diff / 3600) + ' h ago';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// plain-language one-liner from a version-diff: "1 block edited · 1 added"
function summarise(diff) {
  if (!diff) return '';
  const c = diff.counts, parts = [];
  if (c.changed) parts.push(c.changed + (c.changed > 1 ? ' blocks edited' : ' block edited'));
  if (c.added) parts.push(c.added + ' added');
  if (c.removed) parts.push(c.removed + ' removed');
  if (c.moved) parts.push(c.moved + ' reordered');
  if (diff.titleChanged) parts.push('title changed');
  return parts.join(' · ') || 'no content change';
}

export default function ReleaseBoard({ order, pages, current, review, canPublish, onApprove, onDiscard, onApproveMany, onDiscardMany, onOpen, onClose, embedded }) {
  const r = review || { items: [], review: [], counts: {} };
  const items = r.items || [];
  const queue = r.review || [];
  const counts = items.reduce((m, it) => { m[it.status] = (m[it.status] || 0) + 1; return m; }, {});

  // multi-select over the review queue (mirrors PagesPanel). The queue IS the full selectable set.
  const eligibleSlugs = queue.map((it) => it.slug);
  const [selected, setSelected] = useState(() => new Set());
  const toggle = (slug) => setSelected((prev) => { const next = new Set(prev); next.has(slug) ? next.delete(slug) : next.add(slug); return next; });
  const toggleAll = () => setSelected((prev) => (eligibleSlugs.length > 0 && eligibleSlugs.every((s) => prev.has(s)) ? new Set() : new Set(eligibleSlugs)));
  // drop selections that leave the queue (page published or reverted) so a selection never points at a ghost.
  // Keyed on `queue` identity (not queue.length): the report memo rebuilds the array on every page change, so an
  // equal-length membership swap still re-runs the prune (a length key would miss it and strand a ghost slug).
  useEffect(() => { setSelected((prev) => { const next = new Set([...prev].filter((s) => eligibleSlugs.includes(s))); return next.size === prev.size ? prev : next; }); }, [queue]); // eslint-disable-line react-hooks/exhaustive-deps
  const acts = reviewBulkActions(queue, [...selected]);
  const clearSel = () => setSelected(new Set());

  return (
    <PanelFrame embedded={embedded} label={<>Releases {queue.length ? <span className="gs-panel-count">{queue.length}</span> : null}</>} name="Releases" onClose={onClose}>
      <div className="gs-panel-body">
        <div className="gs-rel-summary">
          <div className="gs-rel-stat"><b>{counts.published || 0}</b><span>Published</span></div>
          <div className="gs-rel-stat"><b>{counts.review || 0}</b><span>In review</span></div>
          <div className="gs-rel-stat"><b>{counts.approved || 0}</b><span>Approved</span></div>
          <div className="gs-rel-stat"><b>{counts.draft || 0}</b><span>Draft</span></div>
        </div>

        <div className="gs-rev-head-row">
          <h3 className="gs-cs-h" style={{ marginTop: 18 }}>Changes to review {queue.length ? <span className="gs-cs-sub">{queue.length}</span> : null}</h3>
          {canPublish && queue.length > 0 ? (
            <label className="gs-page-selectall" title="Select all changes">
              <input type="checkbox" aria-label="Select all changes"
                checked={eligibleSlugs.every((s) => selected.has(s))}
                ref={(el) => { if (el) el.indeterminate = eligibleSlugs.some((s) => selected.has(s)) && !eligibleSlugs.every((s) => selected.has(s)); }}
                onChange={toggleAll} />
              <span className="gs-selectall-lbl">Select all</span>
            </label>
          ) : null}
        </div>
        {/* persistent live region: always mounted (when canPublish) so even the FIRST selection is announced
            (a live region inserted already-populated is not reliably read). The visible count below is not a
            live region, to avoid a double announcement. */}
        {canPublish ? <span className="gs-sr-only" aria-live="polite">{selected.size ? selected.size + ' selected' : ''}</span> : null}
        {canPublish && selected.size > 0 ? (
          <div className="gs-bulkbar" role="region" aria-label="Bulk review actions">
            <span className="gs-bulkbar-n">{selected.size} selected</span>
            <button className="gs-btn primary sm" disabled={acts.approvable === 0} onClick={() => { onApproveMany(acts.approveSlugs); clearSel(); }}>Approve selected ({acts.approvable})</button>
            <button className="gs-btn ghost sm" disabled={acts.discardable === 0} onClick={() => { onDiscardMany(acts.discardSlugs); clearSel(); }}>Discard selected ({acts.discardable})</button>
            <button className="gs-btn ghost sm" onClick={clearSel}>Deselect</button>
          </div>
        ) : null}
        {queue.length === 0 ? (
          <p className="gs-la-clean" role="status">✓ Everything live is up to date. No edits waiting for review.</p>
        ) : (
          <ul className="gs-rev-list">
            {queue.map((it) => {
              const hasDetail = it.diff && (it.diff.changed.length || it.diff.added.length || it.diff.removed.length || it.diff.moved.length);
              return (
                <li key={it.slug} className={'gs-rev-row' + (it.slug === current ? ' is-current' : '')}>
                  <div className="gs-rev-head">
                    {canPublish ? (
                      <label className="gs-page-select">
                        <input type="checkbox" checked={selected.has(it.slug)} onChange={() => toggle(it.slug)} aria-label={'Select ' + it.title} />
                      </label>
                    ) : null}
                    <button className="gs-rev-title" onClick={() => onOpen(it.slug)} title="Open this page">{it.title}</button>
                    <span className={'gs-page-status gs-st-' + it.status} title={STATUS[it.status] || it.status}><span className="gs-dot" />{STATUS[it.status] || it.status}</span>
                  </div>
                  <p className="gs-rev-what">
                    {it.kind === 'drift'
                      ? <>Unpublished edits: {summarise(it.diff)}{it.lastPub ? ' · live version from ' + when(it.lastPub.ts) : ''}</>
                      : <>Never published · {it.blocks} block{it.blocks === 1 ? '' : 's'} ready to go live</>}
                  </p>
                  {hasDetail ? (
                    <details className="gs-rev-detail">
                      <summary>What changed</summary>
                      <ul>
                        {it.diff.changed.map((b, i) => <li key={'c' + i}><span className="gs-la-pill is-changed">edited</span> {b.type}{b.fields && b.fields.length ? ' (' + b.fields.map((f) => f.path).join(', ') + ')' : ''}</li>)}
                        {it.diff.added.map((b, i) => <li key={'a' + i}><span className="gs-la-pill is-orphan">added</span> {b.type}</li>)}
                        {it.diff.removed.map((b, i) => <li key={'x' + i}><span className="gs-la-pill is-broken">removed</span> {b.type}</li>)}
                        {it.diff.moved.map((b, i) => <li key={'m' + i}><span className="gs-la-pill is-recoverable">reordered</span> {b.type}</li>)}
                      </ul>
                    </details>
                  ) : null}
                  <div className="gs-rev-acts">
                    {canPublish
                      ? <button className="gs-btn primary sm" onClick={() => onApprove(it.slug)}>{it.kind === 'drift' ? 'Approve & publish' : 'Publish'}</button>
                      : <span className="gs-rev-locked">An admin publishes these</span>}
                    {it.kind === 'drift' && canPublish ? <button className="gs-btn ghost sm" onClick={() => onDiscard(it.slug)}>Discard edits</button> : null}
                    <button className="gs-btn ghost sm" onClick={() => onOpen(it.slug)}>Open</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <h3 className="gs-cs-h" style={{ marginTop: 22 }}>All pages</h3>
        <ul className="gs-rel-list">
          {items.length === 0 ? <li className="gs-empty">No pages yet. Create one from the Pages panel to start.</li> : items.map((it) => (
            <li key={it.slug} className={'gs-rel-row' + (it.slug === current ? ' is-current' : '')}>
              <button className="gs-rel-open" onClick={() => onOpen(it.slug)} title="Open this page">
                <span className="gs-rel-title">{it.title}{it.kind === 'drift' ? <em className="gs-rel-drift" title="Has unpublished changes">unpublished</em> : null}</span>
                <span className="gs-rel-meta">{it.lastPub ? 'Published ' + when(it.lastPub.ts) + (it.lastPub.by ? ' · ' + it.lastPub.by : '') : it.everPublished ? 'Published' : 'Never published'}</span>
              </button>
              <span className={'gs-page-status gs-st-' + it.status} title={STATUS[it.status] || it.status}>
                <span className="gs-dot" />{STATUS[it.status] || it.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </PanelFrame>
  );
}
