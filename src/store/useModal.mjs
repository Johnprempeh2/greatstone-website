// Shared modal behaviour for slide-over dialogs (cart, admin edit drawer): focus moves in on open,
// Tab/Shift+Tab are trapped within the dialog, Escape closes, body scroll is locked, and focus is
// restored to the trigger on close. One implementation so every dialog behaves the same (WCAG 2.4.3 / 2.1.2).
import { useEffect } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** @param ref ref to the dialog element; @param open whether it's mounted/open; @param onClose () => void */
export function useModal(ref, open, onClose) {
  useEffect(() => {
    if (!open || !ref.current) return;
    const node = ref.current;
    const restore = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';                       // scroll lock

    // getClientRects() (not offsetParent, which is null under a position:fixed ancestor) is the robust visible check
    const focusables = () => Array.from(node.querySelectorAll(FOCUSABLE)).filter((el) => el.getClientRects().length > 0 || el === node);
    const first = focusables()[0];
    const t = setTimeout(() => (first || node).focus(), 20);        // move focus in

    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) { e.preventDefault(); return; }
      const lo = f[0], hi = f[f.length - 1];
      if (e.shiftKey && document.activeElement === lo) { e.preventDefault(); hi.focus(); }
      else if (!e.shiftKey && document.activeElement === hi) { e.preventDefault(); lo.focus(); }
    };
    addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t); removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (restore && restore.focus) restore.focus();               // focus restore
    };
  }, [open, ref, onClose]);
}
