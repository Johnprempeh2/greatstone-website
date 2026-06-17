import { useState } from 'react';
import PanelFrame from './PanelFrame.jsx';

// Pages hub (edit mode): every page with its path, section count and status, plus the full set
// of management actions — open, duplicate, rename, reorder, delete — and a status filter so a
// lead can see what's in review at a glance. Status changes happen in the open page's toolbar.
const STATUS = { draft: 'Draft', review: 'In review', approved: 'Approved', published: 'Published' };
const FILTERS = [['all', 'All'], ['draft', 'Draft'], ['review', 'In review'], ['approved', 'Approved'], ['published', 'Published']];

export default function PagesPanel({ order, pages, current, onOpen, onNew, onDelete, onDuplicate, onRename, onMove, onClose, embedded }) {
  const [filter, setFilter] = useState('all');
  const counts = order.reduce((m, s) => { m[pages[s].status] = (m[pages[s].status] || 0) + 1; return m; }, {});
  const shown = order.filter((s) => filter === 'all' || pages[s].status === filter);

  return (
    <PanelFrame embedded={embedded} label={<>Pages <span className="gs-panel-count">{order.length}</span></>} name="Pages" onClose={onClose}>
      <div className="gs-panel-body">
        <div className="gs-pagefilter">
          {FILTERS.map(([id, label]) => (
            <button key={id} className={'gs-pagefilter-btn' + (filter === id ? ' is-active' : '')} onClick={() => setFilter(id)}>
              {label}{id !== 'all' && counts[id] ? <span className="gs-pagefilter-n">{counts[id]}</span> : null}
            </button>
          ))}
        </div>
        <ul className="gs-pages">
          {shown.map((slug, i) => {
            const p = pages[slug];
            const sections = (p.data && p.data.content && p.data.content.length) || 0;
            const realIndex = order.indexOf(slug);
            return (
              <li key={slug} className={'gs-page-row' + (slug === current ? ' is-current' : '')}>
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
        <button className="gs-btn ghost sm gs-pages-new" onClick={onNew}>+ New page</button>
      </div>
    </PanelFrame>
  );
}
