// The three screens in The Method demo.
import React, { useState } from 'react';

/* ── what got done, and what was parked ─────────────────────────────────────────────────────────────── */
export function WorklogScreen({ data }) {
  const [at, setAt] = useState(0);
  const p = data.periods[at];

  return (
    <div className="smt-log">
      <div className="smt-periods">
        <span className="smt-plabel" id="smt-pl">{data.periodLabel}</span>
        <div className="swd-opts" role="group" aria-labelledby="smt-pl">
          {data.periods.map((x, i) => (
            <button
              key={x.id} type="button" className={'swd-opt is-chip' + (i === at ? ' is-on' : '')}
              aria-pressed={i === at} onClick={() => setAt(i)}
            >
              {x.label}
            </button>
          ))}
        </div>
        <span className="smt-stamp">{p.stamp}</span>
      </div>

      <div className="smt-logcols" aria-live="polite">
        <div className="smt-col">
          <p className="smt-col-l">Done <span>{p.done.length}</span></p>
          <ul className="smt-items">
            {p.done.map((it) => (
              <li key={it.t} className={it.proactive ? 'is-proactive' : ''}>
                <b>{it.t}{it.proactive ? <span className="smt-pro">We found it</span> : null}</b>
                <span>{it.d}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="smt-col is-parked">
          <p className="smt-col-l">Parked for a person <span>{p.parked.length}</span></p>
          {p.parked.length ? (
            <ul className="smt-items">
              {p.parked.map((it) => (
                <li key={it.t}>
                  <b>{it.t}</b>
                  <span>{it.d}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="swd-empty">Nothing needed a person this time.</p>
          )}
        </div>
      </div>

      <p className="smt-metric"><i>{data.metric.label}</i><b>{data.metric.value}</b></p>
      <p className="smt-foot">{data.foot}</p>
    </div>
  );
}

/* ── did anyone use it ──────────────────────────────────────────────────────────────────────────────── */
export function AdoptionScreen({ data }) {
  const [at, setAt] = useState(0);
  const w = data.weeks[at].id;

  const totalHours = data.teams.reduce((s, t) => s + t.hours[w], 0);
  const avg = Math.round(data.teams.reduce((s, t) => s + t.use[w], 0) / data.teams.length);

  return (
    <div className="smt-adopt">
      <div className="smt-periods">
        <span className="smt-plabel" id="smt-wl">Since launch</span>
        <div className="swd-opts" role="group" aria-labelledby="smt-wl">
          {data.weeks.map((x, i) => (
            <button
              key={x.id} type="button" className={'swd-opt is-chip' + (i === at ? ' is-on' : '')}
              aria-pressed={i === at} onClick={() => setAt(i)}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>

      <div className="swd-tiles smt-tiles">
        <div className="swd-tile"><b>{avg}%</b><i>Average use</i></div>
        <div className="swd-tile"><b>{totalHours}</b><i>Hours back a week</i></div>
        <div className="swd-tile"><b>{data.teams.filter((t) => t.use[w] >= 70).length}/{data.teams.length}</b><i>Teams embedded</i></div>
      </div>

      <ul className="smt-teams" aria-live="polite">
        {data.teams.map((t) => (
          <li key={t.id}>
            <span className="smt-tn">{t.name}</span>
            <span className="smt-tbar" aria-hidden="true">
              <span className={t.use[w] >= 70 ? 'is-good' : t.use[w] >= 40 ? 'is-mid' : 'is-low'} style={{ width: t.use[w] + '%' }} />
            </span>
            <span className="smt-tv">{t.use[w]}%</span>
            <span className="smt-th">{t.hours[w]} hrs</span>
          </li>
        ))}
      </ul>

      <p className="smt-lens">{data.lens[w]}</p>
      <p className="smt-foot">{data.foot}</p>
    </div>
  );
}
