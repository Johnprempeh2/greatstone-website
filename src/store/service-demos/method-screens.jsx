// The three screens in The Method demo.
import React, { useState } from 'react';

/* ── the radar ──────────────────────────────────────────────────────────────────────────────────────── */
// Hand-drawn, N-sided, and deliberately honest about what has not been answered: an unread axis gets a
// hollow marker at the rim and is left OUT of the polygon, rather than being drawn at zero and implying a
// score nobody gave.
function Radar({ axes, scores, label }) {
  // Wider than tall on purpose: side labels like "Communication" and "Competition" need horizontal room
  // outside the ring, and a square viewBox clipped them.
  const W = 380, H = 296, CX = W / 2, CY = 144, R = 86, MAX = 3;
  const n = axes.length;
  const at = (i, r) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
  };
  const ring = (r) => axes.map((_, i) => at(i, r).map((v) => v.toFixed(1)).join(',')).join(' ');
  const answered = axes.map((ax, i) => ({ ax, i })).filter(({ ax }) => scores[ax.id] != null);
  const poly = answered.map(({ ax, i }) => at(i, (scores[ax.id] / MAX) * R).map((v) => v.toFixed(1)).join(',')).join(' ');

  return (
    <svg className="smt-radar" viewBox={'0 0 ' + W + ' ' + H} role="img" aria-label={label}>
      {[1, 2, 3].map((r) => (
        <polygon key={r} className="smt-ring" points={ring((r / MAX) * R)} />
      ))}
      {axes.map((ax, i) => {
        const [x, y] = at(i, R);
        return <line key={ax.id} className="smt-spoke" x1={CX} y1={CY} x2={x} y2={y} />;
      })}
      {answered.length > 1 ? <polygon className="smt-shape" points={poly} /> : null}
      {axes.map((ax, i) => {
        const s = scores[ax.id];
        const [x, y] = at(i, s == null ? R : (s / MAX) * R);
        return (
          <circle
            key={ax.id} cx={x} cy={y} r={s == null ? 3 : 4.5}
            className={'smt-dot' + (s == null ? ' is-unread' : '')}
          />
        );
      })}
      {axes.map((ax, i) => {
        const [x, y] = at(i, R + 19);
        return (
          <text
            key={ax.id} x={x} y={y} className={'smt-alabel' + (scores[ax.id] == null ? ' is-unread' : '')}
            textAnchor={x < CX - 4 ? 'end' : x > CX + 4 ? 'start' : 'middle'}
            dominantBaseline={y < CY ? 'auto' : 'hanging'}
          >
            {ax.name}
          </text>
        );
      })}
    </svg>
  );
}

/* ── the assessment ─────────────────────────────────────────────────────────────────────────────────── */
export function AssessScreen({ data }) {
  const [answers, setAnswers] = useState({});

  const pick = (qi, oi) => setAnswers((a) => ({ ...a, [qi]: oi }));
  const reset = () => setAnswers({});

  const scores = {};
  let mins = 0;
  data.questions.forEach((q, qi) => {
    const oi = answers[qi];
    if (oi == null) return;
    scores[q.axis] = q.options[oi].score;
    mins += q.options[oi].mins;
  });

  const answeredCount = Object.keys(answers).length;
  const unread = data.axes.filter((a) => scores[a.id] == null);
  // Ranked by what you said, weakest first. This order is the deliverable.
  const ranked = data.axes
    .filter((a) => scores[a.id] != null)
    .sort((x, y) => scores[x.id] - scores[y.id]);
  const hours = Math.round(mins / 60);

  const radarLabel = answeredCount
    ? data.axes.map((a) => a.name + ': ' + (scores[a.id] == null ? 'not read' : scores[a.id] + ' out of 3')).join('. ')
    : 'Nothing answered yet.';

  return (
    <div className="smt-assess">
      <p className="smt-intro">{data.intro}</p>

      <div className="smt-grid">
        <div className="smt-qs">
          {data.questions.map((q, qi) => {
            const axis = data.axes.find((a) => a.id === q.axis);
            return (
              <fieldset key={q.axis} className="smt-q">
                <legend>
                  <span className="smt-qax">{axis ? axis.name : q.axis}</span>
                  {q.q}
                </legend>
                <div className="swd-opts">
                  {q.options.map((o, oi) => (
                    <label key={o.label} className={'swd-radio' + (answers[qi] === oi ? ' is-on' : '')}>
                      <input type="radio" name={'smt-q' + qi} checked={answers[qi] === oi} onChange={() => pick(qi, oi)} />
                      {o.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
          {answeredCount ? (
            <button type="button" className="sdemo-reset" onClick={reset}>Clear answers</button>
          ) : null}
        </div>

        <aside className="smt-read" aria-label="Your read">
          <Radar axes={data.axes} scores={scores} label={radarLabel} />

          <p className="smt-progress" aria-live="polite">
            {answeredCount
              ? answeredCount + ' of ' + data.questions.length + ' answered'
                + (unread.length ? ', ' + unread.length + ' ' + data.unit + ' not covered by this short version' : '')
              : 'Answer anything on the left and the read builds here.'}
          </p>

          {!data.noTime && answeredCount ? (
            <p className="smt-hours">
              <b>{hours} hrs</b>
              <span>a week going into manual work, on your answers so far</span>
            </p>
          ) : null}

          {ranked.length ? (
            <div className="smt-plan">
              <p className="smt-plan-l">What we would do, in this order</p>
              <ol>
                {ranked.map((a) => (
                  <li key={a.id}>
                    <span className="smt-plan-h">
                      <b>{a.name}</b>
                      <i>{scores[a.id]}/3</i>
                    </span>
                    <span className="smt-plan-f">{(data.fixes[a.id] || {}).fix}</span>
                    <span className="smt-plan-b">{(data.fixes[a.id] || {}).back}</span>
                  </li>
                ))}
              </ol>
              {data.buildNote ? <p className="smt-build">{data.buildNote}</p> : null}
            </div>
          ) : null}
        </aside>
      </div>

      <p className="smt-foot">{data.foot}</p>
    </div>
  );
}

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
