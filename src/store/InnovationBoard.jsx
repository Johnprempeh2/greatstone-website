// What we proposed, where each one sits, and what it would take to decide.
//
// ⚠ THE DECK'S VERSION PUT A NAME ON EVERY DOT and they collided the moment two proposals scored
// alike. A chart can be completely unreadable and still pass every check we have: overflow measures
// the page, contrast measures colour, and nothing compares one label to another. So the names are
// not on the dots at all. Each dot carries a number, the numbers are in a list beside the chart,
// and a collision is impossible by construction rather than by luck.
//
// ⚠ AN UNSCORED PROPOSAL IS NOT PLOTTED. A dot in the middle of the chart is a claim that something
// is medium effort and medium impact; "nobody has weighed this yet" is a different statement and
// gets said in words underneath.
//
// ⚠ POSITION IS OURS, NOT THEIRS. Effort and impact are Greatstone's assessment. The chart says so
// on its face, because a client reading it as their own prioritisation is the one misreading that
// would actually cost something.
import React, { useMemo, useState } from 'react';
import { Labelled } from './DeepDiveIcons.jsx';
import { groupByLead } from './deepdive-lead.mjs';
import { itemHref } from '../lib/deepdive-route.mjs';
import {
  BUILD_STATES, BUILD_STATE_WORD, BUILD_STATES_NEEDING_WHY,
} from '../data/deepdive-schema.mjs';

const STOPPED = BUILD_STATES_NEEDING_WHY;
// How many dependents a foundation row names inline before the rest fold into one link through to
// the foundation's own page, where "Waiting on this one" carries the full list.
const SHOW_DEPENDENTS = 6;
import AddButton from './AddButton.jsx';
import TabHead from './TabHead.jsx';
import OpportunityRail from './OpportunityRail.jsx';
import BuildStatePopover from './BuildStatePopover.jsx';
import { W, H, L, T, PW, PH, QUADRANTS, spread } from './deepdive-chart-geom.mjs';


