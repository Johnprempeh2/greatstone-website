// Pages overview (edit mode): every editable page in one list — title, path, section count and
// status — click any row to jump straight into editing it. The faster way to move around the
// site than going back to the public nav.
const STATUS = { draft: 'Draft', review: 'In review', approved: 'Approved', published: 'Published' };

export default function PagesPanel({ order, pages, current, onOpen, onNew, onClose }) {
  return (
    <aside className="gs-panel" role="dialog" aria-label="Pages">
      <div className="gs-panel-head">
        <h3>Pages <span className="gs-panel-count">{order.length}</span></h3>
        <button className="gs-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="gs-panel-body">
        <ul className="gs-pages">
          {order.map((slug) => {
            const p = pages[slug];
            const sections = (p.data && p.data.content && p.data.content.length) || 0;
            return (
              <li key={slug} className={'gs-page-row' + (slug === current ? ' is-current' : '')}>
                <button className="gs-page-open" onClick={() => onOpen(slug)}>
                  <span className="gs-page-title">{p.title}{slug === current ? <em> · editing</em> : null}</span>
                  <span className="gs-page-meta">/{slug === 'home' ? '' : slug} · {sections} section{sections === 1 ? '' : 's'}</span>
                </button>
                <span className={'gs-page-status gs-st-' + p.status} title={STATUS[p.status] || p.status}>
                  <span className="gs-dot" />{STATUS[p.status] || p.status}
                </span>
              </li>
            );
          })}
        </ul>
        <button className="gs-btn ghost sm gs-pages-new" onClick={onNew}>+ New page</button>
      </div>
    </aside>
  );
}
