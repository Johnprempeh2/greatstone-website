import PanelFrame from './PanelFrame.jsx';
import { classifySchedule, pageSchedule, describeDue, toLocalInput, listSchedules } from '../lib/schedule-model.mjs';

// Publish schedule: set an OPTIONAL publish date on any page and see Scheduled / Overdue at a glance.
// This NEVER publishes anything automatically — go-live stays the manual, admin-gated Publish button;
// publishAt is reversible reminder metadata. Writes via onSchedule(slug, ts) / onClear(slug); App owns
// the store dispatch. `now` is captured once at render (the model stays pure; the panel is the shell).
const PILL = { overdue: 'is-broken', scheduled: 'is-recoverable', none: 'is-orphan' };
const PILL_TEXT = { overdue: 'Overdue', scheduled: 'Scheduled', none: 'Not scheduled' };
const INPUT = { font: 'inherit', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--gs-border-strong, rgba(120,120,120,.4))', background: 'transparent', color: 'inherit' };
const TITLE_BTN = { background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', textDecoration: 'underline' };

export default function SchedulePanel({ order = [], pages = {}, onOpen, onSchedule, onClear, onClose, embedded }) {
  const now = Date.now();
  const { scheduled, overdue } = listSchedules({ order, pages }, now);

  return (
    <PanelFrame embedded={embedded} label={<>Publish schedule {overdue.length ? <span className="gs-panel-count">{overdue.length}</span> : null}</>} name="Publish schedule" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>
          Set an optional publish date on any page to track it here. <strong>Scheduled</strong> — a future
          date. <strong>Overdue</strong> — the date has passed but the page isn’t live yet.
          <strong> It never publishes anything automatically</strong> — go-live stays the manual Publish
          button; the date is a reminder you can clear any time.
        </p>

        {(scheduled.length || overdue.length) ? (
          <p className="gs-cs-sub" style={{ margin: '0 0 14px' }}>
            {scheduled.length} scheduled{overdue.length ? ' · ' + overdue.length + ' overdue' : ''}
          </p>
        ) : (
          <p className="gs-la-clean" role="status">No pages are scheduled. Set a publish date on any page below to track it here.</p>
        )}

        {order.length === 0 ? <p className="gs-field-hint">No pages yet.</p> : (
          <ul className="gs-la-list">
            {order.map((slug) => {
              const page = pages[slug];
              if (!page) return null;
              const bucket = classifySchedule(page, now);
              const ts = pageSchedule(page);
              const inputId = 'sched-' + slug;
              return (
                <li className="gs-la-row" key={slug}>
                  <span className={'gs-la-pill ' + PILL[bucket]}>{PILL_TEXT[bucket]}</span>
                  <span className="gs-la-body">
                    <span className="gs-la-where">
                      {onOpen ? <button type="button" style={TITLE_BTN} onClick={() => onOpen(slug)}>{page.title || slug}</button> : (page.title || slug)}
                      {ts != null ? <span style={{ opacity: 0.7 }}> · {describeDue(ts, now)}</span> : null}
                    </span>
                    <span className="gs-la-target" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                      <label htmlFor={inputId} className="gs-sr-only">Publish date for {page.title || slug}</label>
                      <input
                        id={inputId} type="datetime-local" style={INPUT} value={toLocalInput(ts)}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) { onClear && onClear(slug); return; }
                          const parsed = Date.parse(v);
                          if (Number.isFinite(parsed) && onSchedule) onSchedule(slug, parsed);
                        }}
                      />
                      {ts != null ? <button type="button" className="gs-btn ghost sm" onClick={() => onClear && onClear(slug)} aria-label={'Clear schedule for ' + (page.title || slug)}>Clear</button> : null}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PanelFrame>
  );
}
