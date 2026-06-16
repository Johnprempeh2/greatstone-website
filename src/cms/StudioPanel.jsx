// One Studio panel with a grouped tab rail, so the editor surfaces live in focused categories
// instead of a flat wall of nine tabs (and instead of nine separate toolbar buttons). The existing
// panels are nested verbatim (their own heads are flattened by CSS); only the active tab is mounted,
// so switching tabs unmounts the previous (e.g. leaving Background clears its live preview).
// `badges` shows an attention count on a tab (e.g. pages needing release action, pending invites).
const GROUPS = [
  { label: '', tabs: [['home', 'Home']] },
  { label: 'Content', tabs: [['pages', 'Pages'], ['products', 'Products']] },
  { label: 'Page', tabs: [['background', 'Background'], ['seo', 'SEO'], ['history', 'History']] },
  { label: 'Governance', tabs: [['releases', 'Releases'], ['activity', 'Activity']] },
  { label: 'Org', tabs: [['team', 'Team']] },
];

export default function StudioPanel({ tab, onTab, onClose, panels, badges = {} }) {
  return (
    <aside className="gs-panel gs-studio" role="dialog" aria-label="Studio">
      <div className="gs-studio-tabs">
        <div className="gs-studio-tablist" role="tablist">
          {GROUPS.map((g, gi) => {
            const tabs = g.tabs.filter(([id]) => panels[id]); // only tabs whose panel is provided (Team is admin-only)
            if (!tabs.length) return null;
            return (
              <div className="gs-studio-group" key={gi}>
                {g.label ? <span className="gs-studio-grouplabel">{g.label}</span> : null}
                {tabs.map(([id, label]) => (
                  <button key={id} role="tab" aria-selected={tab === id}
                    className={'gs-studio-tab' + (tab === id ? ' is-active' : '')} onClick={() => onTab(id)}>
                    {label}{badges[id] ? <span className="gs-studio-tabbadge" aria-label={badges[id] + ' need attention'}>{badges[id]}</span> : null}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
        <button className="gs-x" onClick={onClose} aria-label="Close studio panel">×</button>
      </div>
      <div className="gs-studio-body">
        {panels[tab]}
      </div>
    </aside>
  );
}
