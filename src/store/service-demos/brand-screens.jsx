// The two production screens in the Brand, Content & Media demo.
//
// multiply  one brief goes in and the channel-shaped pieces come out. A proper tablist, because that is
//           what it is: parallel views of one thing, not a wizard.
// document  the modules are switches, and the artefact rebuilds as you throw them. The chart is part of
//           the document rather than a separate widget, since a chart that makes no argument is decoration.
import React, { useRef, useState } from 'react';

const mins = (m) => (m >= 90 ? Math.round(m / 60) + ' hrs' : m + ' min');

/* ── one brief, many pieces ─────────────────────────────────────────────────────────────────────────── */
export function MultiplyScreen({ data }) {
  const [at, setAt] = useState(0);
  const tabs = useRef([]);

  // Standard tablist keyboard behaviour: arrows move and focus follows, Home/End jump to the ends.
  const onKey = (e) => {
    const last = data.outputs.length - 1;
    let next = null;
    if (e.key === 'ArrowRight') next = at === last ? 0 : at + 1;
    else if (e.key === 'ArrowLeft') next = at === 0 ? last : at - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === null) return;
    e.preventDefault();
    setAt(next);
    const el = tabs.current[next];
    if (el) el.focus();
  };

  const out = data.outputs[at];

  return (
    <div className="sbd-mult">
      <div className="sbd-brief">
        <span className="sbd-brief-l">{data.briefLabel}</span>
        <p className="sbd-brief-t">{data.brief}</p>
      </div>

      <div className="sbd-arrow" aria-hidden="true">
        <span />
        <b>{data.outputs.length} pieces</b>
        <span />
      </div>

      <div className="sbd-tabs" role="tablist" aria-label="Pieces produced from the brief" onKeyDown={onKey}>
        {data.outputs.map((o, i) => (
          <button
            key={o.id} type="button" role="tab" id={'sbd-t-' + o.id}
            ref={(el) => { tabs.current[i] = el; }}
            className={'sbd-tab' + (i === at ? ' is-on' : '')}
            aria-selected={i === at} aria-controls={'sbd-p-' + o.id} tabIndex={i === at ? 0 : -1}
            onClick={() => setAt(i)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="sbd-panel" role="tabpanel" id={'sbd-p-' + out.id} aria-labelledby={'sbd-t-' + out.id} tabIndex={0}>
        <span className="sbd-panel-m">{out.meta}</span>
        <p className="sbd-panel-b">{out.body}</p>
      </div>

      <p className="sbd-voice">{data.voice}</p>
    </div>
  );
}

/* ── the document assembles itself ──────────────────────────────────────────────────────────────────── */
export function DocumentScreen({ data }) {
  const [on, setOn] = useState(() => {
    const s = {};
    data.modules.forEach((m) => { s[m.id] = !!m.on; });
    return s;
  });
  const [bar, setBar] = useState(0);

  const toggle = (id) => setOn((s) => ({ ...s, [id]: !s[id] }));
  const live = data.modules.filter((m) => on[m.id]);
  const frac = live.length / data.modules.length;
  const manual = Math.max(1, Math.round(data.manualMin * frac));
  const auto = Math.max(1, Math.round(data.autoMin * frac));

  const chart = data.chart;
  const max = chart ? Math.max(...chart.bars.map((b) => b.v)) : 1;

  return (
    <div className="sbd-doc">
      <fieldset className="sbd-mods">
        <legend className="sbd-mods-l">Modules</legend>
        {data.modules.map((m) => (
          <label key={m.id} className={'sbd-mod' + (on[m.id] ? ' is-on' : '')}>
            <input type="checkbox" checked={!!on[m.id]} onChange={() => toggle(m.id)} />
            {m.label}
          </label>
        ))}
      </fieldset>

      <div className="sbd-paper">
        <div className="sbd-paper-head">
          <span className="sbd-paper-mark" aria-hidden="true" />
          <div>
            <p className="sbd-paper-t">{data.title}</p>
            <p className="sbd-paper-c">{data.client}</p>
          </div>
        </div>

        {live.length ? live.map((m) => (
          <section key={m.id} className="sbd-sec">
            {m.chart && chart ? (
              <>
                <h4 className="sbd-sec-h">{chart.label}</h4>
                <div className="sbd-chart" role="group" aria-label={chart.label}>
                  {chart.bars.map((b, i) => (
                    <button
                      key={b.l} type="button" className={'sbd-bar' + (i === bar ? ' is-on' : '')}
                      aria-pressed={i === bar} onClick={() => setBar(i)}
                    >
                      <span className="sbd-bar-v">{b.v}</span>
                      <span className="sbd-bar-fill" style={{ height: Math.round((b.v / max) * 100) + '%' }} />
                      <span className="sbd-bar-l">{b.l}</span>
                    </button>
                  ))}
                </div>
                {/* the narrative layer: the chart is here to make a point, so the point is on the page */}
                <p className="sbd-point" aria-live="polite">{chart.bars[bar].point}</p>
              </>
            ) : (
              <>
                <h4 className="sbd-sec-h">{m.h}</h4>
                <p className="sbd-sec-b">{m.b}</p>
              </>
            )}
          </section>
        )) : (
          <p className="sbd-blank">Nothing switched on. That is a blank page, which is the thing this replaces.</p>
        )}
      </div>

      <div className="sbd-docfoot">
        {/* an estimate for nothing is not an estimate, so the meters sit out the empty state */}
        {live.length ? (
          <>
            <span className="sdemo-meter"><b>{mins(manual)}</b><i>drafted by hand</i></span>
            <span className="sdemo-meter-arrow" aria-hidden="true">→</span>
            <span className="sdemo-meter is-auto"><b>{mins(auto)}</b><i>assembled</i></span>
          </>
        ) : null}
        <p className="sbd-said" aria-live="polite">
          {live.length} of {data.modules.length} modules in
        </p>
      </div>
    </div>
  );
}