export default function InnovationBoard({ plan, slug, staff, ctx, onSaveRecord }) {
  const builds = plan.BUILDS || [];
  const [only, setOnly] = useState('all');
  const [hot, setHot] = useState(null);

  const shown = useMemo(
    () => (only === 'all' ? builds : builds.filter((b) => b.state === only)),
    [builds, only],
  );
  const scored = useMemo(
    () => spread(shown.filter((b) => b.effort != null && b.impact != null)
      .map((b, i) => ({ ...b, n: i + 1 }))),
    [shown],
  );
  const unscored = shown.filter((b) => b.effort == null || b.impact == null);
  const foundations = builds.filter((b) => b.foundational);
  const outcomes = plan.OUTCOMES || [];
  const counts = useMemo(() => {
    const c = {};
    for (const b of builds) c[b.state] = (c[b.state] || 0) + 1;
    return c;
  }, [builds]);

  if (!builds.length) {
    return (
      <section className="org-sec dd-sec">
        {/* ⚠ THE TAB LOST ITS OWN TITLE WHEN IT WAS EMPTY. The populated branch below opens with a
            TabHead, which is what gives every tab in the portal its h1; this branch hand rolled a
            leadrow with an h2, so an Innovation tab with nothing in it yet was the only tab whose
            page had no top-level heading. The empty state is the state a new engagement starts in,
            so it was the common case, not the edge.
            ⚠ NO `lead` HERE ON PURPOSE. The populated TabHead carries one, and repeating it above
            the empty state's own paragraph would put two explanations of the same thing back to
            back, which is exactly what was cut from this board earlier. */}
        <TabHead title="What we proposed"
          actions={staff && <AddButton kind="build" label="Add a proposed build" ctx={ctx} />} />
        <div className="dd-empty">
          <h2>Nothing from the assessment is in the record yet</h2>
          <p>
            The assessment proposed things we would build for them. Until they are here, the
            investigation can establish how the business runs today and nothing about whether what
            we proposed would work.
          </p>
        </div>
      </section>
    );
  }

  return (
    <>
      <TabHead title="What we proposed"
        lead="What the assessment said we would build, and what the Deep Dive has to settle before any of it could be costed. Effort and impact are our assessment, not theirs."
        stats={[
          { l: 'Proposals', v: builds.length },
          { l: 'Weighed', v: `${builds.filter((b) => b.effort != null && b.impact != null).length} of ${builds.length}`,
            gap: builds.some((b) => b.effort == null || b.impact == null) },
          { l: 'Stopped', v: builds.filter((b) => STOPPED.includes(b.state)).length,
            gap: builds.some((b) => STOPPED.includes(b.state)) },
          { l: 'Foundational', v: foundations.length },
        ]}
        actions={staff ? <AddButton kind="build" label="Add a proposed build" ctx={ctx} /> : null} />

      {/* ⚠ THE OBJECTIVES COME FIRST. A business is a collection of processes put together to reach
          an objective, so a page of proposals with no objective above it is a shopping list.
          The opportunities then sit between the objectives and the proposals, because that is what
          the proposals are FOR: objective, then where change could create value, then what we would
          build to realise it. Reading it in that order is what stops the page being a wish list. */}
      <section className="org-sec dd-sec">
        <h2><Labelled icon="compare">What this is all for</Labelled></h2>
        {outcomes.length ? (
          /* The record's own uppercase lead-ins are subheadings somebody typed into the text;
             rendered inline they blend into the prose (John's screenshot, 11 Sep, the second
             screen to hit this). Same shared splitter as the Overview: lifted headings, global
             numbering, and a string with no confident lead renders exactly as written. */
          groupByLead(outcomes).map((g, gi) => (
            <section key={gi} className="dd-outgrp">
              {g.lead && <h3 className="dd-outgrp-h">{g.lead}</h3>}
              <ol className="dd-outcomes" start={g.start}>
                {g.items.map((x) => (
                  <li key={x.n}><span className="dd-outcome-n">{String(x.n).padStart(2, '0')}</span><span>{x.text}</span></li>
                ))}
              </ol>
            </section>
          ))
        ) : (
          <p className="dd-prov-none">
            No objective recorded for this engagement, so nothing below can be weighed against
            anything. Set them on the engagement.
          </p>
        )}
      </section>

      <OpportunityRail plan={plan} ctx={ctx} />

      <section className="org-sec dd-sec dd-innov">
        {/* ⚠ The head above says what this is and counts it; repeating that here was the same
            duplication the engagement header used to cause on every tab. */}

        {/* the filter, which is also the count */}
        <div className="dd-innov-filter" role="group" aria-label="Show only">
          <button type="button" className={`dd-fchip${only === 'all' ? ' is-on' : ''}`}
            aria-pressed={only === 'all'} onClick={() => setOnly('all')}>
            All <span className="dd-fchip-n">{builds.length}</span>
          </button>
          {BUILD_STATES.filter((s) => counts[s]).map((s) => (
            <button key={s} type="button" className={`dd-fchip${only === s ? ' is-on' : ''}${BUILD_STATES_NEEDING_WHY.includes(s) ? ' is-stopped' : ''}`}
              aria-pressed={only === s} onClick={() => setOnly(s)}>
              {BUILD_STATE_WORD[s]} <span className="dd-fchip-n">{counts[s]}</span>
            </button>
          ))}
        </div>

        <div className="dd-innov-body">
          <div className="dd-chartwrap">
            <svg className="dd-chart" viewBox={`0 0 ${W} ${H}`} role="img"
              aria-label={`Effort against impact for ${scored.length} proposal${scored.length === 1 ? '' : 's'}. The list beside this chart carries the same information.`}>
              <defs>
                <linearGradient id="dd-q" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--gs-accent)" stopOpacity="0" />
                  <stop offset="100%" stopColor="var(--gs-accent)" stopOpacity=".07" />
                </linearGradient>
              </defs>
              <rect x={L} y={T} width={PW} height={PH} fill="url(#dd-q)" />
              {/* the grid, quiet, every 2 points */}
              {[0, 2, 4, 6, 8, 10].map((v) => {
                const gx = L + (v / 10) * PW;
                const gy = (T + PH) - (v / 10) * PH;
                return (
                  <g key={v}>
                    <line className="dd-chart-g" x1={gx} y1={T} x2={gx} y2={T + PH} />
                    <line className="dd-chart-g" x1={L} y1={gy} x2={L + PW} y2={gy} />
                  </g>
                );
              })}
              <line className="dd-chart-mid" x1={L + PW / 2} y1={T} x2={L + PW / 2} y2={T + PH} />
              <line className="dd-chart-mid" x1={L} y1={T + PH / 2} x2={L + PW} y2={T + PH / 2} />
              {QUADRANTS.map((q) => (
                <text key={q.key} className="dd-chart-q" x={q.x} y={q.y}
                  textAnchor={q.end ? 'end' : 'start'}>{q.say}</text>
              ))}
              <text className="dd-chart-ax" x={L + PW / 2} y={H - 10} textAnchor="middle">Effort, low to high</text>
              <text className="dd-chart-ax" x={13} y={T + PH / 2} textAnchor="middle"
                transform={`rotate(-90 13 ${T + PH / 2})`}>Impact, low to high</text>
            </svg>

            {/* HTML dots over the SVG, so each one is a real link with a real focus ring. */}
            <div className="dd-dots">
              {scored.map((b) => (
                <a key={b.id} href={itemHref(slug, 'build', b.id)}
                  className={`dd-dot dd-dot-${b.state}${b.foundational ? ' is-found' : ''}${hot === b.id ? ' is-hot' : ''}`}
                  style={{ left: `${(b.x / W) * 100}%`, top: `${(b.y / H) * 100}%` }}
                  onMouseEnter={() => setHot(b.id)} onMouseLeave={() => setHot(null)}
                  onFocus={() => setHot(b.id)} onBlur={() => setHot(null)}>
                  <span aria-hidden="true">{b.n}</span>
                  <span className="gs-sr-only">
                    {b.name}, effort {b.effort} of 10, impact {b.impact} of 10,
                    {BUILD_STATE_WORD[b.state]}{b.foundational ? ', other things get built on it' : ''}
                  </span>
                </a>
              ))}
            </div>
          </div>

          {/* The names live here, never on the dots. */}
          <ol className="dd-legend">
            {scored.map((b) => (
              <li key={b.id} className={hot === b.id ? 'is-hot' : ''}
                onMouseEnter={() => setHot(b.id)} onMouseLeave={() => setHot(null)}>
                <span className={`dd-legend-n dd-dot-${b.state}${b.foundational ? ' is-found' : ''}`}>{b.n}</span>
                <span className="dd-legend-b">
                  <a className="dd-either-a" href={itemHref(slug, 'build', b.id)}>{b.name}</a>
                  <span className="dd-legend-m">
                    {/* ⚠ THE STATE IS SET FROM THE LIST. This is the screen where somebody weighs
                        eleven proposals against each other, which is exactly when they decide one
                        is deferred or tabled. Sending them to the proposal's own page to change a
                        word loses the comparison that prompted it. Same pane as both other places,
                        so the rule about which states demand a reason cannot drift. */}
                    <BuildStatePopover build={b} busy={ctx?.busy} size="sm"
                      can={onSaveRecord ? (ctx?.canAuthor || { can: false }) : { can: false }}
                      onSave={(fields) => onSaveRecord(b, 'build', fields)} />
                    {b.foundational && <> · foundational</>}
                    {(b.processes || []).length
                      ? <> · {(b.processes || []).length} process{(b.processes || []).length === 1 ? '' : 'es'}</>
                      : <> · <span className="dd-covgap">no process named</span></>}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        {unscored.length > 0 && (
          <p className="dd-innov-un">
            <b>{unscored.length}</b> {unscored.length === 1 ? 'proposal is' : 'proposals are'} not on the
            chart because {unscored.length === 1 ? 'it has' : 'they have'} not been weighed:{' '}
            {unscored.map((b, i) => (
              <span key={b.id}>{i > 0 && ', '}<a href={itemHref(slug, 'build', b.id)}>{b.name}</a></span>
            ))}.
          </p>
        )}
      </section>

      {/* ── the foundations ─────────────────────────────────────────────────────────────────── */}
      <section className="org-sec dd-sec">
        <h2><Labelled icon="process">What everything else stands on</Labelled></h2>
        <p className="org-sec-sub dd-lead">
          Foundational is a dependency, not a priority: these are the ones other proposals cannot
          exist without, which is a different claim from being the most valuable.
        </p>
        {foundations.length ? (
          <ul className="dd-found">
            {foundations.map((b) => {
              const on = builds.filter((x) => (x.dependsOn || []).includes(b.id));
              return (
                <li key={b.id} className="dd-found-r">
                  <a className="dd-found-n" href={itemHref(slug, 'build', b.id)}>{b.name}</a>
                  <span className="dd-found-w">
                    {on.length
                      ? (
                        <>
                          {on.length} {on.length === 1 ? 'proposal waits' : 'proposals wait'} on it:{' '}
                          {/* Same comma-joined link idiom as the unscored list above: a bare map of
                              <a> would drop the separators. BuildPage's "Waiting on this one" links
                              this identical list, so these were the board's only plain-text builds. */}
                          {on.slice(0, SHOW_DEPENDENTS).map((x, i) => (
                            <span key={x.id}>{i > 0 && ', '}<a className="dd-either-a" href={itemHref(slug, 'build', x.id)}>{x.name}</a></span>
                          ))}
                          {on.length > SHOW_DEPENDENTS && (
                            <> and <a className="dd-either-a" href={itemHref(slug, 'build', b.id)}>{on.length - SHOW_DEPENDENTS} more</a></>
                          )}
                        </>
                      )
                      : <span className="dd-covgap">nothing in the record is recorded as needing it, so either the mark or the links are wrong</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="dd-prov-none">
            None marked. If one of these has to exist before the others can, saying so is what turns
            a list of proposals into an order of work.
          </p>
        )}
      </section>
    </>
  );
}
