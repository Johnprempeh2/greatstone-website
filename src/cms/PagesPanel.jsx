import { useState, useEffect } from 'react';
import PanelFrame from './PanelFrame.jsx';
import { bulkActions } from '../lib/bulk-status.mjs';

// Pages hub (edit mode): every page with its path, section count and status, plus the full set
// of management actions — open, duplicate, rename, reorder, delete — and a status filter so a
// lead can see what's in review at a glance. Status changes happen in the open page's toolbar.
const STATUS = { draft: 'Draft', review: 'In review', approved: 'Approved', published: 'Published' };
const FILTERS = [['all', 'All'], ['draft', 'Draft'], ['review', 'In review'], ['approved', 'Approved'], ['published', 'Published']];

export default function PagesPanel({ order, pages, current, onOpen, onNew, onDelete, onDuplicate, onRename, onMove, onClose, embedded, onBulkStatus, onBulkSchedule, onBulkClearSchedule, onBulkNote, onBulkClearNote, onBulkAssign, onBulkClearAssign, canEdit }) {
  const [filter, setFilter] = useState('all');
  const [bulkDate, setBulkDate] = useState(''); // datetime-local value for the bulk "Set date" action
  const counts = order.reduce((m, s) => { m[pages[s].status] = (m[pages[s].status] || 0) + 1; return m; }, {});
  const shown = order.filter((s) => filter === 'all' || pages[s].status === filter);
  // multi-select (cycle 14, bulk-safe status). Defined after `shown` — toggleAll closes over it.
  const [selected, setSelected] = useState(() => new Set());
  const toggle = (slug) => setSelected((prev) => { const next = new Set(prev); next.has(slug) ? next.delete(slug) : next.add(slug); return next; });
  const toggleAll = () => setSelected((prev) => {
    const allShown = shown.length > 0 && shown.every((s) => prev.has(s));
    return allShown ? new Set([...prev].filter((s) => !shown.includes(s))) : new Set([...prev, ...shown]);
  });
  // drop selected slugs that no longer exist (page deleted/renamed) so a selection never points at a ghost.
  useEffect(() => { setSelected((prev) => { const next = new Set([...prev].filter((s) => pages[s])); return next.size === prev.size ? prev : next; }); }, [order, pages]);

  return (
    <PanelFrame embedded={embedded} label={<>Pages <span className="gs-panel-count">{order.length}</span></>} name="Pages" onClose={onClose}>
      <div className="gs-panel-body">
        <div className="gs-pagefilter">
          {FILTERS.map(([id, label]) => (
            <button key={id} className={'gs-pagefilter-btn' + (filter === id ? ' is-active' : '')} onClick={() => setFilter(id)}>
              {label}{id !== 'all' && counts[id] ? <span className="gs-pagefilter-n">{counts[id]}</span> : null}
            </button>
          ))}
          {canEdit && shown.length > 0 ? (
            <label className="gs-page-selectall" title="Select all visible pages">
              <input type="checkbox" aria-label="Select all visible pages"
                checked={shown.every((s) => selected.has(s))}
                ref={(el) => { if (el) el.indeterminate = shown.some((s) => selected.has(s)) && !shown.every((s) => selected.has(s)); }}
                onChange={toggleAll} />
            </label>
          ) : null}
        </div>
        <ul className="gs-pages">
          {shown.map((slug, i) => {
            const p = pages[slug];
            const sections = (p.data && p.data.content && p.data.content.length) || 0;
            const realIndex = order.indexOf(slug);
            return (
              <li key={slug} className={'gs-page-row' + (slug === current ? ' is-current' : '')}>
                {canEdit ? (
                  <label className="gs-page-select">
                    <input type="checkbox" checked={selected.has(slug)} onChange={() => toggle(slug)} aria-label={'Select ' + p.title} />
                  </label>
                ) : null}
                <button className="gs-page-open" onClick={() => onOpen(slug)} title="Edit this page">
                  <span className="gs-page-title">{p.title}{slug === current ? <em> · editing</em> : null}</span>
                  <span className="gs-page-meta">/{slug === 'home' ? '' : slug} · {sections} section{sections === 1 ? '' : 's'}</span>
                </button>
                <span className={'gs-page-status gs-st-' + p.status} title={STATUS[p.status] || p.status}>
                  <span className="gs-dot" />{STATUS[p.status] || p.status}
                </span>
                <div className="gs-page-acts">
                  <button onClick={() => onMove(slug, -1)} disabled={realIndex === 0} title="Move up" aria-label="Move up">↑</button>
                  <button onClick={() => onMove(slug, 1)} disabled={realIndex === order.length - 1} title="Move down" aria-label="Move down">↓</button>
                  <button onClick={() => onRename(slug)} title="Rename" aria-label="Rename">✎</button>
                  <button onClick={() => onDuplicate(slug)} title="Duplicate" aria-label="Duplicate">⧉</button>
                  <button onClick={() => onDelete(slug)} disabled={order.length <= 1} title="Delete" aria-label="Delete" className="gs-page-del">×</button>
                </div>
              </li>
            );
          })}
          {shown.length === 0 && <li className="gs-empty">No pages with that status.</li>}
        </ul>
        {canEdit && selected.size > 0 ? (
          <div className="gs-bulkbar" role="region" aria-label="Bulk actions">
            <span className="gs-bulkbar-n" aria-live="polite">{selected.size} selected</span>
            {bulkActions(pages, [...selected]).map(({ to, count }) => (
              <button key={to} className="gs-btn primary sm" onClick={() => { onBulkStatus([...selected], to); setSelected(new Set()); }}>
                {to === 'review' ? 'Send ' + count + (count === 1 ? ' page' : ' pages') + ' to review' : 'Send ' + count + (count === 1 ? ' page' : ' pages') + ' back to draft'}
              </button>
            ))}
            {/* cycle 19 — bulk page metadata (additive + reversible): one publish date / note / assignee across the selection */}
            <span className="gs-bulkbar-sep" aria-hidden="true" />
            <span className="gs-bulkbar-sched">
              <label htmlFor="gs-bulk-date" className="gs-sr-only">Publish date for the {selected.size} selected page{selected.size === 1 ? '' : 's'}</label>
              <input id="gs-bulk-date" type="datetime-local" className="gs-bulk-dateinput" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
              <button className="gs-btn primary sm" disabled={!bulkDate}
                onClick={() => { const ts = Date.parse(bulkDate); if (Number.isFinite(ts)) { onBulkSchedule([...selected], ts); setBulkDate(''); setSelected(new Set()); } }}>
                Set date
              </button>
            </span>
            <button className="gs-btn ghost sm" onClick={() => { onBulkNote([...selected]); setSelected(new Set()); }}>Add note…</button>
            <button className="gs-btn ghost sm" onClick={() => { onBulkAssign([...selected]); setSelected(new Set()); }}>Assign…</button>
            <span className="gs-bulkbar-sep" aria-hidden="true" />
            <button className="gs-btn ghost sm" onClick={() => { onBulkClearSchedule([...selected]); setSelected(new Set()); }}>Clear dates</button>
            <button className="gs-btn ghost sm" onClick={() => { onBulkClearNote([...selected]); setSelected(new Set()); }}>Clear notes</button>
            <button className="gs-btn ghost sm" onClick={() => { onBulkClearAssign([...selected]); setSelected(new Set()); }}>Unassign</button>
            <button className="gs-btn ghost sm" onClick={() => setSelected(new Set())}>Deselect</button>
          </div>
        ) : null}
        <button className="gs-btn ghost sm gs-pages-new" onClick={onNew}>+ New page</button>
      </div>
    </PanelFrame>
  );
}
