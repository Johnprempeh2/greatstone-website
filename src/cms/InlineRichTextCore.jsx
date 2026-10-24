import { useRef, useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePuck } from '@puckeditor/core';
import { sanitizeInline } from '../lib/sanitize-html.mjs';
import { looksLikeHtml, plainToRichHtml } from '../lib/richtext-normalise.mjs';
import { RT_COLORS, RT_HEX } from '../lib/richtext-marks.mjs';
import { safeHref } from '../lib/safe-url.js';

// Inline-on-canvas rich editor. Renders a block's text field as an editable, formattable element DIRECTLY on the
// canvas in the Next.js Puck iframe. Its Text toolbar is portaled into that same document, so formatting
// commands act on the selection instead of on the outer editor document.
//
// LOADED ONLY IN THE NEXT.JS EDITOR: blocks mount this lazily and ONLY when props.puck.isEditing, so Puck never
// reaches the public bundle and usePuck() is never called outside the Puck provider. On the public site the block
// renders the static <RichText> instead. SAFETY: the same sanitising chokepoint as RichTextField — every edit is
// run through sanitizeInline() before it is stored, so only the closed brand-class set + allowlisted marks persist.
// Immutably rewrite a value nested under `path` (an array of { key, index } steps into nested arrays),
// touching only the targeted item at each level so siblings stay referentially stable.
// path [] → props[field]; [{key:'items',index:2}] → props.items[2][field]; two steps → two levels deep.
function writeNested(obj, path, field, html) {
  if (!path.length) return { ...obj, [field]: html };
  const [step, ...rest] = path;
  const arr = Array.isArray(obj[step.key]) ? obj[step.key] : [];
  return { ...obj, [step.key]: arr.map((el, i) => (i === step.index ? writeNested(el, rest, field, html) : el)) };
}

