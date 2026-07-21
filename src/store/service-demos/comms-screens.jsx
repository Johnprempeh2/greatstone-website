// The three screens in the Comms Channels demo.
import React, { useState } from 'react';

const num = (n) => n.toLocaleString('en-GB');

/* ── compose once, and watch the cascade carry it ───────────────────────────────────────────────────── */
export function BroadcastScreen({ data }) {
  const [draft, setDraft] = useState(0);
  const [picked, setPicked] = useState(() => data.segments.map((s) => s.id));
  const [sent, setSent] = useState(null);

  // Any change to who or what invalidates a previous send, so the report can never describe a different
  // audience from the one on screen.
  const change = (fn) => { setSent(null); fn(); };

  const toggle = (id) => change(() =>
    setPicked((p) => (p.indexOf(id) > -1 ? p.filter((x) => x !== id) : [...p, id])));

  const total = data.segments.filter((s) => picked.indexOf(s.id) > -1).reduce((n, s) => n + s.n, 0);

  const send = () => {
    // Each tier takes its share of whoever is still unreached; the last one catches the remainder exactly.
    let left = total;
    const rows = data.cascade.map((c) => {
      const n = c.share >= 1 ? left : Math.round(left * c.share);
      left -= n;
      return { ...c, n };
    });
    setSent({ rows, total });
  };

  const eng = data.engagement;
  // replies belong to the message that was actually sent. Reading them off the broadcast meant selecting
  // the crew assignment and getting a parent's reply about a school uniform.
  const replies = data.drafts[draft].replies;

  return (
    <div className="scm-bc">
      <div className="scm-compose">
        <p className="scm-l">Message</p>
        <div className="swd-opts">
          {data.drafts.map((d, i) => (
            <button
              key={d.id} type="button" className={'swd-opt is-chip' + (i === draft ? ' is-on' : '')}
              aria-pressed={i === draft} onClick={() => change(() => setDraft(i))}
            >
              {d.label}
            </button>
          ))}
        </div>
        <p className="scm-draftbody">{data.drafts[draft].body}</p>
      </div>

      <fieldset className="scm-segs">
        <legend className="scm-l">Who gets it</legend>
        {data.segments.map((s) => (
          <label key={s.id} className={'sbd-mod' + (picked.indexOf(s.id) > -1 ? ' is-on' : '')}>
            <input type="checkbox" checked={picked.indexOf(s.id) > -1} onChange={() => toggle(s.id)} />
            {s.label} <span className="scm-n">{num(s.n)}</span>
          </label>
        ))}
      </fieldset>

      <div className="scm-sendrow">
        <p className="scm-total" aria-live="polite"><b>{num(total)}</b> people selected</p>
        <button type="button" className="swd-btn" disabled={!total} onClick={send}>Send it</button>
      </div>

      {sent ? (
        <div className="scm-report" role="status">
          <p className="scm-l">Where it landed</p>
          <ul className="scm-cascade">
            {sent.rows.map((r, i) => (
              <li key={r.id} className={r.n ? '' : 'is-zero'}>
                <span className="scm-ch">
                  <b>{r.label}</b>
                  {i === 0 ? <i>tried first</i> : i === sent.rows.length - 1 ? <i>caught the rest</i> : <i>fallback</i>}
                </span>
                <span className="scm-bar" aria-hidden="true">
                  <span style={{ width: (sent.total ? (r.n / sent.total) * 100 : 0) + '%' }} />
                </span>
                <span className="scm-cn">{num(r.n)}</span>
                <span className="scm-note">{r.note}</span>
              </li>
            ))}
          </ul>

          <div className="scm-stats">
            {eng ? (
              <>
                <span className="sdemo-meter"><b>{num(sent.total - Math.round(sent.total * eng.bounce))}</b><i>delivered</i></span>
                <span className="sdemo-meter is-auto"><b>{num(Math.round(sent.total * eng.open))}</b><i>opened</i></span>
                <span className="sdemo-meter is-saved"><b>{num(Math.round(sent.total * eng.click))}</b><i>clicked through</i></span>
                <span className="sdemo-meter"><b>{Math.round(sent.total * eng.bounce)}</b><i>bounced, list cleaned</i></span>
              </>
            ) : (
              <>
                <span className="sdemo-meter"><b>{num(sent.total)}</b><i>reached</i></span>
                <span className="sdemo-meter is-saved"><b>{num(Math.round(sent.total * data.readRate))}</b><i>read it</i></span>
                {/* the cascade partitions the whole audience, so this is genuinely zero rather than a boast */}
                <span className="sdemo-meter"><b>0</b><i>unreached</i></span>
              </>
            )}
          </div>

          {replies ? (
            <div className="scm-replies">
              <p className="scm-l">And what came back</p>
              <ul>
                {replies.map((r) => (
                  <li key={r.who}>
                    <b>{r.who}</b>
                    <span>{r.t}</span>
                  </li>
                ))}
              </ul>
              <p className="scm-sub">{data.repliesNote}</p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="swd-empty">Nothing sent yet. Pick who, then send.</p>
      )}

      <p className="scm-foot">{data.foot}</p>
    </div>
  );
}

/* ── a conversation on a phone, and the record it becomes ───────────────────────────────────────────── */
export function ThreadScreen({ data }) {
  const [at, setAt] = useState(1);

  const shown = data.turns.slice(0, at);
  // The record is derived from what has been said so far, not stored separately: replay it every render.
  const rec = shown.reduce((acc, t) => ({ ...acc, ...(t.sets || {}) }), {});
  const done = at >= data.turns.length;

  return (
    <div className="scm-thread">
      <div className="scm-cols">
        <div className="scm-phone">
          <div className="scm-phonebar">
            <span className="swd-av is-sm" aria-hidden="true">{data.who.slice(0, 1)}</span>
            <div>
              <p className="scm-pn">{data.who}</p>
              <p className="scm-pnum">{data.number}</p>
            </div>
          </div>
          <ul className="scm-msgs">
            {shown.map((t, i) => (
              <li key={i} className={'scm-msg is-' + t.from}>{t.t}</li>
            ))}
          </ul>
          <div className="scm-phonefoot">
            {done ? (
              <button type="button" className="sdemo-reset" onClick={() => setAt(1)}>Start over</button>
            ) : (
              <button type="button" className="sdemo-run" onClick={() => setAt((n) => n + 1)}>Next message</button>
            )}
          </div>
        </div>

        <div className="scm-record">
          <p className="scm-l">{data.record.label}<span>{data.record.ref}</span></p>
          <dl className="scm-fields" aria-live="polite">
            <div><dt>Customer</dt><dd>{rec.customer || <em>waiting</em>}</dd></div>
            <div><dt>Items</dt><dd>{rec.items ? rec.items.map((x) => <span key={x} className="scm-item">{x}</span>) : <em>waiting</em>}</dd></div>
            <div><dt>Total</dt><dd>{rec.total || <em>waiting</em>}</dd></div>
            <div><dt>Delivery</dt><dd>{rec.delivery || <em>waiting</em>}</dd></div>
            <div><dt>Status</dt><dd>{rec.status || <em>waiting</em>}</dd></div>
          </dl>
          {rec.flag ? (
            <p className="scm-flag">
              <b>Handed to a person</b>
              {rec.flag}
            </p>
          ) : null}
          {done ? <p className="scm-after">{data.after}</p> : <p className="scm-hint">{data.hint}</p>}
        </div>
      </div>
    </div>
  );
}

/* ── the door ───────────────────────────────────────────────────────────────────────────────────────── */
export function EventScreen({ data }) {
  const [inside, setInside] = useState([]);

  const isIn = (id) => inside.indexOf(id) > -1;
  const checkIn = (id) => setInside((s) => (s.indexOf(id) > -1 ? s.filter((x) => x !== id) : [...s, id]));
  const next = data.attendees.find((a) => !isIn(a.id));
  const paid = data.attendees.filter((a) => a.paid);
  const owing = data.attendees.filter((a) => isIn(a.id) && !a.paid);

  return (
    <div className="scm-event">
      <div className="swd-tiles scm-tiles">
        <div className="swd-tile"><b>{data.attendees.length}</b><i>Registered</i></div>
        <div className="swd-tile"><b>{paid.length}</b><i>Paid</i></div>
        <div className="swd-tile"><b>{inside.length}</b><i>Checked in</i></div>
      </div>

      <div className="scm-doorrow">
        <button type="button" className="sdemo-run" disabled={!next} onClick={() => next && checkIn(next.id)}>
          {next ? 'Scan next ticket' : 'Everyone is in'}
        </button>
        <p className="swd-said" aria-live="polite">
          {inside.length} of {data.attendees.length} through the door
          {owing.length ? ', ' + owing.length + ' to settle at the desk' : ''}
        </p>
      </div>

      <ul className="scm-att">
        {data.attendees.map((a) => (
          <li key={a.id} className={'scm-a' + (isIn(a.id) ? ' is-in' : '')}>
            <span className="scm-a-main">
              <span className="scm-a-n">
                {a.name}
                {a.paper ? <span className="scm-paper">Paper ticket</span> : null}
                {!a.paid ? <span className="scm-unpaid">Unpaid</span> : null}
              </span>
              <span className="scm-a-m">{a.meta}</span>
            </span>
            <button type="button" className={'scm-in' + (isIn(a.id) ? ' is-on' : '')} onClick={() => checkIn(a.id)}>
              {isIn(a.id) ? 'In' : 'Check in'}
              <span className="gs-sr-only">{isIn(a.id) ? ', checked in. Select to undo.' : ' ' + a.name}</span>
            </button>
          </li>
        ))}
      </ul>

      {owing.length ? (
        <p className="scm-flag">
          <b>Collect at the desk</b>
          {owing.map((a) => a.name).join(', ')} came through on an RSVP without paying. Flagged rather than
          turned away, and already on the reconciliation.
        </p>
      ) : null}

      <p className="scm-foot">{data.foot}</p>
    </div>
  );
}
