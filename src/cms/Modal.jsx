import { useState, useEffect, useRef } from 'react';

// On-brand replacement for window.prompt / window.confirm. Driven by App's `modal` state and a
// Promise: App's ask() opens it, the user's choice resolves the promise. Two kinds:
//   confirm — message + Cancel/Confirm (danger styling for destructive actions)
//   prompt  — a labelled text input + Cancel/Confirm, Enter to confirm
// Keeps editor dialogs inside the brand (raw OS dialogs can't be styled or validated) and lets us
// add validation/length hints later. Focus moves in on open, Escape cancels, backdrop click cancels.
export default function Modal({ modal, onResolve }) {
  const [val, setVal] = useState('');
  const inputRef = useRef(null);
  const cancelRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => { setVal((modal && modal.defaultValue) || ''); }, [modal]);
  useEffect(() => {
    if (!modal) return;
    const restore = document.activeElement;                          // the control that opened the dialog
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';                         // lock background scroll while open
    const t = setTimeout(() => {
      if (modal.kind === 'prompt' && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
      else if (cancelRef.current) cancelRef.current.focus();
    }, 30);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onResolve(modal.kind === 'prompt' ? null : false); }
      else if (e.key === 'Tab') {
        // simple focus trap: keep Tab within the dialog
        const f = panelRef.current ? Array.from(panelRef.current.querySelectorAll('button:not([disabled]),input:not([disabled]),[href],select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter((el) => el.offsetParent !== null) : [];
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t); removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (restore && restore.focus) restore.focus();                 // restore focus to the trigger (WCAG 2.4.3)
    };
  }, [modal, onResolve]);

  if (!modal) return null;
  const isPrompt = modal.kind === 'prompt';
  const confirm = () => onResolve(isPrompt ? val : true);
  const cancel = () => onResolve(isPrompt ? null : false);

  return (
    <div className="gs-modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div className="gs-modal" role="dialog" aria-modal="true" aria-labelledby="gs-modal-title" ref={panelRef}>
        <h3 className="gs-modal-title" id="gs-modal-title">{modal.title}</h3>
        {modal.message && <p className="gs-modal-msg">{modal.message}</p>}
        {isPrompt && (
          <label className="gs-field gs-modal-field">
            {modal.label && <span className="gs-field-label">{modal.label}</span>}
            <input ref={inputRef} value={val} onChange={(e) => setVal(e.target.value)} aria-label={modal.label || modal.title}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } }} />
          </label>
        )}
        <div className="gs-modal-actions">
          <button ref={cancelRef} className="gs-btn ghost" onClick={cancel}>{modal.cancelLabel || 'Cancel'}</button>
          <button className={'gs-btn ' + (modal.danger ? 'danger' : 'primary')} onClick={confirm} disabled={isPrompt && !modal.allowEmpty && !val.trim()}>
            {modal.confirmLabel || (isPrompt ? 'Save' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
