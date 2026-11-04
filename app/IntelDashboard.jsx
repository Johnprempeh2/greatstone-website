'use client';

// GRE-1861: the public AI intelligence dashboard, the site's version of GSAM's Intelligence page.
// Overview (lead story, what is trending, the numbers, the podium, the movers), the three leaderboards,
// a two-model compare and the news. It reads only the public snapshot (next-proof/intelligence-public.mjs).
import { useId, useRef, useState } from 'react';

const TABS = [['overview', 'Overview'], ['leaderboards', 'Leaderboards'], ['compare', 'Compare'], ['news', 'News']];
const BOARD_LABEL = { ai_systems: 'AI assistants', frontier_models: 'Frontier models', tools_agents: 'Tools and agents' };
const SCORE_LABEL = { ai_systems: 'Score out of 100', frontier_models: 'Intelligence Index', tools_agents: 'Score out of 100' };
const SPEC_LABEL = { speed: 'Speed (tokens a second)', context: 'Context window', priceIn: 'Input, $ per million tokens', priceOut: 'Output, $ per million tokens' };

const day = (value, year = false) => {
  if (!value) return '';
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' });
};

function Mark({ name = '', domain }) {
  const letter = (name.trim()[0] || '?').toUpperCase();
  return <span className="gi-mark" aria-hidden="true" data-domain={domain || undefined}>{letter}</span>;
}

