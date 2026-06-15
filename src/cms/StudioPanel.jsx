// One Studio panel with a tab rail, so the four editor surfaces live in focused categories
// instead of four separate slide-overs. The existing panels are nested verbatim (their own
// heads are flattened by CSS); only the active tab is mounted, so switching to another tab
// unmounts the previous (e.g. leaving Background clears its live preview).
const TABS = [['pages', 'Pages'], ['products', 'Products'], ['releases', 'Releases'], ['background', 'Background'], ['seo', 'SEO'], ['history', 'History'], ['activity', 'Activity']];

export default function StudioPanel({ tab, onTab, onClose, panels }) {
  return (
    <aside className="gs-panel gs-studio" role="dialog" aria-label="Studio">
      <div className="gs-studio-tabs">
        <div className="gs-studio-tablist" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id}
              className={'gs-studio-tab' + (tab === id ? ' is-active' : '')} onClick={() => onTab(id)}>{label}</button>
          ))}
        </div>
        <button className="gs-x" onClick={onClose} aria-label="Close studio panel">×</button>
      </div>
      <div className="gs-studio-body">
        {panels[tab]}
      </div>
    </aside>
  );
}
