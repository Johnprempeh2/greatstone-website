// One way to open the drawer on an existing item.
//
// ⚠ Extracted from DeepDivePortal for the reason AddButton's own header already gives: a control
// that lives inside that file cannot be used by any screen split out of it, so the next screen
// grows a copy, and a second copy is where the permission check quietly diverges. This one refuses
// when the signed-in person cannot author and says why on hover, rather than presenting a control
// that fails on click.
import React from 'react';

export default function EditLink({ item, kind, ctx, label }) {
  if (!ctx?.staff) return null;
  const why = ctx.canAuthor?.can ? null : ctx.canAuthor?.why;
  return (
    <button type="button" className="dd-edit" disabled={!ctx.canAuthor?.can} title={why || undefined}
      onClick={() => ctx.openDrawer({ mode: 'edit', kind, item })}>
      {label || 'Edit'}<span className="gs-sr-only"> this {kind}</span>
    </button>
  );
}