// `path` targets repeated/nested item sub-fields at any depth (e.g. path=[{key:'industries',index:2},
// {key:'drains',index:1}], field="text" → props.industries[2].drains[1].text). `arrayField`+`index` is
// the one-level shorthand. Omit both to edit a top-level prop (props[field]).
export default function InlineRichText({ id, field, value, as: Tag = 'span', className = '', singleLine = false, placeholder = 'Type here…', arrayField = null, index = null, path = null }) {
  const resolvedPath = Array.isArray(path) ? path : (arrayField != null && index != null ? [{ key: arrayField, index }] : []);
  const { dispatch, getItemById, getSelectorForId } = usePuck();
  const ref = useRef(null);
  const [focused, setFocused] = useState(false);
  const [canvasDocument, setCanvasDocument] = useState(null);
  const [toolbarPosition, setToolbarPosition] = useState({ top: 8, left: 8 });
  const lastEmitted = useRef(undefined); // the value WE emitted, so Puck's echo never re-seeds (which would jump the caret)

  // seed once on mount + on an EXTERNAL value change (undo, or the sidebar editing the same prop), never on our own
  // echo. Legacy plain strings (and the **bold** convention) are coerced to safe HTML first.
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (value === lastEmitted.current) return;
    const raw = value == null ? '' : String(value);
    el.innerHTML = sanitizeInline(looksLikeHtml(raw) ? raw : plainToRichHtml(raw));
    lastEmitted.current = value;
  }, [value]);

  const sync = useCallback(() => {
    const el = ref.current; if (!el) return;
    let html = sanitizeInline(el.innerHTML);
    if (singleLine) html = html.replace(/<br\s*\/?>/gi, ' ').replace(/\s{2,}/g, ' ').trim();
    lastEmitted.current = html;
    const item = getItemById(id); const sel = getSelectorForId(id);
    if (!item || !sel) return;
    // walk `resolvedPath` and rewrite only the targeted (nested) item's field; everything else untouched
    const props = writeNested(item.props, resolvedPath, field, html);
    dispatch({ type: 'replace', destinationIndex: sel.index, destinationZone: sel.zone, data: { ...item, props } });
  }, [dispatch, getItemById, getSelectorForId, id, field, singleLine, JSON.stringify(resolvedPath)]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (singleLine) return;
      const doc = ref.current.ownerDocument;
      try { doc.execCommand('insertLineBreak'); } catch { doc.execCommand('insertHTML', false, '<br>'); }
      sync();
    }
  };
  // paste as PLAIN text run through the same pipeline, so a Word/Docs paste can't smuggle styles
  const onPaste = (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    const clean = sanitizeInline(html ? html : plainToRichHtml(text));
    const doc = ref.current.ownerDocument;
    try { doc.execCommand('insertHTML', false, clean); } catch { doc.execCommand('insertText', false, text); }
    sync();
  };

  const format = (command) => {
    const el = ref.current;
    if (!el) return;
    el.ownerDocument.execCommand(command, false, null);
    sync();
    el.focus();
  };
  const link = () => {
    const el = ref.current;
    if (!el || el.closest('a')) return;
    const href = el.ownerDocument.defaultView.prompt('Link URL');
    if (!href) return;
    const safe = safeHref(href);
    if (safe === '#') return;
    el.ownerDocument.execCommand('createLink', false, safe);
    sync(); el.focus();
  };
  const formatClass = (className, prefix) => {
    const el = ref.current; if (!el) return;
    const doc = el.ownerDocument, selection = doc.defaultView.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    for (const span of el.querySelectorAll('span')) {
      if (!selection.containsNode(span, true)) continue;
      for (const name of [...span.classList]) if (name.startsWith('gs-rt-c-') || name.startsWith('gs-rt-bg-')) span.classList.remove(name);
      if (!span.classList.length) span.replaceWith(...span.childNodes);
    }
    if (className) {
      const span = doc.createElement('span'); span.className = className;
      try { range.surroundContents(span); }
      catch { span.appendChild(range.extractContents()); range.insertNode(span); }
      const next = doc.createRange(); next.selectNodeContents(span); selection.removeAllRanges(); selection.addRange(next);
    }
    sync(); el.focus();
  };

  return (
    <>
    <Tag
      ref={ref}
      className={(className + ' gs-rt-edit gs-rt-inline').trim()}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={!singleLine}
      aria-label={'Edit ' + field + (resolvedPath.length ? ' ' + (resolvedPath[resolvedPath.length - 1].index + 1) : '')}
      data-rt-placeholder={placeholder}
      data-puck-overlay-portal="true"
      spellCheck
      onFocus={() => {
        const el = ref.current; if (!el) return;
        const rect = el.getBoundingClientRect();
        setCanvasDocument(el.ownerDocument);
        setToolbarPosition({ top: (rect.top > 64 ? rect.top - 56 : rect.bottom + 12) + el.ownerDocument.defaultView.scrollY, left: Math.max(8, rect.left + el.ownerDocument.defaultView.scrollX) });
        setFocused(true);
      }}
      onInput={sync}
      onBlur={() => { const el = ref.current; if (el) el.innerHTML = sanitizeInline(el.innerHTML); setFocused(false); }}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    />
    {focused && canvasDocument && createPortal(<div className="gs-frame-text-tools" data-puck-overlay-portal="true" style={toolbarPosition} role="toolbar" aria-label="Text formatting" onMouseDown={(event) => event.preventDefault()}>
      <span>Text</span>
      <button type="button" aria-label="Bold" onClick={() => format('bold')}><b>B</b></button>
      <button type="button" aria-label="Italic" onClick={() => format('italic')}><i>I</i></button>
      <button type="button" aria-label="Link" disabled={!!ref.current?.closest('a')} onClick={link}>Link</button>
      <span className="gs-frame-tool-divider" aria-hidden="true" />
      {RT_COLORS.map((color) => <button key={`colour-${color.id}`} type="button" aria-label={`Text colour ${color.label}`} title={`Text colour ${color.label}`} style={color.id ? { color: RT_HEX[color.id] } : undefined} onClick={() => formatClass(color.className, 'gs-rt-c-')}>A</button>)}
    </div>, canvasDocument.body)}
    </>
  );
}
