import { useEffect, useRef, useState, useCallback } from 'react';
import { sanitizeInline } from '../lib/sanitize-html.mjs';
import { looksLikeHtml, plainToRichHtml } from '../lib/richtext-normalise.mjs';
import { RT_COLORS, RT_HIGHLIGHTS, RT_HEX } from '../lib/richtext-marks.mjs';

// A custom Puck field giving inline rich text: bold / italic / underline (+ Cmd/Ctrl+B/I/U), plus brand
// colour and highlight ("text box") runs. Registered exactly like MediaField/LinkField:
//   body: { type: 'custom', label: 'Body', render: (p) => <RichTextField {...p} /> }
// and the block RENDERS the stored value through <RichText html={body} /> (the sanitising chokepoint).
//
// SAFETY: the contentEditable surface is uncontrolled (seeded once via ref so the caret never jumps); on every
// edit the innerHTML is run through sanitizeInline() before onChange, so only allowlisted marks + the closed
// brand-class set are ever stored. Colour/highlight are applied as CLASS spans (never inline style or a raw
// colour picker), which is what keeps them on-brand and AA. Relies on Puck's iframe being disabled (selection
// lives in the main document); see App.jsx PuckEditor iframe:{enabled:false}.

// --- selection helpers (DOM ops; the security guarantees live in the tested sanitiser, not here) ---
function spansInSelection(editor) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return [];
  return Array.from(editor.querySelectorAll('span')).filter((s) => { try { return sel.containsNode(s, true); } catch { return false; } });
}
function clearBrand(editor, prefix) {
  for (const s of spansInSelection(editor)) {
    const kept = (s.className || '').split(/\s+/).filter((c) => c && !c.startsWith(prefix)).join(' ');
    if (kept) s.className = kept; else s.replaceWith(...s.childNodes);
  }
}
function wrapSelection(className) {
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

const cmd = (name) => { try { document.execCommand('styleWithCSS', false, false); document.execCommand(name); } catch { /* unsupported */ } };

export function RichTextField({ value, onChange, variant = 'body' }) {
  // 'body' = full controls + multi-line. 'heading' / 'eyebrow' = single line with a constrained mark set
  // (no highlight box or line breaks on a title), so the same formatting surface reads correctly on a headline.
  const singleLine = variant !== 'body';
  const allow = { bold: variant !== 'eyebrow', italic: variant === 'body', underline: variant === 'body', highlight: variant === 'body', color: true };
  const cleanFor = (h) => (singleLine ? String(h).replace(/<br\s*\/?>/gi, ' ').replace(/\s{2,}/g, ' ').trim() : h);
  const ref = useRef(null);
  const lastEmitted = useRef(undefined); // the last value WE emitted, so an echo from Puck never re-seeds (caret)
  const [marks, setMarks] = useState({ bold: false, italic: false, underline: false, colorClass: '', hiClass: '' });

  // seed the editable surface on mount + on an EXTERNAL value change (switching blocks / undo), never on our
  // own onChange echo. Legacy plain strings (and the **bold** convention) are coerced to safe HTML first.
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (value === lastEmitted.current) return;
    const raw = value == null ? '' : String(value);
    el.innerHTML = cleanFor(sanitizeInline(looksLikeHtml(raw) ? raw : plainToRichHtml(raw)));
    lastEmitted.current = value;
  }, [value]);

  const sync = useCallback(() => {
    const el = ref.current; if (!el) return;
    const clean = cleanFor(sanitizeInline(el.innerHTML));
    lastEmitted.current = clean;
    onChange(clean);
  }, [onChange]);

  // reflect the active marks on the toolbar (aria-pressed) as the caret/selection moves inside this editor
  useEffect(() => {
    const update = () => {
      const el = ref.current; if (!el) return;
      const sel = window.getSelection();
      if (!sel || !sel.anchorNode || !el.contains(sel.anchorNode)) return;
      // detect the active colour / highlight class by walking up from the caret to the editor root
      let colorClass = '', hiClass = '', n = sel.anchorNode;
      while (n && n !== el) {
        if (n.classList) for (const c of n.classList) { if (c.indexOf('gs-rt-c-') === 0) colorClass = c; else if (c.indexOf('gs-rt-bg-') === 0) hiClass = c; }
        n = n.parentNode;
      }
      try { setMarks({ bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'), underline: document.queryCommandState('underline'), colorClass, hiClass }); } catch { /* ignore */ }
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, []);

  const onKeyDown = (e) => {
    // Enter inserts a <br> line break (allowlisted) rather than contentEditable's default <div>, which the
    // inline sanitiser would otherwise turn into a break anyway; doing it here keeps the caret predictable.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (singleLine) return; // a title / eyebrow is a single line
      try { document.execCommand('insertLineBreak'); } catch { document.execCommand('insertHTML', false, '<br>'); }
      sync();
      return;
    }
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if ((k === 'b' && allow.bold) || (k === 'i' && allow.italic) || (k === 'u' && allow.underline)) {
      e.preventDefault();
      cmd(k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline');
      sync();
    }
  };

  // paste as PLAIN text run through the same pipeline, so a Word/Docs paste cannot smuggle styles or colours
  const onPaste = (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    const clean = sanitizeInline(html ? html : plainToRichHtml(text));
    try { document.execCommand('insertHTML', false, clean); } catch { document.execCommand('insertText', false, text); }
    sync();
  };

  const apply = (name) => { ref.current && ref.current.focus(); cmd(name); sync(); };
  // colour and highlight are mutually exclusive on a run: a coloured-text run and a (dark-ink) highlight box
  // can never co-exist, so a colour can't sit on a box and defeat the box's baked AA contrast.
  const setColor = (className) => { const el = ref.current; if (!el) return; el.focus(); clearBrand(el, 'gs-rt-c-'); clearBrand(el, 'gs-rt-bg-'); if (className) wrapSelection(className); sync(); };
  const setHi = (className) => { const el = ref.current; if (!el) return; el.focus(); clearBrand(el, 'gs-rt-bg-'); clearBrand(el, 'gs-rt-c-'); if (className) wrapSelection(className); sync(); };

  const noBlur = (e) => e.preventDefault(); // keep the editor's selection alive while a toolbar control is pressed

  return (
    <div className="gs-rt">
      <div className="gs-rt-bar" role="toolbar" aria-label="Text formatting">
        {allow.bold && <button type="button" className={'gs-rt-btn' + (marks.bold ? ' is-on' : '')} aria-pressed={marks.bold} title="Bold (Cmd/Ctrl+B)" aria-label="Bold" onMouseDown={noBlur} onClick={() => apply('bold')}><b>B</b></button>}
        {allow.italic && <button type="button" className={'gs-rt-btn' + (marks.italic ? ' is-on' : '')} aria-pressed={marks.italic} title="Italic (Cmd/Ctrl+I)" aria-label="Italic" onMouseDown={noBlur} onClick={() => apply('italic')}><i>I</i></button>}
        {allow.underline && <button type="button" className={'gs-rt-btn' + (marks.underline ? ' is-on' : '')} aria-pressed={marks.underline} title="Underline (Cmd/Ctrl+U)" aria-label="Underline" onMouseDown={noBlur} onClick={() => apply('underline')}><u>U</u></button>}
        {allow.bold && <span className="gs-rt-sep" aria-hidden="true" />}
        <span className="gs-rt-swatches" role="group" aria-label="Text colour">
          {RT_COLORS.map((c) => {
            const on = marks.colorClass === c.className;
            return (
              <button key={'c' + c.id} type="button" className={'gs-rt-sw' + (c.id ? '' : ' is-clear') + (on ? ' is-on' : '')} aria-pressed={on} title={'Text colour: ' + c.label} aria-label={'Text colour ' + c.label}
                style={c.id ? { color: RT_HEX[c.id] } : undefined} onMouseDown={noBlur} onClick={() => setColor(c.className)}>A</button>
            );
          })}
        </span>
        {allow.highlight && (
          <>
            <span className="gs-rt-sep" aria-hidden="true" />
            <span className="gs-rt-swatches" role="group" aria-label="Highlight">
              {RT_HIGHLIGHTS.map((h) => {
                const on = marks.hiClass === h.className;
                return (
                  <button key={'h' + h.id} type="button" className={'gs-rt-sw gs-rt-hi' + (h.id ? '' : ' is-clear') + (on ? ' is-on' : '')} aria-pressed={on} title={'Highlight: ' + h.label} aria-label={'Highlight ' + h.label}
                    style={h.id ? { background: RT_HEX[h.id], color: '#0e1611' } : undefined} onMouseDown={noBlur} onClick={() => setHi(h.className)}>{h.id ? '■' : '✕'}</button>
                );
              })}
            </span>
          </>
        )}
        <span className="gs-rt-sep" aria-hidden="true" />
        <button type="button" className="gs-rt-btn gs-rt-clear" title="Clear formatting" aria-label="Clear formatting" onMouseDown={noBlur}
          onClick={() => { const el = ref.current; if (!el) return; el.focus(); cmd('removeFormat'); clearBrand(el, 'gs-rt-c-'); clearBrand(el, 'gs-rt-bg-'); sync(); }}>Clear</button>
      </div>
      <div
        ref={ref}
        className={'gs-rt-edit' + (singleLine ? ' is-oneline' : '')}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline={!singleLine}
        aria-label={variant === 'body' ? 'Rich text body' : 'Rich text ' + variant}
        onInput={sync}
        onBlur={() => { const el = ref.current; if (el) el.innerHTML = cleanFor(sanitizeInline(el.innerHTML)); }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      />
      <p className="gs-rt-hint">{singleLine ? 'Select a word, then a colour' + (allow.bold ? ' or Bold (Cmd/Ctrl+B)' : '') + '.' : 'Select text, then Bold/Italic/Underline (Cmd/Ctrl+B/I/U), a colour, or a highlight box.'}</p>
    </div>
  );
}

export default RichTextField;
