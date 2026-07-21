// The three screens in the Intelligence & Reporting demo.
//
// All three exist to make the same point: a number on its own still needs somebody to interpret it, and
// that somebody is the cost these services remove. So in every screen the figure and the sentence
// explaining it are never more than one interaction apart.
import React, { useState } from 'react';

/* ── the trend line ─────────────────────────────────────────────────────────────────────────────────── */
// Hand-drawn SVG rather than a chart library: it is eight points, and a library would cost more than the
// whole demo. `projected` marks how many points at the end are a forecast, drawn dashed so a prediction is
// never mistaken for a measurement.
function Trend({ series, projected = 0, label }) {
  const W = 300, H = 84, PAD = 6;
  const n = series.length;
  const min = Math.min(...series), max = Math.max(...series);
  const span = max - min || 1;
  const pt = (v, i) => [
    PAD + (i / (n - 1)) * (W - PAD * 2),
    PAD + (1 - (v - min) / span) * (H - PAD * 2),
  ];
  const pts = series.map(pt);
  const cut = Math.max(0, n - 1 - projected);
  const solid = pts.slice(0, cut + 1);
  const dashed = pts.slice(cut);
  const path = (a) => a.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const area = solid.length > 1
    ? 'M' + path(solid).replace(/ /g, ' L') + ' L' + solid[solid.length - 1][0].toFixed(1) + ',' + (H - PAD) + ' L' + solid[0][0].toFixed(1) + ',' + (H - PAD) + ' Z'
    : '';

  return (
    <svg className="sir-trend" viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="none" role="img" aria-label={label}>
      {area ? <path d={area} className="sir-trend-area" /> : null}
      <polyline className="sir-trend-line" points={path(solid)} />
      {projected > 0 && dashed.length > 1 ? <polyline className="sir-trend-line is-proj" points={path(dashed)} /> : null}
      {pts.map((p, i) => (
        // strictly greater than the junction: point `cut` is the last real observation, and the dashed
        // line only starts there so it joins up. Styling it as forecast would mislabel a measurement.
        <circle key={i} cx={p[0]} cy={p[1]} r={i === n - 1 ? 3.4 : 1.8} className={'sir-trend-dot' + (i > cut && projected ? ' is-proj' : '')} />
      ))}
    </svg>
  );
}

