// One proposed build, in full.
//
// ⚠ THE ARGUMENT THIS PAGE HAS TO CARRY: a proposal is not a decision. The GITA said what we would
// build; the Deep Dive is how anybody finds out whether it would work HERE. So the page is not a
// feature description with a price on it. It is what we proposed, what it would change, what we
// still cannot answer, and every state it has been in with the reason attached.
//
// ⚠ POSITION IS NOT A CLAIM, and neither is a score. Effort and impact are OURS, not the client's,
// and an unscored build is left off the chart rather than defaulted to the middle: a dot at 5,5 is
// an assertion, and "nobody has weighed this yet" is not that assertion.
import React, { useMemo } from 'react';
import { Icon, Labelled } from './DeepDiveIcons.jsx';
import InlineText from './InlineText.jsx';
import InlineLinks from './InlineLinks.jsx';
import BuildStatePopover from './BuildStatePopover.jsx';
import Attachments from './Attachments.jsx';
import ChangeLog from './ChangeLog.jsx';
import { itemHref } from '../lib/deepdive-route.mjs';
import { complexityPerspective, safeLink } from '../data/deepdive-schema.mjs';
import { BUILD_STATE_WORD, BUILD_STATE_MEANS, BUILD_STATES_NEEDING_WHY, DEMO_KIND_MEANS } from '../data/deepdive-schema.mjs';

/** A list, or the sentence that says why there is nothing in it. The empty state is the point on
 *  this page: an option nobody has written down is not an option anybody can weigh. */
function List({ label, items, empty, kind = 'named' }) {
  return (
    <div className="dd-bcol">
      <h3 className="dd-sub">{label}</h3>
      {items && items.length
        ? <ul className={`dd-list dd-list-${kind}`}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
        : <p className="dd-prov-none">{empty}</p>}
    </div>
  );
}

