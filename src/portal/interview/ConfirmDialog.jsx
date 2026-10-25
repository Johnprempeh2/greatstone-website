/**
 * ConfirmDialog: the branded replacement for window.confirm(). A dark
 * blurred overlay with a GlassCard-style panel, a lime (or danger) primary
 * action and a ghost cancel. Focus is trapped inside the panel, Escape
 * cancels, and under 480px the panel becomes a full-width bottom sheet.
 *
 * Used by ChatShell for "Save and finish later" and "Stop and discard
 * everything". No native browser dialogs anywhere in the product.
 *
 * Rendered into document.body via a portal: some openers (the admin unit
 * cards) sit inside .card, whose :hover transform would otherwise become
 * the containing block for this fixed overlay and make the panel jump
 * around under the pointer (see controls/Modal.tsx for the full story).
 *
 * Port: source components/ConfirmDialog.tsx, types dropped. The
 * portal content is wrapped in a .gs-interview element, because the interview CSS is scoped to that class
 * and document.body sits outside the page wrapper.
 */

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const panelRef = useRef(null);
  const cancelRef = useRef(null);
  const titleId = useId();
  const bodyId = useId();

  // On open: move focus to the safe action; remember and restore the opener.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    cancelRef.current?.focus();
    return () => opener?.focus?.();
  }, [open]);

  // Escape closes; Tab cycles within the panel (focus trap).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onCancel]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="gs-interview">
      <div
        className="confirm-overlay"
        onMouseDown={(e) => {
          // Click on the dark backdrop (not the panel) cancels.
          if (e.target === e.currentTarget && !busy) onCancel();
        }}
      >
        <div
          className="confirm-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          ref={panelRef}
        >
          <h2 className="confirm-title" id={titleId}>
            {title}
          </h2>
          <div className="confirm-body" id={bodyId}>
            {children}
          </div>
          <div className="confirm-actions">
            <button
              className={danger ? 'btn btn-danger' : 'btn btn-primary'}
              type="button"
              disabled={busy}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={onCancel} ref={cancelRef}>
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
