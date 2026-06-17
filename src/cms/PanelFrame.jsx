// One wrapper for every studio panel so the SAME component serves two homes without fighting
// positioning or accessibility:
//   • standalone (embedded=false) → a real slide-over <aside role="dialog"> with a heading + close ×
//     (used nowhere critical now, kept for any direct overlay use);
//   • embedded=true → a plain landmarked <section> with NO dialog role and NO close chrome, so the
//     parent owns the frame. This is how the in-editor Studio sidebar AND the full-screen admin
//     console both mount the panels — the console/sidebar supplies the heading, the panel supplies
//     the body. Replaces the old dialog-inside-a-dialog (every panel declared role="dialog") that
//     screen readers announced as stacked modals with focus escaping the trap.
export default function PanelFrame({ embedded, label, name, onClose, children }) {
  const accessibleName = name || (typeof label === 'string' ? label : undefined);
  if (embedded) {
    return <section className="gs-panel is-embed" aria-label={accessibleName}>{children}</section>;
  }
  return (
    <aside className="gs-panel" role="dialog" aria-modal="true" aria-label={accessibleName}>
      <div className="gs-panel-head">
        <h3>{label}</h3>
        <button className="gs-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      {children}
    </aside>
  );
}
