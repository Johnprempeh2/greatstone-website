import { useRef, useEffect, useCallback } from 'react';
import { usePuck } from '@measured/puck';
import { sanitizeInline } from '../lib/sanitize-html.mjs';
import { looksLikeHtml, plainToRichHtml } from '../lib/richtext-normalise.mjs';

// Inline-on-canvas rich editor. Renders a block's text field as an editable, formattable element DIRECTLY on the
// canvas, so you click the text on the page, type, and format it via the top Text tab (which drives any
// .gs-rt-edit). It writes the value straight back to the block's prop with a Puck `replace` dispatch. Puck's
// iframe is disabled, so the caret lives in the main document and inline marks (colour/highlight/bold) stick.
//
// LOADED ONLY IN THE EDITOR: blocks mount this lazily and ONLY when props.puck.isEditing, so @measured/puck never
// reaches the public bundle and usePuck() is never called outside the Puck provider. On the public site the block
// renders the static <RichText> instead. SAFETY: the same sanitising chokepoint as RichTextField — every edit is
// run through sanitizeInline() before it is stored, so only the closed brand-class set + allowlisted marks persist.
export default function InlineRichText({ id, field, value, as: Tag = 'span', className = '', singleLine = false, placeholder = 'Type here…' }) {
  const { dispatch, getItemById, getSelectorForId } = usePuck();
  const ref = useRef(null);
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
    dispatch({ type: 'replace', destinationIndex: sel.index, destinationZone: sel.zone, data: { ...item, props: { ...item.props, [field]: html } } });
  }, [dispatch, getItemById, getSelectorForId, id, field, singleLine]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (singleLine) return;
      try { document.execCommand('insertLineBreak'); } catch { document.execCommand('insertHTML', false, '<br>'); }
      sync();
    }
  };
  // paste as PLAIN text run through the same pipeline, so a Word/Docs paste can't smuggle styles
  const onPaste = (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    const clean = sanitizeInline(html ? html : plainToRichHtml(text));
    try { document.execCommand('insertHTML', false, clean); } catch { document.execCommand('insertText', false, text); }
    sync();
  };

  return (
    <Tag
      ref={ref}
      className={(className + ' gs-rt-edit gs-rt-inline').trim()}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={!singleLine}
      aria-label={'Edit ' + field}
      data-rt-placeholder={placeholder}
      spellCheck
      onInput={sync}
      onBlur={() => { const el = ref.current; if (el) el.innerHTML = sanitizeInline(el.innerHTML); }}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    />
  );
}
