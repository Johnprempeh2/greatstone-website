import { createPortal } from 'react-dom';

// A modal drawer's full-screen scrim, PORTALED to <body>. The admin drawers (issue licence key, edit
// engagement, edit offering) render deep inside a panel whose wrapper (.ca-wrap / .pr-admin, z-index:1)
// creates a stacking context that sits BELOW the sticky .ca-tabbar (z-index:30). A drawer left in that
// context can't paint above the tab bar no matter its own z-index, so the header overlapped the drawer's
// top fields. Portaling to <body> lifts the scrim (z-index:80) into the root stacking context, above the
// header. Children (the .ca-drawer panel, which stops click propagation) render unchanged; refs, state and
// context still work because React portals keep the component tree intact.
export default function DrawerScrim({ onClose, children }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="ca-drawer-scrim" onClick={onClose}>{children}</div>,
    document.body,
  );
}
