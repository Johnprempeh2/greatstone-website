// One way to open the drawer on a new item.
//
// ⚠ Lived inside DeepDivePortal, which meant any screen split out of that file could not use it and
// would have grown its own copy. A second copy is where the permission check quietly diverges: this
// one refuses when the signed-in person cannot author, and says why on hover rather than presenting
// a control that fails.
import React from 'react';

export default function AddButton({ kind, label, ctx, className = 'gs-btn ghost sm' }) {
  if (!ctx?.staff) return null;
  const why = ctx.canAuthor?.can ? null : ctx.canAuthor?.why;
  return (
    <button type="button" className={className} disabled={!ctx.canAuthor?.can} title={why || undefined}
      onClick={() => ctx.openDrawer({ mode: 'add', kind })}>
      + {label}
    </button>
  );
}