export default function BuildPage({
  slug, item, plan, log, files, staff, canAuthor, busy, onEdit, onSaveField, onAttach, onDetach,
}) {
  // Re-checked here rather than trusted from storage: see the note beside the demo frame below.
  const demo = safeLink(item.demoLink);
  // ⚠ http OR https IS NOT THE SAME AS "A STRANGER", and the note by the frame claimed it was.
  // `safeLink` checks the PROTOCOL and never the host, so a demo link pointing at this portal's own
  // origin passes it perfectly. The frame carries `allow-scripts allow-same-origin`, a pair that is
  // only safe while the framed document is a different origin: pointed at ourselves it hands the
  // frame our storage and our session, which is the exact thing the sandbox was chosen to prevent.
  // It does not take an attacker, only somebody pasting a link to the record as "the demo".
  // Same-origin stays a LINK, which is harmless, and simply is not framed.
  const demoIsStranger = useMemo(() => {
    if (!demo) return false;
    try { return new URL(demo).origin !== window.location.origin; } catch { return false; }
  }, [demo]);
  const framed = demo && demoIsStranger ? demo : null;
  // The questions the TEAM still has to answer before this can be built appropriately (John,
  // 11 Sep): live question records on the processes this build changes, still short of Known.
  // Derived, never copied: answering the question anywhere makes it fall off this list.
  const askTeam = useMemo(() => {
    const nums = new Set(item.processes || []);
    if (!nums.size) return [];
    const out = [];
    for (const g of plan.QUESTIONS || []) {
      for (const q of g.items || []) {
        if (q.certainty !== 'known' && (q.processes || []).some((n) => nums.has(n))) {
          out.push({ q, pillar: g.pillar });
        }
      }
    }
    return out;
  }, [plan.QUESTIONS, item.processes]);

  const byNum = useMemo(
    () => new Map((plan.PROCESSES || []).map((p) => [p.num, p])), [plan],
  );
  const builds = plan.BUILDS || [];
  const byId = useMemo(() => new Map(builds.map((b) => [b.id, b])), [builds]);
  const byKpi = useMemo(() => new Map((plan.KPIS || []).map((k) => [k.id, k])), [plan]);
  const opportunity = (plan.OPPORTUNITIES || []).find((o) => o.id === item.opportunityId) || null;
  const complexity = (plan.COMPLEXITY || []).find((x) => x.buildId === item.id) || null;

  // What this one waits on, and what waits on it. Both directions, because a foundation that
  // nothing is recorded as needing is a claim the record cannot support.
  const needsFirst = (item.dependsOn || []).map((id) => byId.get(id)).filter(Boolean);
  const dangling = (item.dependsOn || []).filter((id) => !byId.has(id));
  const holdsUp = builds.filter((b) => (b.dependsOn || []).includes(item.id));

  // The granular tie: which step inside which chain.
  const touches = (item.touches || []).map((t) => {
    const [num, n] = String(t).split(':');
    const proc = byNum.get(num);
    const step = proc && n ? (proc.steps || []).find((s) => String(s.n) === String(n)) : null;
    return { t, num, proc, step };
  });

  const can = staff ? (canAuthor || { can: false }) : { can: false };
  const stopped = BUILD_STATES_NEEDING_WHY.includes(item.state);

  return (
    <>
      <header className="dd-head">
        <p className="dd-crumb">
          <a href={`#deepdive/${slug}`}>&larr; {plan.engagement?.client || 'Record'}</a>
          <span> · What we proposed</span>
        </p>
        <div className="dd-kicker"><Labelled icon="link">A proposal, not a decision</Labelled></div>
        <h1 className="dd-qh1">{item.ref ? <span className="dd-bref">{item.ref}</span> : null}{item.name}</h1>
        {/* ⚠ THE STATE IS SET FROM THE STATE, not from a form over the whole proposal. It is two
            fields and they only make sense together: "cancelled" REFUSES to save without a reason,
            so a control offering the state alone would produce a refusal every time. One pane, one
            write, one log entry. */}
        {/* ⚠ ONE PANE, SHARED. The process page shows the same chip for the same proposal, and a
            second copy here would be a second copy of the rule about which states demand a reason. */}
        <BuildStatePopover build={item} can={can} busy={busy}
          onSave={(fields) => onSaveField(item, fields)} />
        <p className="dd-lead">{BUILD_STATE_MEANS[item.state]}</p>
      </header>

      {/* ⚠ THE REASON COMES FIRST WHEN A PROPOSAL HAS STOPPED. A reader arriving at something
          cancelled needs to know what the decision rested on before they read the proposal, or they
          spend the whole page building an argument that was already had. */}
      {stopped && (
        <section className="dd-access dd-bstopped">
          <div className="dd-access-mark" aria-hidden="true" />
          <div>
            <h2>Why it is {(BUILD_STATE_WORD[item.state] || item.state).toLowerCase()}</h2>
            <InlineText value={item.stateWhy} can={can} label="why it stopped" rows={3}
              empty="No reason recorded, which means nobody can revisit this knowing what it rested on."
              onSave={(v) => onSaveField(item, { stateWhy: v })} />
          </div>
        </section>
      )}

      <section className="org-sec dd-sec">
        <h2><Labelled icon="process">What it is</Labelled></h2>
        <InlineText value={item.what} can={can} label="what it does" rows={3}
          placeholder="In a sentence, what it would do for them."
          empty="Not written yet." onSave={(v) => onSaveField(item, { what: v })} />
        <dl className="dd-meta">
          <div><dt>Who would use it</dt><dd>
            <InlineText value={item.forWhom} can={can} label="who would use it" multiline={false}
              empty="Not recorded." onSave={(v) => onSaveField(item, { forWhom: v })} /></dd></div>
          <div><dt>What it takes out</dt><dd>
            {/* ⚠ THE LABEL MUST MATCH THE dt ABOVE IT. InlineText's `label` is what builds the empty
                prompt and the accessible name, so "what it replaces" put a "+ What it replaces"
                button directly under a "What it takes out" heading: one field, two names, both on
                screen at once. Every other surface says "takes out", including the process page,
                the drawer and the History. */}
            <InlineText value={item.replaces} can={can} label="what it takes out" rows={2}
              empty="Nothing recorded. A proposal that adds without removing is a cost, not a change."
              onSave={(v) => onSaveField(item, { replaces: v })} /></dd></div>
          <div><dt>What it is worth</dt><dd>
            <InlineText value={item.roi} can={can} label="what it is worth" rows={2}
              empty="Not recorded, so there is nothing to weigh the effort against."
              onSave={(v) => onSaveField(item, { roi: v })} /></dd></div>
          {/* ⚠ WHAT AN INITIATIVE IS FOR IS NOT THE SAME AS WHAT IT DOES. `what` describes the
              thing; the opportunity is the organisational reason it should exist at all. An
              initiative serving no opportunity is a solution that arrived without a problem, and
              that is the one thing this page should never let pass quietly. */}
          <div><dt>What it is for</dt><dd>
            {/* Named rather than linked: an opportunity has no page of its own yet, and
                deepdive-route warns that a link to an unrouted kind falls silently through to the
                Overview, which is worse than not linking. It is shown in full on Innovation. */}
            {opportunity ? (
              <>
                <strong>{[opportunity.ref, opportunity.name].filter(Boolean).join(' ')}</strong>
                {opportunity.desiredOutcome && <><br /><span className="dd-prov-none">{opportunity.desiredOutcome}</span></>}
              </>
            ) : (
              <span className="dd-nogap">
                No opportunity named, so nothing says what organisational outcome this serves. A
                proposal with no opportunity behind it cannot be prioritised against one that has.
              </span>
            )}
          </dd></div>
          {/* ⚠ THE OTHER END OF THE IMPROVEMENT CLAIM. `kpis` is what this build says it should
              move (BUILDS.kpis, src/data/deepdive-schema.mjs). Each link lands on the KPI page,
              where the baseline, target and measure confidence live; without this row the
              build-to-number leg exists only in the data. A ref the record cannot resolve is
              SHOWN, not swallowed. */}
          <div><dt>What it should move</dt><dd>
            {(item.kpis || []).length ? (
              (item.kpis || []).map((id, i) => {
                const k = byKpi.get(id);
                return (
                  <React.Fragment key={id}>
                    {i > 0 && ', '}
                    {k
                      ? <a className="dd-either-a" href={itemHref(slug, 'kpi', id)}>{k.name}</a>
                      : <span className="dd-prov-none">no KPI {id} in this record</span>}
                  </React.Fragment>
                );
              })
            ) : (
              <span className="dd-nogap">
                No KPI named, so nothing in the record can show whether this moved anything.
              </span>
            )}
          </dd></div>
        </dl>
      </section>

      {/* ── what would make it hard ──────────────────────────────────────────────────────────
          ⚠ NO OVERALL LEVEL AND NO SCORE. A single significant dimension can decide the whole
          implementation approach even where everything else is standard, so this names the driving
          dimensions and what each one means for delivery. An average would bury exactly the factor
          that matters. */}
      {complexity && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="target">What would make it hard to deliver</Labelled></h2>
          {(() => {
            const view = complexityPerspective(complexity);
            if (!view.driving.length) {
              return <p className="dd-nogap">Assessed, but no dimension has been filled in yet.</p>;
            }
            return (
              <>
                <p className="dd-sub-lead">
                  {view.driving.length} of {view.assessed} assessed dimension{view.assessed === 1 ? '' : 's'}{' '}
                  {view.driving.length === 1 ? 'is' : 'are'} <strong>{view.level}</strong>.
                </p>
                <ul className="dd-list">
                  {view.driving.map((d) => (
                    <li key={d.dimension}>
                      <strong>{d.dimension}</strong>: {d.driver}
                      <br /><span className="dd-prov-none">So: {d.implication}</span>
                    </li>
                  ))}
                </ul>
                {(complexity.preconditions || []).length > 0 && (
                  <>
                    <h3 className="dd-sub">What would make it easier</h3>
                    <ul className="dd-list dd-list-open">
                      {complexity.preconditions.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </>
                )}
                {(complexity.risks || []).length > 0 && (
                  <>
                    <h3 className="dd-sub">Risks carried</h3>
                    <ul className="dd-list">{complexity.risks.map((t, i) => <li key={i}>{t}</li>)}</ul>
                  </>
                )}
              </>
            );
          })()}
        </section>
      )}

      {/* ── the tie to the business ─────────────────────────────────────────────────────────── */}
      <section className="org-sec dd-sec">
        <h2><Labelled icon="process">What it changes</Labelled></h2>
        <p className="dd-sub-lead">
          A business is a collection of processes put together to reach an objective, so a proposal
          that names no process is a proposal about nothing.
        </p>
        {/* ⚠ EDITED HERE, NOT IN THE DRAWER. This is the tie the whole proposal hangs on, and
            changing it used to mean opening a form over the thing you were reading, finding the
            field among twenty, and coming back to check. It writes through the same runOp the
            drawer uses, so validation, the version check, the log and attribution are identical. */}
        <InlineLinks
          value={item.processes || []}
          options={(plan.PROCESSES || []).map((x) => ({ id: x.num, label: `${x.num} ${x.name}`, sub: x.whoRuns }))}
          can={can} label="process" addLabel="Add a process"
          empty="No process named. Until one is, nothing here can say what this would actually change."
          href={(num) => { const pr = byNum.get(num); return pr ? itemHref(slug, 'process', pr.id) : '#'; }}
          onChange={(next) => onSaveField(item, { processes: next })} />

        {(item.processes || []).length === 0 && touches.length === 0 ? null : (
          <ul className="dd-btouch">
            {(item.processes || []).map((num) => {
              const proc = byNum.get(num);
              return (
                <li key={num} className="dd-btouch-r">
                  <span className="dd-btouch-n">{num}</span>
                  {proc
                    ? <a href={itemHref(slug, 'process', proc.id)}>{proc.name}</a>
                    : <span className="dd-prov-none">no process {num} in this record</span>}
                  <span className="dd-btouch-w">the whole chain</span>
                </li>
              );
            })}
            {touches.filter((x) => x.step).map(({ t, proc, step }) => (
              <li key={t} className="dd-btouch-r is-step">
                <span className="dd-btouch-n">{t}</span>
                <a href={itemHref(slug, 'process', proc.id)}>{proc.name}</a>
                <span className="dd-btouch-w">step {step.n}, {step.name}{step.who ? ` · ${step.who}` : ''}</span>
              </li>
            ))}
            {/* ⚠ A step reference the record cannot resolve is SHOWN, not swallowed. Silently
                dropping it would make the tie look complete when it is broken. */}
            {touches.filter((x) => !x.step && x.num && !x.proc).map(({ t }) => (
              <li key={t} className="dd-btouch-r"><span className="dd-btouch-n">{t}</span>
                <span className="dd-prov-none">nothing in this record answers to that</span></li>
            ))}
          </ul>
        )}
      </section>

      {/* ── what would have to be settled ───────────────────────────────────────────────────── */}
      <section className="org-sec dd-sec">
        <h2><Labelled icon="warn">What we would have to settle</Labelled></h2>
        <p className="dd-sub-lead">
          This is the Deep Dive&rsquo;s job on this proposal. A build with unanswered unknowns is not
          ready to be costed, and an unknown with nothing investigating it is a gap in the record.
        </p>
        {askTeam.length > 0 && (
          <div className="dd-askteam">
            <h3><Labelled icon="question">What we need the team to answer</Labelled></h3>
            <p className="dd-sub-lead">The record&rsquo;s own open questions on the processes this build
              changes. Each one is live: answered anywhere, it leaves this list.</p>
            <ul className="dd-left-l">
              {askTeam.map(({ q, pillar }) => (
                <li key={q.id}>
                  <a className="dd-q-link" href={itemHref(slug, 'question', q.id)}>{q.q}</a>
                  <span className={`dd-chip dd-cert-${q.certainty}`}>{q.certainty}</span>
                  <span className="dd-chip dd-pillar">{pillar}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="dd-bgrid">
          <List label="The options" items={item.options} kind="open"
            empty="Only one way of doing this has been imagined, or nobody has written the others down." />
          <List label="What we still have to find out" items={item.unknowns} kind="open"
            empty="Nothing recorded, which means either it is understood or nobody has asked. Say which." />
          <List label="What could go wrong" items={item.problems}
            empty="No problems recorded. That is a claim, and an unusual one." />
          <List label="What would stop it" items={item.blockers}
            empty="No blocker recorded." />
          <List label="What it needs to work here" items={item.needs}
            empty="Nothing recorded." />
          <List label="Questions it raises" items={item.opens} kind="open"
            empty="None recorded." />
        </div>
      </section>

      {/* ── where it sits ───────────────────────────────────────────────────────────────────── */}
      <section className="org-sec dd-sec">
        <h2><Labelled icon="link">Where it sits</Labelled></h2>
        <dl className="dd-meta">
          <div><dt>Effort</dt><dd>{item.effort == null ? 'not weighed' : `${item.effort} of 10`}</dd></div>
          <div><dt>Impact</dt><dd>{item.impact == null ? 'not weighed' : `${item.impact} of 10`}</dd></div>
          <div><dt>Foundational</dt><dd>{item.foundational ? 'Other things get built on this' : 'Stands on its own'}</dd></div>
        </dl>
        {/* ⚠ THIS ONLY RENDERED WHEN A DEPENDENCY ALREADY EXISTED, so the control for adding the
            FIRST one did not exist. That is the empty-state trap this record keeps falling into:
            the affordance appears once you no longer need it most. Staff always see it. */}
        {(needsFirst.length > 0 || holdsUp.length > 0 || dangling.length > 0 || can.can) && (
          <div className="dd-bgrid">
            <div className="dd-bcol"><h3 className="dd-sub">Has to exist first</h3>
              {/* Sequencing is decided while looking at the two proposals, not in a form. */}
              <InlineLinks
                value={item.dependsOn || []}
                options={builds.filter((b) => b.id !== item.id)
                  .map((b) => ({ id: b.id, label: b.name, sub: BUILD_STATE_WORD[b.state] }))}
                can={can} label="proposal" addLabel="Add a dependency"
                empty="Nothing has to exist first."
                href={(bid) => itemHref(slug, 'build', bid)}
                onChange={(next) => onSaveField(item, { dependsOn: next })} />
            </div>
            <div className="dd-bcol"><h3 className="dd-sub">Waiting on this one</h3>
              {holdsUp.length ? (
                <ul className="dd-list dd-list-open">
                  {holdsUp.map((b) => (
                    <li key={b.id}><a href={itemHref(slug, 'build', b.id)}>{b.name}</a></li>
                  ))}
                </ul>
              ) : (
                <p className="dd-prov-none">
                  {item.foundational
                    ? 'Marked foundational, and nothing in the record is recorded as needing it. One of those two is wrong.'
                    : 'Nothing.'}
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── what can be shown ───────────────────────────────────────────────────────────────── */}
      <section className="org-sec dd-sec">
        <h2><Labelled icon="source">What we can show</Labelled></h2>
        <p className="dd-sub-lead">
          A proposal nobody can look at is an argument. Something on screen that they can press is a
          different conversation.
        </p>
        <p className="dd-bdemo-k">{DEMO_KIND_MEANS[item.demoKind] || 'Nothing to show yet.'}</p>
        {/* ⚠ CHECKED ON THE WAY OUT, NOT ONLY ON THE WAY IN. `safeLink` exists for exactly this, and
            its own comment says so: the schema validates a link when an item is BUILT, which does
            nothing for a row stored before that check existed or written by any path that did not
            go through buildItem. Every other outbound link in the portal is re-checked at render
            (that is all `OutLink` does); this one was handed straight to an href AND to an iframe
            src, which is the one place it matters most, because the frame runs what it is given.
            ⚠ AND THE SANDBOX DOES NOT SAVE IT. `allow-scripts allow-same-origin` together is only
            safe while the framed document is a stranger: pointed at our OWN origin that pair gives
            the frame our storage and our session.
            ⚠ THIS NOTE USED TO END "a link that has to be http or https is what keeps it a
            stranger", WHICH IS NOT TRUE: https://<this very host>/ is http(s) and is not a
            stranger at all. The origin is compared above, and only a genuine stranger is framed.
            Anything else is still offered as a link, which was never the risk. */}
        {framed
          ? (
            <figure className="dd-bdemo-frame">
              {/* The demo itself, live in the page: something they can press beats a link they
                  might follow. Sandboxed; the full screen link is beside it for the real thing. */}
              <iframe src={framed} title={`Demo: ${item.name}`} loading="lazy"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
              <figcaption>
                <a className="dd-either-a" href={demo} target="_blank" rel="noreferrer noopener">
                  {Icon.link({ size: 14 })} Open it full screen</a>
              </figcaption>
            </figure>
          )
          : demo
            ? (
              /* ⚠ A LINK THAT IS NOT FRAMED IS STILL A LINK. Falling straight through to the
                 sentence below would have told the reader there is no link while holding one. */
              <p className="dd-prov-none">
                This one points at the portal itself, so it is not shown in the page.{' '}
                <a className="dd-either-a" href={demo} target="_blank" rel="noreferrer noopener">
                  {Icon.link({ size: 14 })} Open it in a new tab</a>
              </p>
            )
            : item.demoKind !== 'none' && <p className="dd-prov-none">Recorded as something we can show, and no link to it.</p>}
        <InlineText value={item.demoNote} can={can} label="what the demo shows" rows={2}
          empty="What it demonstrates is not written down." onSave={(v) => onSaveField(item, { demoNote: v })} />
      </section>

      {/* ── the conversation ────────────────────────────────────────────────────────────────── */}
      <section className="org-sec dd-sec">
        <h2><Labelled icon="history">What has been said about it</Labelled></h2>
        <p className="dd-sub-lead">
          A state records the outcome and nothing about the reasoning. This is the conversation, kept
          as it happened, so a decision can be revisited knowing what it actually rested on.
        </p>
        {(item.decisions || []).length ? (
          <ol className="dd-bsaid">
            {item.decisions.map((d, i) => (
              <li key={i}>
                <span className="dd-bsaid-w">{d.when || 'no date'}</span>
                <span className="dd-bsaid-who">{d.who || 'not attributed'}</span>
                <span className="dd-bsaid-t">{d.said}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="dd-prov-none">
            Nothing recorded. If this has been discussed and none of it is here, the record cannot
            show why it stands where it does.
          </p>
        )}
      </section>

      {item.note && <p className="dd-bnote">{item.note}</p>}

      <Attachments slug={slug} itemId={item.id} files={files} staff={staff}
        canAuthor={canAuthor} busy={busy} onAttach={onAttach} onDetach={onDetach} />
      {(log || []).some((e) => e.id === item.id) && <ChangeLog entries={(log || []).filter((e) => e.id === item.id)} />}
    </>
  );
}
