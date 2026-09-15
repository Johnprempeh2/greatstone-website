// The middle of the chain: where change could create value, and what it would take to deliver it.
//
// The record used to jump straight from a finding to a proposed build, which reads fine until you
// need the shape the method actually has. SEVERAL findings may point at ONE opportunity, and ONE
// opportunity may need SEVERAL builds. Written as a sentence on each finding, four findings that
// point at the same thing are four opportunities that happen to match, and nothing can count them,
// dedupe them or carry them into a roadmap. So an opportunity is a record with an id, and this is
// where the two links either hold or are shown not to.
//
// ⚠ COMPLEXITY IS NEVER AVERAGED AND THERE IS NO SCORE, and that is a rendering rule as much as a
// schema one. A single Significant dimension carrying regulatory, operational or organisational
// consequence can determine the whole implementation approach even where every other dimension is
// Standard. Averaging is exactly how that gets buried, and so is a tidy "overall: elevated" chip.
// This shows the DRIVING dimensions and says how many were assessed, and it offers no number
// anybody could rank engagements by.
//
// ⚠ AN UNASSESSED DIMENSION IS ABSENT, NOT STANDARD. Ten empty rows reading "standard" is a claim
// that ten things were checked and found benign. The record says how many were actually assessed.
import React, { useMemo, useState } from 'react';
import { Labelled } from './DeepDiveIcons.jsx';
import { itemHref } from '../lib/deepdive-route.mjs';
import AddButton from './AddButton.jsx';
import EditLink from './EditLink.jsx';
import More from './More.jsx';
import { complexityPerspective, COMPLEXITY_DIMENSIONS } from '../data/deepdive-schema.mjs';

const label = (x) => [x.ref, x.name].filter(Boolean).join(' ').trim();

// A list past this many rows folds behind its count. The count is always honest; the rows beyond
// it are one press away rather than a wall.
const FOLD = 6;

function FoldList({ items, render, className = 'dd-list' }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, FOLD);
  return (
    <>
      <ul className={className}>{shown.map(render)}</ul>
      {items.length > FOLD && (
        <button type="button" className="dd-more-x" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? 'Show fewer' : `and ${items.length - FOLD} more`}
        </button>
      )}
    </>
  );
}

// A strip count that names nobody is a dead end: "3 builds serving no opportunity" sent the reader
// hunting through the legend by elimination. The count stays in the strip; this line under it
// names them, and folds once the names run past two lines.
function NamedBuilds({ lead, builds, slug }) {
  if (!builds.length) return null;
  return (
    <More lines={2} className="dd-innov-un" label="Show all">
      {lead}:{' '}
      {builds.map((b, i) => (
        <span key={b.id}>{i > 0 && ', '}<a className="dd-either-a" href={itemHref(slug, 'build', b.id)}>{label(b)}</a></span>
      ))}.
    </More>
  );
}