function Movement({ movement }) {
  if (!movement) return null;
  if (movement.isNew) return <span className="gi-move is-new">New</span>;
  const delta = movement.rankDelta || 0;
  if (!delta) return <span className="gi-move is-flat"><span aria-hidden="true">=</span><span className="gi-sr">No change in rank</span></span>;
  const up = delta > 0;
  return (
    <span className={`gi-move ${up ? 'is-up' : 'is-down'}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'} {Math.abs(delta)}</span>
      <span className="gi-sr">{up ? 'Up' : 'Down'} {Math.abs(delta)} {Math.abs(delta) === 1 ? 'place' : 'places'}</span>
    </span>
  );
}

function Out({ href, className, children }) {
  return href ? <a className={className} href={href} target="_blank" rel="noreferrer noopener">{children}</a> : <span className={className}>{children}</span>;
}

function SectionHead({ title, action, onAction }) {
  return (
    <div className="gi-head">
      <h3>{title}</h3>
      {action ? <button type="button" className="gi-link" onClick={onAction}>{action}<span aria-hidden="true"> →</span></button> : null}
    </div>
  );
}

function Lead({ item }) {
  return (
    <article className="gi-card gi-lead">
      <p className="gi-meta"><span>{item.sourceName}</span>{item.tag ? <span className="gi-tag">{item.tag}</span> : null}{item.date ? <time dateTime={item.date}>{day(item.date)}</time> : null}</p>
      <h4><Out href={item.url}>{item.headline}</Out></h4>
      {item.verdict ? <p className="gi-verdict">{item.verdict}</p> : null}
      {item.points ? <ul className="gi-points">{item.points.slice(0, 3).map((point) => <li key={point}>{point}</li>)}</ul> : null}
      <Out href={item.url} className="gi-source">Read at {item.sourceName || 'the source'}<span aria-hidden="true"> ↗</span></Out>
    </article>
  );
}

function Stat({ label, value, sub }) {
  return <div className="gi-card gi-stat"><span className="gi-stat-label">{label}</span><span className="gi-stat-value">{value}</span><span className="gi-stat-sub">{sub}</span></div>;
}

function Podium({ view }) {
  const [first, second, third] = view.entries;
  const step = (entry, place) => entry ? (
    <li className={`gi-step gi-step-${place}`} key={entry.name}>
      <Mark name={entry.maker || entry.name} domain={entry.domain} />
      <span className="gi-step-name">{entry.name}</span>
      <span className="gi-step-maker">{entry.maker}</span>
      <span className="gi-step-score">{entry.score ?? 'n/a'}</span>
      <span className="gi-step-place" aria-label={`Place ${entry.rank}`}>#{entry.rank}</span>
    </li>
  ) : null;
  return <ol className="gi-podium" aria-label={`Top three, ${BOARD_LABEL[view.board]}`}>{step(second, 2)}{step(first, 1)}{step(third, 3)}</ol>;
}

function Board({ view, limit }) {
  const max = Math.max(1, ...view.entries.map((entry) => entry.score ?? 0));
  const rows = limit ? view.entries.slice(0, limit) : view.entries;
  return (
    <section className="gi-card gi-board" aria-label={BOARD_LABEL[view.board]}>
      <div className="gi-board-head">
        <h3>{BOARD_LABEL[view.board]}</h3>
        <p>{SCORE_LABEL[view.board]}{view.comparedTo ? `. Movement since ${day(view.comparedTo)}` : ''}</p>
      </div>
      <ol className="gi-rows">
        {rows.map((entry) => (
          <li key={entry.name} className="gi-row">
            <span className="gi-rank">{entry.rank}</span>
            <Mark name={entry.maker || entry.name} domain={entry.domain} />
            <span className="gi-row-name">
              <Out href={entry.url}>{entry.name}</Out>
              {entry.flagship || entry.maker ? <small>{entry.flagship || entry.maker}</small> : null}
            </span>
            <span className="gi-bar" aria-hidden="true"><span style={{ width: `${Math.max(2, ((entry.score ?? 0) / max) * 100)}%` }} /></span>
            <span className="gi-score">{entry.score ?? 'n/a'}</span>
            <Movement movement={entry.movement} />
            {!limit && entry.verdict ? <p className="gi-row-note">{entry.verdict}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Compare({ view }) {
  const names = view?.entries.map((entry) => entry.name) ?? [];
  const [left, setLeft] = useState(names[0]);
  const [right, setRight] = useState(names[1]);
  if (names.length < 2) return <p className="gi-empty">Compare needs at least two frontier models.</p>;
  const a = view.entries.find((entry) => entry.name === left) ?? view.entries[0];
  const b = view.entries.find((entry) => entry.name === right) ?? view.entries[1];
  const show = (value) => (value === undefined || value === null ? 'n/a' : String(value));
  const rows = [['Rank', a.rank, b.rank], ['Model', a.flagship, b.flagship], ['Intelligence Index', a.score, b.score],
    ...Object.keys(SPEC_LABEL).map((key) => [SPEC_LABEL[key], a.specs?.[key], b.specs?.[key]])];
  return (
    <div className="gi-compare">
      <div className="gi-pickers">
        <label>First model<select value={a.name} onChange={(event) => setLeft(event.target.value)}>{names.map((name) => <option key={name}>{name}</option>)}</select></label>
        <label>Second model<select value={b.name} onChange={(event) => setRight(event.target.value)}>{names.map((name) => <option key={name}>{name}</option>)}</select></label>
      </div>
      <div className="gi-card gi-table-wrap">
        <table className="gi-table">
          <thead><tr><th scope="col">Measure</th><th scope="col">{a.name}</th><th scope="col">{b.name}</th></tr></thead>
          <tbody>{rows.map(([label, x, y]) => <tr key={label}><th scope="row">{label}</th><td>{show(x)}</td><td>{show(y)}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="gi-fine">Index and speed from published independent benchmarks. Prices are each maker’s list prices in US dollars.</p>
    </div>
  );
}

function NewsList({ items }) {
  return (
    <ul className="gi-news">
      {items.map((item) => (
        <li key={item.url + item.headline} className="gi-card gi-news-card">
          <p className="gi-meta"><span>{item.sourceName}</span>{item.tag ? <span className="gi-tag">{item.tag}</span> : null}{item.date ? <time dateTime={item.date}>{day(item.date)}</time> : null}{item.rumoured ? <span className="gi-tag">Rumoured</span> : null}</p>
          <h4><Out href={item.url}>{item.headline}</Out></h4>
          {item.verdict ? <p>{item.verdict}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function Overview({ data, open }) {
  const by = (board) => data.boards.find((view) => view.board === board);
  const systems = by('ai_systems'); const models = by('frontier_models'); const tools = by('tools_agents');
  const lead = data.news.find((item) => item.lead) ?? data.news[0];
  const trending = data.news.filter((item) => item !== lead).slice(0, 5);
  const stats = [
    systems && { label: 'Top AI assistant', value: systems.entries[0].score ?? 'n/a', sub: systems.entries[0].name },
    models && { label: 'Top model, Index', value: models.entries[0].score ?? 'n/a', sub: models.entries[0].flagship || models.entries[0].name },
    tools && { label: 'Tools tracked', value: tools.entries.length, sub: 'Agents and builders' },
    { label: 'Updates today', value: data.news.length, sub: 'In the briefing' },
  ].filter(Boolean);
  return (
    <div className="gi-stack">
      {lead ? (
        <section aria-label="Leading the field">
          <SectionHead title="Leading the field" action="All news" onAction={() => open('news')} />
          <div className="gi-lead-grid">
            <Lead item={lead} />
            {trending.length ? (
              <aside className="gi-card gi-trending" aria-label="Trending now">
                <h4 className="gi-kicker">Trending now</h4>
                <ol>{trending.map((item) => (
                  <li key={item.url + item.headline}><Out href={item.url}>
                    <span className="gi-meta"><span className="gi-tag">{item.tag || item.sourceName}</span>{item.date ? <time dateTime={item.date}>{day(item.date)}</time> : null}</span>
                    <span className="gi-trend-h">{item.headline}</span>
                  </Out></li>
                ))}</ol>
              </aside>
            ) : null}
          </div>
        </section>
      ) : null}
      <div className="gi-stats">{stats.map((stat) => <Stat key={stat.label} {...stat} />)}</div>
      {systems ? (
        <section aria-label="The podium">
          <SectionHead title={`Podium, ${BOARD_LABEL.ai_systems}`} action="Full leaderboards" onAction={() => open('leaderboards')} />
          <Podium view={systems} />
        </section>
      ) : null}
      <div className="gi-two">
        {models ? <Board view={models} limit={5} /> : null}
        {data.movers.length ? (
          <section className="gi-card gi-movers" aria-label="Movers">
            <div className="gi-board-head"><h3>Movers</h3><p>What changed on the benchmarks</p></div>
            <ul>{data.movers.map((item) => (
              <li key={item.name}>
                <span className={`gi-move ${item.direction === 'up' ? 'is-up' : 'is-down'}`}><span aria-hidden="true">{item.direction === 'up' ? '▲' : '▼'}</span><span className="gi-sr">{item.direction === 'up' ? 'Up' : 'Down'}</span></span>
                <span><Out href={item.url}>{item.name}</Out>{item.note ? <small>{item.note}</small> : null}</span>
              </li>
            ))}</ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

export default function IntelDashboard({ data, tab: initial = 'overview' }) {
  const [tab, setTab] = useState(TABS.some(([id]) => id === initial) ? initial : 'overview');
  const tabs = useRef([]);
  const base = useId();
  if (!data || (!data.boards.length && !data.news.length)) {
    return <div className="gi"><style>{css}</style><p className="gi-empty">Today’s intelligence is not available yet. Please check back later.</p></div>;
  }
  const open = (id) => { setTab(id); tabs.current[TABS.findIndex(([key]) => key === id)]?.focus(); };
  const onKey = (event, index) => {
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    open(TABS[(next + TABS.length) % TABS.length][0]);
  };
  return (
    <div className="gi">
      <style>{css}</style>
      <div className="gi-bar-top">
        <div role="tablist" aria-label="Intelligence views" className="gi-tabs">
          {TABS.map(([id, label], index) => (
            <button key={id} ref={(node) => { tabs.current[index] = node; }} type="button" role="tab" id={`${base}-${id}`}
              aria-selected={tab === id} aria-controls={`${base}-${id}-panel`} tabIndex={tab === id ? 0 : -1}
              className="gi-tab" onClick={() => setTab(id)} onKeyDown={(event) => onKey(event, index)}>{label}</button>
          ))}
        </div>
        {data.date ? <p className="gi-updated"><span className="gi-dot" aria-hidden="true" />Updated {day(data.date, true)}</p> : null}
      </div>
      <div role="tabpanel" id={`${base}-${tab}-panel`} aria-labelledby={`${base}-${tab}`} className="gi-panel">
        {tab === 'overview' ? <Overview data={data} open={open} /> : null}
        {tab === 'leaderboards' ? <div className="gi-boards">{data.boards.map((view) => <Board key={view.board} view={view} />)}</div> : null}
        {tab === 'compare' ? <Compare view={data.boards.find((view) => view.board === 'frontier_models')} /> : null}
        {tab === 'news' ? <NewsList items={data.news} /> : null}
      </div>
    </div>
  );
}

const css = `
.gi{--gi-lime:#c8ff00;--gi-teal:#4ecdc4;--gi-ink:#f2f4ef;--gi-mute:#a3a9a0;--gi-line:rgba(255,255,255,.08);color:var(--gi-ink);font-family:inherit}
.gi-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.gi-bar-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 24px;margin-bottom:28px}
.gi-tabs{display:flex;gap:4px;padding:4px;border:1px solid var(--gi-line);border-radius:999px;background:rgba(30,38,32,.55);overflow-x:auto;max-width:100%;scrollbar-width:none}
.gi-tab{flex:none;min-height:40px;padding:0 18px;border:0;border-radius:999px;background:transparent;color:var(--gi-mute);font:inherit;font-size:14px;font-weight:700;cursor:pointer;transition:color .2s,background .2s}
.gi-tab:hover{color:var(--gi-ink)}
.gi-tab[aria-selected="true"]{background:var(--gi-lime);color:#0e1611}
.gi-tab:focus-visible,.gi-link:focus-visible,.gi a:focus-visible,.gi select:focus-visible{outline:2px solid var(--gi-teal);outline-offset:2px}
.gi-updated{display:flex;align-items:center;gap:8px;margin:0;color:var(--gi-mute);font-size:13px}
.gi-dot{width:7px;height:7px;border-radius:50%;background:var(--gi-lime);box-shadow:0 0 10px rgba(200,255,0,.6)}
.gi-stack{display:grid;gap:40px}
.gi-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:14px}
.gi-head h3,.gi-kicker{margin:0;color:var(--gi-teal);font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase}
.gi-link{border:0;background:none;padding:4px 0;color:var(--gi-ink);font:inherit;font-size:14px;font-weight:700;cursor:pointer}
.gi-link:hover{color:var(--gi-lime)}
.gi-card{background:rgba(30,38,32,.55);border:1px solid rgba(255,255,255,.07);border-radius:18px;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
.gi a{color:inherit;text-decoration:none}
.gi a:hover{color:var(--gi-lime)}
.gi-lead-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:20px}
.gi-lead{padding:32px;display:flex;flex-direction:column;gap:14px;border-color:rgba(200,255,0,.25)}
.gi-lead h4{margin:0;font-size:clamp(24px,2.4vw,34px);font-weight:800;line-height:1.15;letter-spacing:-.02em;text-wrap:balance}
.gi-verdict{margin:0;color:#dfe3dc;font-size:17px;line-height:1.55;max-width:62ch}
.gi-points{margin:0;padding-left:18px;color:var(--gi-mute);line-height:1.55;display:grid;gap:6px}
.gi-source{margin-top:auto;color:var(--gi-lime)!important;font-weight:700;font-size:14px}
.gi-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:0;color:var(--gi-mute);font-size:13px}
.gi-meta>span:first-child{color:var(--gi-ink);font-weight:700}
.gi-tag{padding:2px 9px;border:1px solid rgba(78,205,196,.35);border-radius:999px;color:var(--gi-teal);font-size:12px;font-weight:700}
.gi-meta>.gi-tag:first-child{color:var(--gi-teal)}
.gi-trending{padding:24px}
.gi-trending ol{list-style:none;margin:14px 0 0;padding:0;display:grid}
.gi-trending li+li{border-top:1px solid var(--gi-line)}
.gi-trending a{display:grid;gap:6px;padding:12px 0}
.gi-trend-h{font-size:15px;font-weight:700;line-height:1.35}
.gi-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.gi-stat{display:grid;gap:4px;padding:20px 22px}
.gi-stat-label{color:var(--gi-mute);font-size:13px}
.gi-stat-value{font-size:36px;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.gi-stat-sub{color:var(--gi-mute);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gi-podium{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:end;gap:16px}
.gi-step{position:relative;display:grid;justify-items:center;gap:6px;padding:24px 16px;text-align:center;background:rgba(30,38,32,.55);border:1px solid rgba(255,255,255,.07);border-radius:18px 18px 6px 6px}
.gi-step-1{min-height:250px;border-color:rgba(200,255,0,.4);box-shadow:0 0 0 1px rgba(200,255,0,.08),0 18px 48px -24px rgba(200,255,0,.35)}
.gi-step-2{min-height:215px}.gi-step-3{min-height:190px}
.gi-step-name{font-size:18px;font-weight:800}
.gi-step-maker{color:var(--gi-mute);font-size:13px}
.gi-step-score{margin-top:auto;font-size:40px;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.gi-step-1 .gi-step-score{color:var(--gi-lime)}
.gi-step-place{position:absolute;top:12px;right:14px;color:var(--gi-mute);font-size:12px;font-weight:800}
.gi-mark{display:inline-grid;place-items:center;flex:none;width:32px;height:32px;border-radius:10px;background:rgba(78,205,196,.12);border:1px solid rgba(78,205,196,.3);color:var(--gi-teal);font-size:14px;font-weight:800}
.gi-step .gi-mark{width:44px;height:44px;font-size:18px}
.gi-two{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:20px;align-items:start}
.gi-board{padding:24px}
.gi-board-head h3{margin:0;font-size:20px;font-weight:800}
.gi-board-head p{margin:4px 0 16px;color:var(--gi-mute);font-size:13px}
.gi-rows{list-style:none;margin:0;padding:0}
.gi-row{display:grid;grid-template-columns:24px 32px minmax(0,1.3fr) minmax(60px,1fr) 40px 52px;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--gi-line)}
.gi-rank{color:var(--gi-mute);font-size:13px;font-weight:800;font-variant-numeric:tabular-nums}
.gi-row-name{display:grid;min-width:0;font-weight:700}
.gi-row-name small{color:var(--gi-mute);font-weight:500;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gi-bar{height:6px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden}
.gi-bar span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--gi-teal),var(--gi-lime))}
.gi-score{text-align:right;font-weight:800;font-variant-numeric:tabular-nums}
.gi-row-note{grid-column:3/-1;margin:0;color:var(--gi-mute);font-size:13px;line-height:1.5}
.gi-move{justify-self:end;font-size:12px;font-weight:800;white-space:nowrap}
.gi-move.is-up{color:var(--gi-lime)}.gi-move.is-down{color:#ff9d7a}.gi-move.is-flat{color:var(--gi-mute)}.gi-move.is-new{color:var(--gi-teal)}
.gi-boards{display:grid;gap:20px}
.gi-movers{padding:24px}
.gi-movers ul{list-style:none;margin:0;padding:0}
.gi-movers li{display:grid;grid-template-columns:20px minmax(0,1fr);gap:10px;padding:12px 0;border-top:1px solid var(--gi-line);font-weight:700}
.gi-movers li .gi-move{justify-self:start;padding-top:2px}
.gi-movers small{display:block;margin-top:4px;color:var(--gi-mute);font-weight:500;font-size:13px;line-height:1.45}
.gi-compare{display:grid;gap:16px}
.gi-pickers{display:grid;grid-template-columns:repeat(2,minmax(0,280px));gap:12px}
.gi-pickers label{display:grid;gap:6px;color:var(--gi-mute);font-size:13px;font-weight:700}
.gi-pickers select{min-height:44px;padding:0 12px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:#121813;color:var(--gi-ink);font:inherit;font-size:15px}
.gi-table-wrap{overflow-x:auto}
.gi-table{width:100%;border-collapse:collapse;font-size:15px}
.gi-table th,.gi-table td{padding:14px 20px;border-top:1px solid var(--gi-line);text-align:right;font-variant-numeric:tabular-nums}
.gi-table thead th{border-top:0;color:var(--gi-ink);font-weight:800}
.gi-table th[scope="row"],.gi-table thead th:first-child{text-align:left;color:var(--gi-mute);font-weight:600}
.gi-fine{margin:0;color:var(--gi-mute);font-size:13px}
.gi-news{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.gi-news-card{display:grid;align-content:start;gap:10px;padding:24px}
.gi-news-card h4{margin:0;font-size:18px;font-weight:800;line-height:1.3}
.gi-news-card p:not(.gi-meta){margin:0;color:#c4c8c1;line-height:1.55;font-size:15px}
.gi-empty{margin:0;padding:32px;color:var(--gi-mute)}
@media (max-width:960px){.gi-lead-grid,.gi-two{grid-template-columns:1fr}.gi-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:600px){
  .gi-bar-top{margin-bottom:20px}.gi-tabs{display:grid;grid-template-columns:repeat(4,auto);width:100%}.gi .gi-tab{padding:0 6px;font-size:13px}.gi-lead{padding:22px}.gi-stat{padding:16px}.gi-stat-value{font-size:28px}
  .gi-podium{gap:8px}.gi-step{padding:18px 8px}.gi-step-name{font-size:15px}.gi-step-score{font-size:28px}
  .gi-step-1{min-height:210px}.gi-step-2{min-height:180px}.gi-step-3{min-height:160px}
  .gi-row{grid-template-columns:20px 28px minmax(0,1fr) 36px 40px;gap:8px}.gi-row .gi-bar{display:none}.gi-row .gi-mark{width:28px;height:28px}
  .gi-row-note{grid-column:1/-1}
  .gi-pickers{grid-template-columns:1fr 1fr}.gi-table th,.gi-table td{padding:12px}
  .gi-news{grid-template-columns:1fr}
}
@media (prefers-reduced-motion:reduce){.gi-tab{transition:none}}
`;
