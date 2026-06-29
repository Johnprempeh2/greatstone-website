import { useState } from 'react';
import PanelFrame from './PanelFrame.jsx';
import { pageNote, describeNoteAge } from '../lib/notes-model.mjs';

// Editorial notes: pin a short standing note to any page for the team ("waiting on legal", "copy approved
// by Ben"). Additive + reversible metadata (page.note); App owns the store dispatch via onSetNote(slug,
// text) / onClearNote(slug). A note is intent, not a defect — it never blocks publish. Each page is a row
// with an inline textarea + Save/Clear (mirrors SchedulePanel's per-page-control pattern). `now` once at render.
const TITLE_BTN = { background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', textDecoration: 'underline' };
const TA = { font: 'inherit', width: '100%', minHeight: 44, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--gs-border-strong, rgba(120,120,120,.4))', background: 'transparent', color: 'inherit', resize: 'vertical' };

function NoteRow({ slug, page, onSetNote, onClearNote, onOpen, now }) {
  const saved = pageNote(page);
  const [draft, setDraft] = useState(saved ? saved.text : '');
  const dirty = draft.trim() !== (saved ? saved.text : '');
  const inputId = 'note-' + slug;
  const title = page.title || slug;
  return (
    <li className="gs-la-row" style={{ alignItems: 'flex-start' }}>
      <span className={'gs-la-pill ' + (saved ? 'is-recoverable' : 'is-orphan')}>{saved ? 'Note' : 'None'}</span>
      <span className="gs-la-body">
        <span className="gs-la-where">
          {onOpen ? <button type="button" style={TITLE_BTN} onClick={() => onOpen(slug)}>{title}</button> : title}
          {saved && (saved.by || saved.ts) ? <span style={{ opacity: 0.7 }}> · {[saved.by, describeNoteAge(saved.ts, now)].filter(Boolean).join(' · ')}</span> : null}
        </span>
        <label htmlFor={inputId} className="gs-sr-only">Editorial note for {title}</label>
        <textarea id={inputId} rows={2} style={TA} value={draft} placeholder="Add a note for the team…" onChange={(e) => setDraft(e.target.value)} />
        <span style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button type="button" className="gs-btn primary sm" disabled={!dirty} onClick={() => onSetNote && onSetNote(slug, draft)}>Save note</button>
          {saved ? <button type="button" className="gs-btn ghost sm" onClick={() => { onClearNote && onClearNote(slug); setDraft(''); }} aria-label={'Clear note for ' + title}>Clear</button> : null}
        </span>
      </span>
    </li>
  );
}

export default function NotesPanel({ order = [], pages = {}, onSetNote, onClearNote, onOpen, onClose, embedded }) {
  const now = Date.now();
  const withNotes = order.filter((slug) => pageNote(pages[slug])).length;

  return (
    <PanelFrame embedded={embedded} label={<>Editorial notes {withNotes ? <span className="gs-panel-count">{withNotes}</span> : null}</>} name="Editorial notes" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>
          Pin a short note to any page for your team — “waiting on legal”, “copy approved by Ben”, “don’t
          publish until launch”. <strong>It’s a reminder, not a gate</strong> — it never blocks publishing,
          and you can clear it any time.
        </p>

        {withNotes === 0 ? (
          <p className="gs-la-clean" role="status">No editorial notes yet. Add one below to flag a page for the team.</p>
        ) : (
          <p className="gs-cs-sub" style={{ margin: '0 0 14px' }}>{withNotes} page{withNotes === 1 ? '' : 's'} with a note</p>
        )}

        {order.length === 0 ? <p className="gs-field-hint">No pages yet.</p> : (
          <ul className="gs-la-list">
            {order.map((slug) => (pages[slug] ? <NoteRow key={slug} slug={slug} page={pages[slug]} onSetNote={onSetNote} onClearNote={onClearNote} onOpen={onOpen} now={now} /> : null))}
          </ul>
        )}
      </div>
    </PanelFrame>
  );
}