export default function OpportunityRail({ plan, ctx }) {
  const opps = plan.OPPORTUNITIES || [];
  const builds = plan.BUILDS || [];
  const assessments = plan.COMPLEXITY || [];
  const staff = ctx?.staff;

  // The two links, resolved once. Everything below reads from these rather than re-scanning, so a
  // count on screen and a list on screen can never disagree.
  const buildsByOpp = useMemo(() => {
    const m = new Map();
    for (const b of builds) {
      if (!b.opportunityId) continue;
      if (!m.has(b.opportunityId)) m.set(b.opportunityId, []);
      m.get(b.opportunityId).push(b);
    }
    return m;
  }, [builds]);

  const cxByBuild = useMemo(
    () => new Map(assessments.filter((x) => x.buildId).map((x) => [x.buildId, x])),
    [assessments],
  );
  const buildById = useMemo(() => new Map(builds.map((b) => [b.id, b])), [builds]);
  const kpiById = useMemo(() => new Map((plan.KPIS || []).map((k) => [k.id, k])), [plan.KPIS]);
  // A finding has no page of its own; its surface is its question's page. Findings ride on ctx, and
  // questions sit inside their pillar groups, so both are flattened once here.
  const findings = ctx?.findings || [];
  const findingById = useMemo(() => new Map(findings.map((f) => [f.id, f])), [findings]);
  const questionById = useMemo(
    () => new Map((plan.QUESTIONS || []).flatMap((g) => (g.items || []).map((q) => [q.id, q]))),
    [plan.QUESTIONS],
  );

  const unserved = opps.filter((o) => !(buildsByOpp.get(o.id) || []).length);
  const unassessed = builds.filter((b) => !cxByBuild.has(b.id));
  // ⚠ A DEAD LINK IS AN ORPHAN TOO. Removing an opportunity does not scrub opportunityId off its
  // builds (probed 11 Sep: the id stays, edits stay accepted), so a build pointing at a removed
  // opportunity attached to nothing above AND escaped this count: it vanished from both sides of
  // the reconciliation. Orphan means "serves no LIVE opportunity", not "has no id written down".
  const liveOpp = new Set(opps.map((o) => o.id));
  const orphanBuilds = builds.filter((b) => !b.opportunityId || !liveOpp.has(b.opportunityId));

  // ⚠ BOTH OF THESE ARE INTERNAL DELIVERABLES AND I HAD ONLY GATED THE BUTTONS.
  //
  // Gating the Add and Edit controls hides the ability to CHANGE these records and leaves the
  // records themselves on screen, which is the wrong half: a client viewing this tab would have
  // read our full delivery complexity assessment, including what we think is significant, what we
  // are uncertain about and what we would want established before committing. The Delivery
  // Complexity Assessment is explicitly not a client-facing disclosure of how Greatstone works out
  // what something takes, and the opportunity is a working step on the way to the GDXP, which is
  // the client-facing output.
  //
  // Internal is the default in this portal and nothing reaches a client by omission. If either
  // should later be shareable, that is a per-item Shared decision built deliberately, not a
  // section that renders because nobody said otherwise.
  if (!staff) return null;

  return (
    <>
      {/* ── where change could create value ───────────────────────────────────────────────── */}
      <section className="org-sec dd-sec">
        <div className="dd-leadrow">
          <div>
            <h2><Labelled icon="target">Where change could create value</Labelled></h2>
            <p className="dd-lead">
              An opportunity is where meaningful change may create value. It is deliberately not the
              design: one that already names its solution has skipped the layer where we decide
              whether that solution is the right one.
            </p>
          </div>
          {staff && <AddButton kind="opportunity" label="Add an opportunity" ctx={ctx} />}
        </div>

        {!opps.length ? (
          <div className="dd-empty">
            <h2>No opportunity has been written down yet</h2>
            {/* ⚠ THE LEAD ABOVE ALREADY SAYS WHAT AN OPPORTUNITY IS, 79px up the same screen. This
                used to open by defining it again, so an empty board spent 84 words and 195px on one
                definition, in the state every engagement starts in. The empty state keeps only what
                the lead cannot carry: what goes wrong while the section stays empty. */}
            <p>
              Without one, every proposed build is tied straight to a finding, and nothing can say
              that four findings are pointing at the same thing.
            </p>
            {staff && <div className="dd-empty-act"><AddButton kind="opportunity" label="Add the first one" ctx={ctx} /></div>}
          </div>
        ) : (
          <>
            <div className="dd-buildsum">
              <span>{opps.length} recorded</span>
              <span>{opps.filter((o) => o.state === 'validated').length} validated</span>
              {unserved.length > 0 && (
                <span className="dd-buildsum-open">{unserved.length} with nothing proposed to realise it</span>
              )}
              {orphanBuilds.length > 0 && (
                <span className="dd-buildsum-warn">{orphanBuilds.length} builds serving no opportunity</span>
              )}
            </div>
            <NamedBuilds lead="Serving no opportunity" builds={orphanBuilds} slug={ctx.slug} />

            <ul className="dd-buildl">
              {opps.map((o) => {
                const serving = buildsByOpp.get(o.id) || [];
                const linkedKpis = (o.kpis || []).map((id) => kpiById.get(id)).filter(Boolean);
                return (
                  <li key={o.id} className="dd-build">
                    <div className="dd-build-h">
                      {o.ref && <span className="dd-build-ref">{o.ref}</span>}
                      <h3>{o.name}</h3>
                      <span className={`dd-chip dd-bstate dd-bstate-${o.state}`}>{o.state}</span>
                      <EditLink kind="opportunity" item={o} ctx={ctx} />
                    </div>

                    {o.statement && <p className="dd-build-what">{o.statement}</p>}

                    <div className="dd-build-l">
                      <h4 className="dd-sub">What has to get better</h4>
                      <p>{o.desiredOutcome}</p>
                    </div>

                    <div className="dd-build-l">
                      <h4 className="dd-sub">Why it is happening</h4>
                      {o.rootCause ? <p>{o.rootCause}</p> : (
                        <p className="dd-nogap">
                          No root cause recorded. A symptom treated as a cause produces a design that
                          relieves the pain and leaves the mechanism in place. Better left blank than
                          manufactured, but it is the next thing to establish.
                        </p>
                      )}
                    </div>

                    {o.potentialValue && (
                      <div className="dd-build-l">
                        <h4 className="dd-sub">What it could be worth</h4>
                        <p>{o.potentialValue}</p>
                      </div>
                    )}

                    <div className="dd-build-l">
                      <h4 className="dd-sub">What points here</h4>
                      {(o.fromFindings || []).length ? (
                        <>
                          <p>{o.fromFindings.length} finding{o.fromFindings.length === 1 ? '' : 's'} point at this opportunity.</p>
                          {/* Each one resolves to its question's page, which is where a finding lives.
                              An id that resolves to nothing, or a finding tied to no question, stays
                              on screen as a visible gap so the count above is never quietly larger
                              than what can be opened. */}
                          <FoldList
                            items={o.fromFindings}
                            render={(id) => {
                              const f = findingById.get(id);
                              if (!f) return (
                                <li key={id}>
                                  <span className="dd-covgap">A finding no longer in the record</span>
                                  <span className="dd-prov-none"> ({id})</span>
                                </li>
                              );
                              const q = f.questionId ? questionById.get(f.questionId) : null;
                              return (
                                <li key={id}>
                                  {q ? (
                                    <a className="dd-either-a" href={itemHref(ctx.slug, 'question', q.id)}>{q.q}</a>
                                  ) : (
                                    <span className="dd-covgap">
                                      {f.questionId ? 'Its question is no longer in the record' : 'Tied to no question, so it has no page to open'}
                                    </span>
                                  )}
                                  {f.text && <span className="dd-prov-none dd-clamp2">{f.text}</span>}
                                </li>
                              );
                            }}
                          />
                        </>
                      ) : (
                        <p className="dd-nogap">
                          Nothing points here yet, so this is an opportunity we believe in rather than
                          one the evidence produced. Tie it to the findings that caused it.
                        </p>
                      )}
                    </div>

                    <div className="dd-build-l">
                      <h4 className="dd-sub">What would realise it</h4>
                      {serving.length ? (
                        <div className="dd-buildp">
                          {serving.map((b) => (
                            <a key={b.id} className="dd-either-a" href={itemHref(ctx.slug, 'build', b.id)}>
                              {label(b)}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <p className="dd-nogap">
                          Nothing proposed against this yet. An opportunity with no initiative behind
                          it is a statement of intent, and it will not reach the roadmap.
                        </p>
                      )}
                    </div>

                    <div className="dd-build-l">
                      <h4 className="dd-sub">How we would know it moved</h4>
                      {linkedKpis.length ? (
                        <ul className="dd-list">
                          {linkedKpis.map((k) => (
                            <li key={k.id}>
                              <a className="dd-either-a" href={itemHref(ctx.slug, 'kpi', k.id)}>{k.name}</a>
                              {k.current != null && k.target != null && (
                                <span className="dd-prov-none"> · now {k.current}{k.unit || ''}, target {k.target}{k.unit || ''}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : o.baselineRequired ? (
                        <p className="dd-nogap">
                          A baseline is marked as required and none is linked. Without a measured
                          starting position, any improvement claimed afterwards is an assertion.
                        </p>
                      ) : (
                        <p className="dd-prov-none">
                          No baseline required. The outcome is qualitative, and how achievement will
                          be judged should still be clear.
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* ── what it would take to deliver ─────────────────────────────────────────────────── */}
      <section className="org-sec dd-sec">
        <div className="dd-leadrow">
          <div>
            <h2><Labelled icon="target">What would make it hard to deliver</Labelled></h2>
            <p className="dd-lead">
              What makes the transformation complex to implement. Not how much investigation the Deep
              Dive needs, and not what the work is worth. A large organisation may need an extensive
              Deep Dive and a focused implementation.
            </p>
          </div>
          {staff && <AddButton kind="complexity" label="Assess an initiative" ctx={ctx} />}
        </div>

        {!assessments.length ? (
          <div className="dd-empty">
            <h2>Nothing has been assessed for delivery complexity</h2>
            {/* Same rule as the opportunity empty state above: the lead defines complexity, so this
                carries the cost of leaving it empty and nothing else. */}
            <p>
              Until it is recorded, effort and impact are the only things standing between a
              proposal and a commitment.
            </p>
            {staff && <div className="dd-empty-act"><AddButton kind="complexity" label="Assess the first one" ctx={ctx} /></div>}
          </div>
        ) : (
          <>
            <div className="dd-buildsum">
              <span>{assessments.length} assessed</span>
              {unassessed.length > 0 && (
                <span className="dd-buildsum-open">{unassessed.length} initiative{unassessed.length === 1 ? '' : 's'} not assessed</span>
              )}
            </div>
            <NamedBuilds lead="Not yet assessed" builds={unassessed} slug={ctx.slug} />

            <ul className="dd-buildl">
              {assessments.map((x) => {
                const b = buildById.get(x.buildId);
                const view = complexityPerspective(x);
                const sig = (x.dimensions || []).filter((d) => d.level === 'significant');
                return (
                  <li key={x.id} className="dd-build">
                    <div className="dd-build-h">
                      <h3>{b ? <a className="dd-either-a" href={itemHref(ctx.slug, 'build', b.id)}>{label(b)}</a> : 'An initiative no longer in the record'}</h3>
                      <span className={`dd-chip dd-bstate dd-bstate-${x.state}`}>{x.state}</span>
                      <EditLink kind="complexity" item={x} ctx={ctx} />
                    </div>

                    {/* The driving dimensions, never an average and never a score. */}
                    <div className="dd-build-l">
                      <h4 className="dd-sub">What drives it</h4>
                      {view.driving.length ? (
                        <>
                          <p>
                            {view.driving.length} of {view.assessed} assessed dimension
                            {view.assessed === 1 ? '' : 's'} {view.driving.length === 1 ? 'is' : 'are'} <strong>{view.level}</strong>,
                            and {view.driving.length === 1 ? 'it drives' : 'they drive'} the approach.
                            {view.assessed < COMPLEXITY_DIMENSIONS.length && (
                              ` ${COMPLEXITY_DIMENSIONS.length - view.assessed} not assessed, which is not the same as benign.`
                            )}
                          </p>
                          <ul className="dd-list">
                            {view.driving.map((d) => (
                              <li key={d.dimension}>
                                <strong>{d.dimension}</strong>: {d.driver}
                                <br />
                                <span className="dd-prov-none">So: {d.implication}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <p className="dd-nogap">
                          No dimension has been assessed, so this record says nothing yet about what
                          would make the work hard.
                        </p>
                      )}
                    </div>

                    {(x.risks || []).length > 0 && (
                      <div className="dd-build-l">
                        <h4 className="dd-sub">Risks carried</h4>
                        <ul className="dd-list">{x.risks.map((t, i) => <li key={i}>{t}</li>)}</ul>
                      </div>
                    )}

                    {(x.interactions || []).length > 0 && (
                      <div className="dd-build-l">
                        <h4 className="dd-sub">Where factors compound</h4>
                        <ul className="dd-list">{x.interactions.map((t, i) => <li key={i}>{t}</li>)}</ul>
                      </div>
                    )}

                    {/* Preconditions change the SEQUENCE, so they are given their own heading rather
                        than being filed as a caveat. */}
                    <div className="dd-build-l">
                      <h4 className="dd-sub">What would make it easier</h4>
                      {(x.preconditions || []).length ? (
                        <>
                          <ul className="dd-list dd-list-open">
                            {x.preconditions.map((t, i) => <li key={i}>{t}</li>)}
                          </ul>
                          <p className="dd-prov-none">
                            Complexity is not fixed. Resolving these first can move this work down a
                            level, which is a sequencing decision rather than a warning about cost.
                          </p>
                        </>
                      ) : sig.length ? (
                        <p className="dd-nogap">
                          {sig.length} dimension{sig.length === 1 ? ' is' : 's are'} significant and no
                          precondition is offered. Ask what could be established first, because that
                          answer belongs in the roadmap rather than in the risk column.
                        </p>
                      ) : (
                        <p className="dd-prov-none">Nothing identified that would materially reduce it.</p>
                      )}
                    </div>

                    {x.uncertainty && (
                      <div className="dd-build-l">
                        <h4 className="dd-sub">Still not known</h4>
                        <p>{x.uncertainty}</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