/* ── tiles you drill into ───────────────────────────────────────────────────────────────────────────── */
export function DashScreen({ data }) {
  const roles = data.roles;
  const [role, setRole] = useState(roles ? roles[0].id : null);
  const tiles = roles ? data.tiles.filter((t) => !t.role || t.role.indexOf(role) > -1) : data.tiles;
  const [pick, setPick] = useState(data.tiles[0].id);
  // The selected tile can be filtered out by a role change, so fall back rather than render nothing.
  const tile = tiles.find((t) => t.id === pick) || tiles[0];

  return (
    <div className="sir-dash">
      <div className="sir-dashtop">
        <span className="sir-unit">{data.unit}</span>
        {roles ? (
          <div className="swd-seg" role="group" aria-label="Which view">
            {roles.map((r) => (
              <button
                key={r.id} type="button" className={'swd-seg-b' + (r.id === role ? ' is-on' : '')}
                aria-pressed={r.id === role} onClick={() => setRole(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="sir-tiles" role="group" aria-label="Metrics">
        {tiles.map((t) => (
          <button
            key={t.id} type="button" className={'sir-tile' + (t.id === tile.id ? ' is-on' : '')}
            aria-pressed={t.id === tile.id} onClick={() => setPick(t.id)}
          >
            <span className="sir-tile-l">
              {t.label}
              {t.alert ? <span className="sir-flag" title="Past its threshold">!</span> : null}
            </span>
            <span className="sir-tile-v">{t.value}</span>
            {t.delta ? (
              <span className={'sir-delta' + (t.good === true ? ' is-good' : t.good === false ? ' is-bad' : '')}>
                {t.delta}
                {/* direction is in the sign, never in the colour alone */}
                <span className="gs-sr-only">{t.good === false ? ' (against you)' : t.good === true ? ' (in your favour)' : ''}</span>
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="sir-detail">
        <div className="sir-detail-head">
          <h4 className="sir-detail-h">{tile.label}</h4>
          {data.projected ? <span className="sir-legend">Last {data.projected} points are forecast</span> : null}
        </div>
        <Trend
          series={tile.series} projected={data.projected || 0}
          label={tile.label + ': ' + tile.series.join(', ') + (data.projected ? '. The last ' + data.projected + ' are forecast.' : '')}
        />
        {/* the whole point of the category: the number and its explanation, together */}
        <p className="sir-say" aria-live="polite">{tile.say}</p>
        {tile.rec ? <p className="sir-rec"><b>Do this</b> {tile.rec}</p> : null}
        {tile.from ? <p className="sir-from"><b>Traced to</b> {tile.from}</p> : null}
      </div>
    </div>
  );
}

/* ── a ranked or tiered list where every row shows its reason ───────────────────────────────────────── */
export function ListScreen({ data }) {
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(data.rows[0].id);

  const rows = filter ? data.rows.filter((r) => r.tier === filter) : data.rows;
  const tierOf = (id) => data.tiers.find((t) => t.id === id) || { label: id, tone: '' };
  const flagged = data.rows.filter((r) => r.call);

  return (
    <div className="sir-list">
      <div className="sir-listtop">
        <div className="swd-opts" role="group" aria-label={'Filter by ' + data.filterLabel.toLowerCase()}>
          <button type="button" className={'swd-opt is-chip' + (!filter ? ' is-on' : '')} aria-pressed={!filter} onClick={() => setFilter('')}>
            All
          </button>
          {data.tiers.map((t) => (
            <button
              key={t.id} type="button" className={'swd-opt is-chip' + (filter === t.id ? ' is-on' : '')}
              aria-pressed={filter === t.id} onClick={() => setFilter(t.id)}
            >
              {t.label} <span className="sir-n">{data.rows.filter((r) => r.tier === t.id).length}</span>
            </button>
          ))}
        </div>
        <p className="sir-cta">
          <b>{flagged.length}</b> {data.callToAction.toLowerCase()}
        </p>
      </div>

      <p className="swd-said" aria-live="polite">
        Showing {rows.length} of {data.rows.length} {data.what}
      </p>

      <ul className="sir-rows">
        {rows.map((r, i) => {
          const t = tierOf(r.tier);
          const isOpen = open === r.id;
          return (
            <li key={r.id} className={'sir-row' + (isOpen ? ' is-open' : '')}>
              <button
                type="button" className="sir-rowbtn" aria-expanded={isOpen} aria-controls={'sir-ev-' + r.id}
                onClick={() => setOpen(isOpen ? null : r.id)}
              >
                {data.ranked ? <span className="sir-rank">{data.rows.indexOf(r) + 1}</span> : null}
                <span className="sir-rowmain">
                  <span className="sir-rowtop">
                    <span className="sir-name">{r.name}</span>
                    <span className={'sir-tier is-' + t.tone}>{t.label}</span>
                    {r.call ? <span className="sir-callchip">Act</span> : null}
                  </span>
                  <span className="sir-meta">{r.meta}</span>
                  {/* the reason, always on the row: a score with no reason is a score nobody trusts */}
                  <span className="sir-why">{r.why}</span>
                </span>
                <span className="sir-chev" aria-hidden="true">{isOpen ? '−' : '+'}</span>
              </button>
              <div className="sir-ev" id={'sir-ev-' + r.id} hidden={!isOpen}>
                <p className="sir-ev-l">What that is based on</p>
                <ul>
                  {r.evidence.map((e) => <li key={e}>{e}</li>)}
                </ul>
              </div>
            </li>
          );
        })}
        {!rows.length ? <li className="swd-empty">Nothing in that band right now.</li> : null}
      </ul>
    </div>
  );
}

/* ── the written edition ────────────────────────────────────────────────────────────────────────────── */
export function BriefScreen({ data }) {
  const [at, setAt] = useState(0);
  const ed = data.editions[at];

  return (
    <div className="sir-brief">
      {data.editions.length > 1 ? (
        <div className="sir-picker">
          <span className="sir-picker-l" id="sir-pl">{data.pickerLabel}</span>
          <div className="swd-opts" role="group" aria-labelledby="sir-pl">
            {data.editions.map((e, i) => (
              <button
                key={e.id} type="button" className={'swd-opt is-chip' + (i === at ? ' is-on' : '')}
                aria-pressed={i === at} onClick={() => setAt(i)}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <article className="sir-paper" aria-live="polite">
        <p className="sir-stamp">{ed.stamp}</p>
        <p className="sir-headline">{ed.headline}</p>
        {ed.sections.map((s) => (
          <section key={s.h} className="sir-sec">
            <h4 className="sir-sec-h">{s.h}</h4>
            <p className="sir-sec-b">{s.b}</p>
            {s.src ? (
              <ul className="sir-src">
                {s.src.map((c) => <li key={c}>{c}</li>)}
              </ul>
            ) : null}
          </section>
        ))}
      </article>

      {data.cited ? (
        <p className="sbd-voice">Every claim carries its source, and anything that could not be verified is named as unverified rather than dropped.</p>
      ) : null}
    </div>
  );
}
