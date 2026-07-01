// Shared rich-text formatting DOM helpers, used by BOTH the RichTextField side-panel toolbar (cms/RichTextField)
// AND the top ContextBar "Text" tab (cms/ContextBar), so a bold / colour / highlight applies identically wherever
// the caret is. The low-level selection ops were extracted verbatim from RichTextField so its behaviour is
// unchanged; the higher-level apply* functions add "operate on a given editor element, then fire an input event
// so the owning RichTextField re-syncs the value to Puck" (the top bar can't call RichTextField's internal sync).
//
// SAFETY: these only mutate the DOM inside a contentEditable; the security guarantee still lives in the tested
// inline sanitiser (sanitize-html.mjs) that RichTextField runs on every input before storing. Colour/highlight are
// only ever applied as the closed brand-class set (RT_SPAN_CLASSES); this module never adds inline styles.

// spans that the current selection touches, within `editor`
export function spansInSelection(editor) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return [];
  return Array.from(editor.querySelectorAll('span')).filter((s) => { try { return sel.containsNode(s, true); } catch { return false; } });
}

// strip any class starting with `prefix` (e.g. 'gs-rt-c-') from spans in the selection; unwrap now-empty spans
export function clearBrand(editor, prefix) {
  for (const s of spansInSelection(editor)) {
    const kept = (s.className || '').split(/\s+/).filter((c) => c && !c.startsWith(prefix)).join(' ');
    if (kept) s.className = kept; else s.replaceWith(...s.childNodes);
  }
}

// wrap the current (non-collapsed) selection in a span of `className`, and re-select it
export function wrapSelection(className) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return false;
  const span = document.createElement('span');
  span.className = className;
  try { range.surroundContents(span); }
  catch { span.appendChild(range.extractContents()); range.insertNode(span); }
  sel.removeAllRanges();
  const r = document.createRange(); r.selectNodeContents(span); sel.addRange(r);
  return true;
}

// execCommand wrapper (bold/italic/underline/removeFormat/insertUnorderedList/indent/outdent) with plaintext CSS off
export function cmd(name) { try { document.execCommand('styleWithCSS', false, false); document.execCommand(name); } catch { /* unsupported */ } }

// ── higher-level: apply to a specific editor element + notify its RichTextField (used by the top ContextBar) ──
function sync(editor) { try { editor.dispatchEvent(new Event('input', { bubbles: true })); } catch { /* ignore */ } }
export function applyMark(editor, mark) { if (!editor) return; editor.focus(); cmd(mark); sync(editor); } // 'bold'|'italic'|'underline'
export function applyColor(editor, className) { if (!editor) return; editor.focus(); clearBrand(editor, 'gs-rt-c-'); clearBrand(editor, 'gs-rt-bg-'); if (className) wrapSelection(className); sync(editor); }
export function applyHighlight(editor, className) { if (!editor) return; editor.focus(); clearBrand(editor, 'gs-rt-bg-'); clearBrand(editor, 'gs-rt-c-'); if (className) wrapSelection(className); sync(editor); }
export function applyList(editor) { if (!editor) return; editor.focus(); cmd('insertUnorderedList'); sync(editor); }
export function applyIndent(editor, out) { if (!editor) return; editor.focus(); cmd(out ? 'outdent' : 'indent'); sync(editor); }
export function clearFormat(editor) { if (!editor) return; editor.focus(); cmd('removeFormat'); clearBrand(editor, 'gs-rt-c-'); clearBrand(editor, 'gs-rt-bg-'); sync(editor); }

// ── track the last-focused rich-text editor, so the top bar knows which field to format ──
let lastEditor = null;
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('gs-rt-edit')) lastEditor = t;
  });
}
// the editor to act on: the one actually focused now, else the last one focused if it is still in the document
export function focusedEditor() {
  const ae = typeof document !== 'undefined' ? document.activeElement : null;
  if (ae && ae.classList && ae.classList.contains('gs-rt-edit')) return ae;
  return lastEditor && document.contains(lastEditor) ? lastEditor : null;
}
// which single brand colour / highlight class (if any) sits on the current caret in `editor`, for active-state
export function activeMarks(editor) {
  const out = { bold: false, italic: false, underline: false, colorClass: '', hiClass: '' };
  if (!editor) return out;
  try { out.bold = document.queryCommandState('bold'); out.italic = document.queryCommandState('italic'); out.underline = document.queryCommandState('underline'); } catch { /* ignore */ }
  const sel = window.getSelection();
  let n = sel && sel.anchorNode;
  while (n && n !== editor) {
    if (n.classList) for (const c of n.classList) { if (c.indexOf('gs-rt-c-') === 0) out.colorClass = c; else if (c.indexOf('gs-rt-bg-') === 0) out.hiClass = c; }
    n = n.parentNode;
  }
  return out;
}
