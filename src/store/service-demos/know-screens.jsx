// The three screens in the Meetings & Knowledge demo.
import React, { useMemo, useState } from 'react';

const Lock = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

/* ── source in, structure out, and the structure remembers where it came from ───────────────────────── */
export function ExtractScreen({ data }) {
  const [run, setRun] = useState(false);
  const [pick, setPick] = useState(null);

  const lit = useMemo(() => {
    if (!pick) return [];
    const o = data.out.find((x) => x.id === pick);
    return o ? o.from : [];
  }, [pick, data.out]);

  const picked = data.out.find((x) => x.id === pick);

  return (
    <div className="skn-extract">
      <div className="skn-cols">
        <div className="skn-src">
          <p className="skn-pane-l">
            {data.sourceLabel}
            <span>{data.sourceMeta}</span>
          </p>
          <ul className="skn-lines">
            {data.lines.map((l) => {
              const on = lit.indexOf(l.id) > -1;
              return (
                <li key={l.id} className={'skn-line' + (on ? ' is-lit' : '')}>
                  <span className="skn-who">{l.who}</span>
                  <span className="skn-said">{l.t}</span>
                  {/* the highlight is meaningless to a screen reader, so say it in words */}
                  {on ? <span className="gs-sr-only">This is a source for the selected item.</span> : null}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="skn-out">
          <p className="skn-pane-l">{data.outLabel}</p>
          {run ? (
            <>
              <ul className="skn-outs">
                {data.out.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button" className={'skn-outbtn' + (pick === o.id ? ' is-on' : '')}
                      aria-pressed={pick === o.id} onClick={() => setPick(pick === o.id ? null : o.id)}
                    >
                      <span className="skn-type">{o.type}</span>
                      <span className="skn-out-t">{o.t}</span>
                      {o.owner ? <span className="skn-owner">{o.owner}, {o.due}</span> : null}
                      <span className="skn-trace">{o.from.length} source {o.from.length === 1 ? 'line' : 'lines'}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="swd-said" aria-live="polite">
                {picked ? 'Showing the ' + picked.from.length + ' source lines behind: ' + picked.t : data.hint}
              </p>
              <p className="skn-after">{data.after}</p>
            </>
          ) : (
            <div className="skn-idle">
              <p>Nothing structured yet. That is what a transcript is: a wall of words nobody reads twice.</p>
              <button type="button" className="sdemo-run" onClick={() => setRun(true)}>{data.action}</button>
            </div>
          )}
        </div>
      </div>

      {run ? (
        <button type="button" className="sdemo-reset skn-again" onClick={() => { setRun(false); setPick(null); }}>
          Start over
        </button>
      ) : null}
    </div>
  );
}

/* ── ask it something. The interesting part is who is asking ────────────────────────────────────────── */
export function AskScreen({ data }) {
  const askers = data.askers;
  const [who, setWho] = useState(askers ? askers[0].id : 'any');
  const [at, setAt] = useState(null);
  const [gaps, setGaps] = useState([]);

  const q = at === null ? null : data.questions[at];
  // Fall back to the shared answer when a question has no per-asker variant.
  const ans = q ? (q.a[who] || q.a.any) : null;

  const choose = (i) => {
    setAt(i);
    const question = data.questions[i];
    const a = question.a[who] || question.a.any;
    if (a && a.gap && gaps.indexOf(question.q) === -1) setGaps((g) => [...g, question.q]);
  };

  return (
    <div className="skn-ask">
      {askers ? (
        <div className="skn-askers">
          <span className="skn-askers-l" id="skn-who">Asking as</span>
          <div className="swd-seg" role="group" aria-labelledby="skn-who">
            {askers.map((a) => (
              <button
                key={a.id} type="button" className={'swd-seg-b' + (a.id === who ? ' is-on' : '')}
                aria-pressed={a.id === who} onClick={() => setWho(a.id)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <p className="skn-note">{data.askerNote}</p>

      <div className="sdemo-chips skn-qs">
        {data.questions.map((item, i) => (
          <button
            key={item.q} type="button" className={'sdemo-chip' + (at === i ? ' is-on' : '')}
            aria-pressed={at === i} onClick={() => choose(i)}
          >
            {item.q}
          </button>
        ))}
      </div>

      <div className="skn-answer" role="status">
        {!ans ? (
          <p className="swd-empty">Pick a question.</p>
        ) : ans.denied ? (
          <div className="skn-denied">
            <span className="skn-denied-i" aria-hidden="true"><Lock /></span>
            <div>
              <p className="skn-denied-l">Not in your index</p>
              <p className="skn-a-t">{ans.t}</p>
            </div>
          </div>
        ) : (
          <div className={'skn-a' + (ans.gap ? ' is-gap' : '')}>
            {ans.gap ? <p className="skn-gap-l">No answer, and that is the useful part</p> : null}
            <p className="skn-a-t">{ans.t}</p>

            {ans.decision ? (
              <div className="skn-dec">
                <div className="skn-dec-meta">
                  <span><i>Decided</i><b>{ans.decision.date}</b></span>
                  <span><i>Owner</i><b>{ans.decision.owner}</b></span>
                  <span><i>Status</i><b>{ans.decision.status}</b></span>
                </div>
                <p className="skn-dec-l">What was weighed</p>
                <ul className="skn-weighed">
                  {ans.decision.weighed.map((w) => {
                    const chosen = w.v.indexOf('Chosen') === 0;
                    return (
                      <li key={w.o} className={chosen ? 'is-chosen' : 'is-rejected'}>
                        <b>{w.o}</b>
                        <span>{w.v}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {ans.cites ? (
              <div className="sdemo-srcs">
                <span className="sdemo-srcs-l">From</span>
                {ans.cites.map((c) => (
                  <span key={c} className="sdemo-src">
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M14 3v5h5M8 3h7l5 5v13H8z" />
                    </svg>
                    {c}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {data.capture && gaps.length ? (
        <div className="skn-gaps">
          <p className="skn-gaps-l">{data.capture.label} <span>{gaps.length}</span></p>
          <ul>
            {gaps.map((g) => <li key={g}>{g}</li>)}
          </ul>
          <p className="skn-gaps-n">{data.capture.note}</p>
        </div>
      ) : null}

      <p className="skn-foot">{data.foot}</p>
    </div>
  );
}

/* ── one edit, and everything that depends on it moves ──────────────────────────────────────────────── */
export function WorkspaceScreen({ data }) {
  const [name, setName] = useState(data.client.name);
  const [matters, setMatters] = useState(data.matters);

  const setMatter = (id, patch) =>
    setMatters((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const total = matters.reduce((s, m) => s + (Number(m.value) || 0), 0);
  const atRisk = matters.filter((m) => m.status === 'At risk');
  const atRiskValue = atRisk.reduce((s, m) => s + (Number(m.value) || 0), 0);
  const gbp = (n) => '£' + n.toLocaleString('en-GB');
  const byStatus = data.statuses.map((s) => ({ s, items: matters.filter((m) => m.status === s) }));

  return (
    <div className="skn-ws">
      <div className="skn-editor">
        <p className="skn-pane-l">The record<span>Edit anything here</span></p>
        <label className="skn-field">
          <span>Client name</span>
          <input className="swd-ctl" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <ul className="skn-matters">
          {matters.map((m) => (
            <li key={m.id}>
              <span className="skn-m-n">{m.name}</span>
              <label className="skn-m-f skn-money">
                <span className="gs-sr-only">Value of {m.name} in pounds</span>
                {/* the views all render formatted money, so the field should not be the one raw number */}
                <span className="skn-cur" aria-hidden="true">£</span>
                <input
                  className="swd-ctl" type="number" min="0" step="1000" value={m.value}
                  onChange={(e) => setMatter(m.id, { value: e.target.value === '' ? 0 : Number(e.target.value) })}
                />
              </label>
              <label className="skn-m-f">
                <span className="gs-sr-only">Status of {m.name}</span>
                <select className="swd-ctl" value={m.status} onChange={(e) => setMatter(m.id, { status: e.target.value })}>
                  {data.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </li>
          ))}
        </ul>
        <p className="skn-note">{data.hint}</p>
      </div>

      <div className="skn-views" aria-live="polite">
        <div className="skn-view">
          <p className="skn-view-l">Clients database</p>
          <p className="skn-view-h">{name || 'Untitled client'}</p>
          <dl className="skn-roll">
            <div><dt>Matters</dt><dd>{matters.length}</dd></div>
            <div><dt>Total value</dt><dd>{gbp(total)}</dd></div>
            <div><dt>Owner</dt><dd>{data.client.owner}</dd></div>
            <div><dt>Renewal</dt><dd>{data.client.renewal}</dd></div>
          </dl>
        </div>

        <div className="skn-view">
          <p className="skn-view-l">Matters board</p>
          <div className="skn-board">
            {byStatus.map((col) => (
              <div key={col.s} className="skn-bcol">
                <p className="skn-bcol-l">{col.s} <span>{col.items.length}</span></p>
                {col.items.map((m) => (
                  <p key={m.id} className="skn-card">
                    <b>{m.name}</b>
                    <span>{name || 'Untitled client'} · {gbp(Number(m.value) || 0)}</span>
                  </p>
                ))}
                {!col.items.length ? <p className="skn-bempty">None</p> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="skn-view">
          <p className="skn-view-l">Leadership dashboard</p>
          <div className="swd-tiles skn-tiles">
            <div className="swd-tile"><b>{gbp(total)}</b><i>Pipeline</i></div>
            <div className="swd-tile"><b>{atRisk.length}</b><i>At risk</i></div>
            <div className="swd-tile"><b>{gbp(atRiskValue)}</b><i>Value at risk</i></div>
          </div>
          <p className="skn-note skn-wsnote">{data.note}</p>
        </div>
      </div>
    </div>
  );
}
