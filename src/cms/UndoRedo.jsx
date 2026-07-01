import { createUsePuck } from '@measured/puck';

// Visible undo/redo for the editor toolbar. Puck binds ⌘Z / ⌘⇧Z (and ⌘Y) natively, but our custom
// headerActions override replaces Puck's default header — which carried these controls — so they
// were invisible. We read only the history slice via a createUsePuck selector; bare usePuck() warns about
// unnecessary re-renders and re-runs on every unrelated state change. In Puck 0.20 hasPast()/hasFuture() are
// functions. This lives in its own module so it loads with the lazy editor chunk and never touches the public
// bundle (it imports @measured/puck). Rendered inside headerActions = within Puck's context.
const usePuckSel = createUsePuck();
export default function UndoRedo() {
  const history = usePuckSel((s) => s.history);
  if (!history) return null;
  const canBack = typeof history.hasPast === 'function' ? history.hasPast() : !!history.hasPast;
  const canFwd = typeof history.hasFuture === 'function' ? history.hasFuture() : !!history.hasFuture;
  return (
    <span className="gs-undoredo" role="group" aria-label="History">
      <button type="button" className="gs-btn ghost sm" onClick={() => history.back && history.back()} disabled={!canBack} title="Undo (⌘Z)" aria-label="Undo">↶</button>
      <button type="button" className="gs-btn ghost sm" onClick={() => history.forward && history.forward()} disabled={!canFwd} title="Redo (⌘⇧Z)" aria-label="Redo">↷</button>
    </span>
  );
}
