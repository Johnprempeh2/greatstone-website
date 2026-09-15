// One question's own page.
//
// A row in a list can hold a question. It cannot hold what the question is FOR: where the answer
// came from, how far we would stand behind it, what it made us ask next, and the record of who
// changed what and when. That is why this is a destination rather than an expanding row.
//
// The change-management rule is visible here rather than merely implemented: nothing is overwritten.
// An update supersedes, the superseded version stays, and the history below shows a practitioner
// exactly what an agent proposed against what they typed themselves.
import React, { useMemo, useState, useRef } from 'react';
import { PILLAR_GROUP, PILLARS, sessionBrief } from '../data/deepdive-schema.mjs';
import { CERTAINTY } from '../data/deepdive.mjs';
import { ROUTES } from '../data/deepdive-schema.mjs';
import InlineSelect from './InlineSelect.jsx';
import Popover from './Popover.jsx';
import { CONFIDENCE, CONFIDENCE_IDS, FINDING_STATE, AGREEMENT, AGREEMENT_IDS, canValidate, evidenceBehind, certaintyDrift,
         standing, historyFor, questionState, comparison } from '../data/deepdive-findings.mjs';
import { STATUS, stateOf, historyOf } from './deepdive-state.mjs';
import { deepDiveHref, sessionHref, questionHref, itemHref, evidenceHref } from '../lib/deepdive-route.mjs';
import RecordSearch from './RecordSearch.jsx';
import InlineText from './InlineText.jsx';
import InlineLinks from './InlineLinks.jsx';
import SessionTie from './SessionTie.jsx';
import Attachments from './Attachments.jsx';
import { Icon, Labelled } from './DeepDiveIcons.jsx';
import OutLink from './OutLink.jsx';
import ChangeLog from './ChangeLog.jsx';

const Chip = ({ tone, children, title }) => (
  <span className={`dd-chip dd-${tone}`} title={title}>{children}</span>
);

const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'no date recorded'
    : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// The form for recording an answer, or for replacing one. Replacing is the same act with a
// `supersedes`, which is why it is one component rather than two.
function FindingForm({ question, sessions, sources, replacing, onSave, onCancel, busy }) {
  const [text, setText] = useState(replacing?.text || '');
  const [source, setSource] = useState(replacing?.source || '');
  const [sourceId, setSourceId] = useState(replacing?.sourceId || '');
  const [sessionId, setSessionId] = useState(replacing?.sessionId || '');
  const [confidence, setConfidence] = useState(replacing?.confidence || 'single');
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      await onSave({
        questionId: question.id, text, source, sourceId: sourceId || null,
        sessionId: sessionId || null, confidence,
        supersedes: replacing ? replacing.id : null,
      });
    } catch (e2) { setErr(e2.message || String(e2)); }
  };

  return (
    <form className="dd-ff" onSubmit={submit}>
      <h3>{replacing ? 'Replace this answer' : 'Record what was established'}</h3>
      {replacing && (
        <p className="ca-note" style={{ marginTop: -4 }}>
          The current answer is kept and marked superseded, so the change stays on the record.
        </p>
      )}
      <label>
        The answer
        <textarea rows="4" value={text} autoFocus disabled={busy}
          placeholder="What was actually said. Their words where the wording matters."
          onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="dd-ff-row">
        <label>
          Where it came from
          <select value={sessionId} disabled={busy} onChange={(e) => setSessionId(e.target.value)}>
            <option value="">Not from a session</option>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.person}</option>)}
          </select>
        </label>
        <label>
          How far we stand behind it
          <select value={confidence} disabled={busy} onChange={(e) => setConfidence(e.target.value)}>
            {CONFIDENCE_IDS.map((c) => <option key={c} value={c}>{CONFIDENCE[c].label}</option>)}
          </select>
        </label>
      </div>
      <p className="ca-note" style={{ marginTop: -6 }}>{CONFIDENCE[confidence].blurb}</p>
      {sources.length > 0 && (
        <label>
          Against a known source <span style={{ fontWeight: 400 }}>(optional)</span>
          <select value={sourceId} disabled={busy} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">Not linked</option>
            {sources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
      )}
      <label>
        Or name the source in words <span style={{ fontWeight: 400 }}>(a document, a system, a person)</span>
        <input value={source} disabled={busy} onChange={(e) => setSource(e.target.value)}
          placeholder="e.g. the wave plan for August, seen on screen" />
      </label>
      {err && <p className="rd-err" role="alert">{err}</p>}
      <div className="dd-ff-foot">
        <button type="button" className="gs-btn ghost sm" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="submit" className="gs-btn primary sm" disabled={busy || !text.trim()}>
          {busy ? 'Saving…' : replacing ? 'Replace' : 'Record'}
        </button>
      </div>
    </form>
  );
}

function FindingCard({ f, sessions, sources, opportunities, evidence, slug, staff, busy, onJudge, onReplace, onDrop, onConclude }) {
  const from = f.sessionId ? sessions.find((s) => s.id === f.sessionId) : null;
  const src = f.sourceId ? (sources || []).find((r) => r.id === f.sourceId) : null;
  const [rejecting, setRejecting] = useState(false);
  const [why, setWhy] = useState('');
  const [concluding, setConcluding] = useState(false);
  const [c, setC] = useState({
    rootCause: f.rootCause || '', impact: f.impact || '', desiredOutcome: f.desiredOutcome || '',
    opportunityId: f.opportunityId || '', baselineRequired: !!f.baselineRequired,
  });
  const gate = canValidate(f);
  const behind = evidenceBehind(f);
  const opp = f.opportunityId ? (opportunities || []).find((o) => o.id === f.opportunityId) : null;
  const concluded = f.rootCause || f.impact || f.desiredOutcome || opp;
  return (
    <article className={`dd-find dd-find-${f.state}`}>
      <p className="dd-find-t">{f.text}</p>
      <div className="dd-find-meta">
        <Chip tone={`conf-${f.confidence}`} title={CONFIDENCE[f.confidence].blurb}>{CONFIDENCE[f.confidence].label}</Chip>
        <Chip tone={`fs-${f.state}`} title={FINDING_STATE[f.state].blurb}>{FINDING_STATE[f.state].label}</Chip>
        <span className="dd-find-by">
          {f.by === 'mcp' ? 'Proposed by Claude' : 'Recorded by a practitioner'}
          {f.source ? ` · ${f.source}` : ''}
          {f.at ? ` · ${when(f.at)}` : ''}
        </span>
      </div>
      {(src || from) && (
        <p className="dd-find-from">
          <span className="dd-find-fromlbl">Came from</span>
          {from && <a className="dd-find-src" href={sessionHref(slug, from.id)}>
            {Icon.session({ size: 14 })}<span>{from.person}</span>
          </a>}
          {src && <a className="dd-find-src" href={itemHref(slug, 'source', src.id)}>
            {Icon.source({ size: 14 })}<span>{src.name}</span>
          </a>}
          {/* The actual thing, one click from the answer it produced. This is the whole point of
              recording where a source lives: a citation nobody can open is taken on trust. */}
          {src?.link && <OutLink href={src.link} className="dd-out dd-out-sm">Open it</OutLink>}
          {from?.record && <OutLink href={from.record} className="dd-out dd-out-sm">The record of that session</OutLink>}
        </p>
      )}
      {f.note && <p className="dd-find-note">Practitioner: {f.note}</p>}

      {/* ⚠ WHAT WAS SAID AND WHAT WE CONCLUDE ARE DIFFERENT LAYERS, so they are different blocks.
          The text above is the account. This is Greatstone's reading of it, and a reader has to be
          able to tell them apart a month later without asking anybody. */}
      {concluded && (
        <div className="dd-find-concl">
          <h4 className="dd-sub">What we conclude</h4>
          {f.impact && <p><span className="dd-find-fromlbl">Why it matters</span> {f.impact}</p>}
          {f.rootCause && <p><span className="dd-find-fromlbl">Why it happens</span> {f.rootCause}</p>}
          {f.desiredOutcome && <p><span className="dd-find-fromlbl">What has to get better</span> {f.desiredOutcome}</p>}
          {opp && <p><span className="dd-find-fromlbl">Points at</span> {[opp.ref, opp.name].filter(Boolean).join(' ')}</p>}
          {f.baselineRequired && !opp && (
            <p className="dd-nogap">
              A baseline is marked as needed, but this points at no opportunity, so nothing carries
              the measure forward.
            </p>
          )}
        </div>
      )}

      {/* Evidence for AND against, because a record that can only hold what agrees with it becomes
          a case for a conclusion rather than a test of one. Each item is a link to its own page:
          the Validate gate below asks a practitioner to judge this finding on its evidence, which
          they cannot do from a count they can neither open nor name. An id that resolves to
          nothing is shown as a gap, never swallowed. */}
      {(behind.evidence > 0 || behind.challenged > 0) && (
        <p className="dd-find-from">
          <span className="dd-find-fromlbl">Evidence</span>
          {(f.evidenceIds || []).map((id) => {
            const e = (evidence || []).find((x) => x.id === id);
            return (
              <a key={id} className="dd-chip" href={evidenceHref(slug, id)}
                title="Supports this finding">{e ? e.item : `${id} (missing)`}</a>
            );
          })}
          {(f.challengedBy || []).map((id) => {
            const e = (evidence || []).find((x) => x.id === id);
            return (
              <a key={id} className="dd-chip dd-chip-warn" href={evidenceHref(slug, id)}
                title="Challenges this finding">{e ? e.item : `${id} (missing)`}</a>
            );
          })}
        </p>
      )}

      {/* ⚠ THE REFUSAL IS EXPLAINED WHERE IT HAPPENS. The Engine rule stops a finding reaching
          Validated with nothing identifiable behind it; a Validate button that simply errors would
          read as a bug. This says what is missing before anybody presses it. */}
      {staff && f.state === 'proposed' && !gate.ok && (
        <p className="dd-nogap">{gate.why}</p>
      )}

      {staff && f.state === 'proposed' && (
        rejecting ? (
          <div className="dd-find-reject">
            <label>
              <span className="gs-sr-only">Why this is wrong</span>
              <input value={why} disabled={busy} placeholder="What is wrong with it?"
                onChange={(e) => setWhy(e.target.value)} />
            </label>
            <button type="button" className="gs-btn ghost sm" disabled={busy} onClick={() => setRejecting(false)}>Cancel</button>
            <button type="button" className="gs-btn ghost sm rd-danger" disabled={busy}
              onClick={() => onJudge(f.id, 'rejected', why)}>Reject</button>
          </div>
        ) : (
          <div className="dd-find-act">
            <button type="button" className="gs-btn primary sm" disabled={busy}
              onClick={() => onJudge(f.id, 'validated')}>Validate</button>
            <button type="button" className="gs-btn ghost sm" disabled={busy}
              onClick={() => setRejecting(true)}>Reject</button>
            <button type="button" className="dd-edit" disabled={busy} onClick={() => onReplace(f)}>Replace</button>
          </div>
        )
      )}
      {staff && f.state === 'validated' && (
        <div className="dd-find-act">
          <button type="button" className="dd-edit" disabled={busy} onClick={() => onReplace(f)}>Replace</button>
          <button type="button" className="dd-ans-x" disabled={busy} onClick={() => onDrop(f.id)}>Remove</button>
        </div>
      )}

      {/* Concluding is a separate act from recording, and separate from replacing. Replacing changes
          what was SAID and supersedes; this refines what we make of it and stays on the same
          finding, logged either way. */}
      {staff && onConclude && f.state !== 'superseded' && f.state !== 'rejected' && (
        concluding ? (
          <div className="dd-find-concl-edit">
            <label>Why it matters
              <textarea rows="2" value={c.impact} disabled={busy}
                placeholder="The consequence of the current state. Not the fix."
                onChange={(e) => setC({ ...c, impact: e.target.value })} /></label>
            <label>Why it happens
              <textarea rows="2" value={c.rootCause} disabled={busy}
                placeholder="The mechanism underneath. Leave blank rather than manufacture one."
                onChange={(e) => setC({ ...c, rootCause: e.target.value })} /></label>
            <label>What has to get better
              <textarea rows="2" value={c.desiredOutcome} disabled={busy}
                placeholder="The outcome, not the solution. The design comes later."
                onChange={(e) => setC({ ...c, desiredOutcome: e.target.value })} /></label>
            {(opportunities || []).length > 0 && (
              <label>Which opportunity this points at
                <select value={c.opportunityId} disabled={busy}
                  onChange={(e) => setC({ ...c, opportunityId: e.target.value })}>
                  <option value="">Not linked</option>
                  {/* An id written elsewhere stays selectable, so opening this never silently
                      destroys a link this browser has not loaded. */}
                  {c.opportunityId && !(opportunities || []).some((o) => o.id === c.opportunityId)
                    && <option value={c.opportunityId}>{c.opportunityId} (not loaded)</option>}
                  {opportunities.map((o) => (
                    <option key={o.id} value={o.id}>{[o.ref, o.name].filter(Boolean).join(' ')}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="dd-find-check">
              <input type="checkbox" checked={c.baselineRequired} disabled={busy}
                onChange={(e) => setC({ ...c, baselineRequired: e.target.checked })} />
              A measurable baseline is needed to show this moved
            </label>
            <div className="dd-find-act">
              <button type="button" className="gs-btn primary sm" disabled={busy}
                onClick={async () => { await onConclude(f.id, c); setConcluding(false); }}>Save</button>
              <button type="button" className="gs-btn ghost sm" disabled={busy}
                onClick={() => setConcluding(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="dd-find-act">
            <button type="button" className="dd-edit" disabled={busy} onClick={() => setConcluding(true)}>
              {concluded ? 'Refine the conclusion' : 'Conclude from this'}
            </button>
          </div>
        )
      )}
    </article>
  );
}

export default function QuestionPage({
  slug, question, pillar, plan, map, log, findings, staff, canAuthor, busy,
  onRecord, onJudge, onDropFinding, onConclude, onEdit, onAgreement, onNote,
  onStatus, onSaveField, onSaveRecord,
  files, onAttach, onDetach,
}) {
  const can = staff ? (canAuthor || { can: false }) : { can: false };
  const certBtn = useRef(null);
  const [certOpen, setCertOpen] = useState(false);
  const [cert, setCert] = useState({ certainty: question.certainty, note: question.note || '' });
  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState(null);

  const live = useMemo(() => standing(findings, question.id), [findings, question.id]);
  // What the stated certainty and the recorded answers say about each other.
  const drift = useMemo(() => certaintyDrift(question, findings), [question, findings]);
  const past = useMemo(() => historyFor(findings, question.id).filter((f) => f.state === 'superseded' || f.state === 'rejected'), [findings, question.id]);
  const qs = useMemo(() => questionState(findings, question.id), [findings, question.id]);
  const entries = useMemo(() => historyOf(log, question.id), [log, question.id]);

  // Who is booked to answer this, which is the tie that makes a session an instrument.
  const askedIn = (plan.SESSIONS || []).filter((s) => (s.covers || []).includes(question.id));
  // The processes this question sits on. ProcessPage writes the tie; everything revolves around
  // the process, so the question has to be able to name its own.
  const sitsOn = (plan.PROCESSES || []).filter((p) => (question.processes || []).includes(p.num));
  // The live proposals whose processes this question sits on: the exact reverse of BuildPage's
  // derived askTeam join, so the stake that makes this question urgent is visible on the question.
  const waiting = (plan.BUILDS || []).filter((b) =>
    (b.processes || []).some((n) => (question.processes || []).includes(n)));
  // What this question made us ask next. A follow-up names its parent, so the link is one-way in
  // the data and two-way on the page.
  const followUps = (plan.QUESTIONS || []).flatMap((g) => (g.items || [])
    .filter((q) => q.from === question.id).map((q) => ({ ...q, pillar: g.pillar })));
  const parent = (plan.QUESTIONS || []).flatMap((g) => (g.items || []).map((q) => ({ ...q, pillar: g.pillar })))
    .find((q) => q.id === question.from);
  const st = stateOf(map, question.id);
  const cmp = useMemo(() => comparison(plan, findings, question.id), [plan, findings, question.id]);

  const save = async (input) => {
    await onRecord(input);
    setAdding(false); setReplacing(null);
  };

  return (
    <div className="ca-wrap dd-wrap">
      <nav className="dd-crumb">
        <a href={deepDiveHref(slug)}>&larr; {plan.engagement?.client}</a>
        <span aria-hidden="true"> · </span>
        <span>{pillar}</span>
      </nav>
      {plan && <RecordSearch slug={slug} plan={plan} />}

      <header className="dd-head">
        <div className="dd-kicker"><Labelled icon="question">Question</Labelled><span aria-hidden="true"> · </span>{PILLAR_GROUP[pillar]} · {pillar}</div>
        <h1 className="dd-qh1">{question.q}</h1>
        <dl className="dd-meta">
          {/* ⚠ CERTAINTY AND THE NOTE ARE ONE DECISION. The record REFUSES a question marked known
              or indicated with nothing recorded as established, so a control offering the grade
              alone produces a refusal every time somebody grades one up. Same shape as a build's
              state and its reason: one pane, one write, one History entry. */}
          <div><dt>Certainty</dt><dd>
            {can.can ? (
              <>
                <button type="button" ref={certBtn} className="dd-isel-b"
                  aria-haspopup="dialog" aria-expanded={certOpen} disabled={busy}
                  onClick={() => { setCert({ certainty: question.certainty, note: question.note || '' }); setCertOpen((v) => !v); }}>
                  {CERTAINTY[question.certainty].label}
                  <span className="dd-chip-caret" aria-hidden="true">▾</span>
                </button>
                {certOpen && (
                  <Popover label="How certain are we" anchorRef={certBtn} onClose={() => setCertOpen(false)}
                    onSave={() => onSaveField(question, cert)}>
                    <label>
                      Certainty
                      <select value={cert.certainty}
                        onChange={(e) => setCert((c) => ({ ...c, certainty: e.target.value }))}>
                        {Object.keys(CERTAINTY).map((k) => (
                          <option key={k} value={k}>{CERTAINTY[k].label} · {CERTAINTY[k].verb}</option>
                        ))}
                      </select>
                    </label>
                    {cert.certainty !== 'unknown' && (
                      <label>
                        What is already established <span style={{ fontWeight: 400 }}>(required)</span>
                        <textarea rows="3" value={cert.note} required
                          placeholder="What we already hold, so this is validated rather than investigated."
                          onChange={(e) => setCert((c) => ({ ...c, note: e.target.value }))} />
                      </label>
                    )}
                  </Popover>
                )}
              </>
            ) : CERTAINTY[question.certainty].label}
            {/* ⚠ TWO CLAIMS ABOUT ONE QUESTION, NOW COMPARED. The certainty above is what a
                practitioner SAYS; the findings below are what the record can SHOW. Both were on
                screen and neither was ever set against the other, so a question marked "still to
                investigate" with three validated answers on it kept counting as outstanding work.
                It suggests and never changes anything: the rating is a professional judgement, and
                the same rule that stops the Engine validating a finding stops it re-rating a
                question. */}
            {drift && (
              <p className="dd-nogap dd-drift">
                {drift.why} <strong>{drift.suggest}</strong>
              </p>
            )}
          </dd></div>
          <div><dt>Answer</dt><dd>{qs.answered ? qs.label : 'Not yet recorded'}</dd></div>
          <div><dt>Status</dt><dd>
            <InlineSelect value={st.status} can={onStatus ? can : { can: false }} label="Status"
              options={Object.keys(STATUS).map((k) => ({ id: k, label: STATUS[k].label }))}
              onSave={(next) => onStatus(question.id, { status: next }, question.q)} />
          </dd></div>
          <div><dt>Asked in</dt><dd>{askedIn.length ? `${askedIn.length} session${askedIn.length === 1 ? '' : 's'}` : 'No session yet'}</dd></div>
          {/* ⚠ THE CENTRAL RELATION, VISIBLE FROM BOTH SIDES. ProcessPage ties questions to a
              process; until this row, the tie could be read from the process and not from the
              question, so a practitioner preparing for a walkthrough could not see what the
              question sits on. */}
          <div><dt>Also under</dt><dd>
            <InlineLinks value={question.alsoPillars || []} can={can} label="pillars"
              options={PILLARS.filter((p) => p !== pillar).map((p) => ({ id: p, label: p }))}
              addLabel="Add a pillar" empty="Only its home pillar."
              onChange={(next) => onSaveField(question, { alsoPillars: next })} />
          </dd></div>
          <div><dt>Sits on</dt><dd>
            {sitsOn.length ? sitsOn.map((p, i) => (
              <React.Fragment key={p.id}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                <a className="dd-either-a" href={itemHref(slug, 'process', p.id)}>{p.name}</a>
              </React.Fragment>
            )) : 'No process yet'}
          </dd></div>
          {/* ⚠ `route` is the vocabulary that lets the record say "38 of these need nobody's diary".
              It gained an editor and was displayed nowhere, so nobody could see what they had set.
              Now it is both shown and set here. */}
          <div><dt>How it gets answered</dt><dd>
            <InlineSelect value={question.route || ''} can={onSaveField ? can : { can: false }}
              label="How it gets answered" empty="Not decided"
              options={[{ id: '', label: 'Not decided' },
                ...ROUTES.map((r) => ({ id: r, label: r }))]}
              onSave={(next) => onSaveField(question, { route: next || null })} />
          </dd></div>
          <div><dt>Only for</dt><dd>
            <InlineText value={question.subset} can={onSaveField ? can : { can: false }}
              label="who this applies to" multiline={false}
              empty="Everybody" placeholder="A branch, a segment, a product. Leave blank for everybody."
              onSave={(v) => onSaveField(question, { subset: v })} />
          </dd></div>
        </dl>
        {staff && (
          <div className="dd-headtools">
            <button type="button" className="gs-btn ghost sm" disabled={!canAuthor?.can}
              title={canAuthor?.can ? undefined : canAuthor?.why} onClick={() => onEdit(question)}>Edit the question</button>
            {!adding && !replacing && (
              <button type="button" className="gs-btn primary sm" disabled={!canAuthor?.can}
                title={canAuthor?.can ? undefined : canAuthor?.why} onClick={() => setAdding(true)}>+ Record an answer</button>
            )}
          </div>
        )}
      </header>

      {question.note && (
        <section className="dd-access">
          <div className="dd-access-mark" aria-hidden="true" />
          <div>
            {/* ⚠ "ALREADY ESTABLISHED" SAT TWO INCHES ABOVE "WHAT WE HAVE ESTABLISHED" AND SAID THE
                OPPOSITE. This one is the question's own note: what the record came in knowing,
                typed by somebody, with no source behind it. The other is the findings, which carry
                a source and a certainty and reach the validation queue. A practitioner reading
                "Already established: the supervisor does" and then "What we have established:
                nothing recorded yet" reasonably concludes the page is broken.
                The names now carry the difference that matters: one is prior, one is this work. */}
            <h2>What we already knew</h2>
            <p>{question.note.replace(/^(Known|Indicated|Partly)\.\s*/i, '')}</p>
          </div>
        </section>
      )}

      {(adding || replacing) && (
        <FindingForm question={question} sessions={plan.SESSIONS || []} sources={plan.SOURCES || []}
          replacing={replacing} busy={busy} onSave={save}
          onCancel={() => { setAdding(false); setReplacing(null); }} />
      )}

      <section className="org-sec dd-sec">
        <h2><Labelled icon="validated">What we have established</Labelled></h2>
        {live.length === 0 ? (
          <div className="dd-empty">
            <h2>Nothing recorded yet</h2>
            <p>An answer arrives from a session, or from a document we have read. Record it here and it
              carries its source and how far we stand behind it.</p>
            {/* The action, in the empty state that describes it, rather than in the page header. */}
            {staff && !adding && (
              <div className="dd-empty-act">
                <button type="button" className="gs-btn primary sm" disabled={!canAuthor?.can}
                  title={canAuthor?.can ? undefined : canAuthor?.why}
                  onClick={() => setAdding(true)}>Record an answer</button>
              </div>
            )}
          </div>
        ) : (
          <div className="dd-finds">
            {live.map((f) => (
              <FindingCard key={f.id} f={f} sessions={plan.SESSIONS || []} sources={plan.SOURCES || []}
                opportunities={plan.OPPORTUNITIES || []} evidence={plan.EVIDENCE || []} onConclude={onConclude}
                slug={slug} staff={staff} busy={busy}
                onJudge={onJudge} onReplace={setReplacing} onDrop={onDropFinding} />
            ))}
          </div>
        )}
      </section>

      {cmp.asked > 1 && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="compare">Across the people we asked</Labelled></h2>
          <p className="org-sec-sub">
            The same question is put to more than one person on purpose: to find out whether the
            accounts agree. Where they do, there is no reason to keep asking.
          </p>

          <div className="org-stats dd-stats">
            <div className="org-stat dd-tile"><div className="org-stat-v">{cmp.asked}</div>
              <div className="org-stat-l">Asked of</div><div className="dd-tile-hint">people</div></div>
            <div className="org-stat dd-tile"><div className="org-stat-v">{cmp.answered}</div>
              <div className="org-stat-l">Answered</div>
              <div className="dd-tile-hint">{cmp.outstanding.length ? `${cmp.outstanding.length} still to come` : 'all in'}</div></div>
            <div className="org-stat dd-tile"><div className="org-stat-v">{cmp.accounts}</div>
              <div className="org-stat-l">Accounts</div><div className="dd-tile-hint">independent answers held</div></div>
            {cmp.awaiting > 0 && (
              <div className="org-stat dd-tile"><div className="org-stat-v">{cmp.awaiting}</div>
                <div className="org-stat-l">Awaiting you</div><div className="dd-tile-hint">proposed, not validated</div></div>
            )}
          </div>

          {/* Answers side by side, so a difference is seen rather than described. */}
          <div className="dd-cmp">
            {cmp.bySession.map(({ session, answers }) => (
              <div key={session.id} className={`dd-cmp-col${answers.length ? '' : ' is-waiting'}`}>
                <h3><a className="ca-link" href={sessionHref(slug, session.id)}>{session.person}</a></h3>
                {answers.length === 0 ? (
                  <p className="dd-cmp-none">Not answered yet.</p>
                ) : answers.map((f) => (
                  <div key={f.id} className="dd-cmp-a">
                    <p>{f.text}</p>
                    <Chip tone={`conf-${f.confidence}`}>{CONFIDENCE[f.confidence].label}</Chip>
                  </div>
                ))}
              </div>
            ))}
            {cmp.unattached.map((f) => (
              <div key={f.id} className="dd-cmp-col">
                <h3>{f.source || 'Not from a session'}</h3>
                <div className="dd-cmp-a"><p>{f.text}</p><Chip tone={`conf-${f.confidence}`}>{CONFIDENCE[f.confidence].label}</Chip></div>
              </div>
            ))}
          </div>

          {/* The verdict is a person's. Two free-text answers cannot be compared by software, and
              putting a number on that would be inventing a measurement nobody took. */}
          <div className="dd-agree">
            <h3><Labelled icon="question">Do these accounts agree?</Labelled></h3>
            {!cmp.comparable ? (
              <p className="ca-note">Only one account so far. There is nothing to compare yet.</p>
            ) : (
              <>
                <div className="dd-agree-opts" role="group" aria-label="Whether the accounts agree">
                  {AGREEMENT_IDS.map((k) => (
                    <button key={k} type="button" disabled={!staff || busy}
                      className={`dd-agree-b${st.agreement === k ? ' is-on' : ''}`}
                      aria-pressed={st.agreement === k}
                      onClick={() => onAgreement(question.id, st.agreement === k ? null : k, question.q)}>
                      {AGREEMENT[k].label}
                    </button>
                  ))}
                </div>
                {/* ⚠ THE VERDICT HAD NOWHERE TO SAY WHY. Three people gave three accounts and a
                    practitioner pressed "They contradict" — the most consequential judgement on the
                    page — and the record kept the word and not one syllable of the reasoning.
                    Rejecting a finding gets a `why`; agreeing or contradicting got nothing.
                    This is the item's working note, which the question page never showed at all. */}
                {/* ⚠ ONE SLOT, ONE MEANING. This is the item's WORKING NOTE — the same field the
                    pillars list edits under "Where we have got to on this". Headed as a separate
                    "rationale" it looked like a second field, and the two editors silently replaced
                    each other's text. Same name, same trimming, placed here because next to the
                    verdict is where the reasoning gets written. */}
                <div className="dd-agree-why">
                  <h4 className="dd-sub">Working note, Greatstone only</h4>
                  <InlineText value={st.note} can={staff ? (canAuthor || { can: false }) : { can: false }}
                    label="the working note" rows={3}
                    placeholder="Where we have got to, and what made you read it this way."
                    empty="Nothing noted. The verdict is on the record and the reasoning is not."
                    onSave={(v) => onNote(question.id, v, question.q)} />
                </div>
                <p className="ca-note">
                  {st.agreement ? AGREEMENT[st.agreement].blurb
                    : 'Nobody has judged this yet. Until somebody does, the record cannot say whether asking again would tell us anything.'}
                </p>
              </>
            )}
          </div>
        </section>
      )}

      <Attachments slug={slug} itemId={question.id} files={files} staff={staff}
        canAuthor={canAuthor} busy={busy} onAttach={onAttach} onDetach={onDetach} />

      <section className="org-sec dd-sec">
        <h2><Labelled icon="session">Where this is asked</Labelled></h2>
        <p className="org-sec-sub">A question nobody is booked to ask is a question that will not get answered.</p>
        {askedIn.length > 0 && (
          <ul className="dd-cli">
            {askedIn.map((s) => (
              <li key={s.id} className="dd-cli-row">
                <div className="dd-cli-main"><h3><a className="ca-link" href={sessionHref(slug, s.id)}>{s.person}</a></h3><p>{s.only}</p></div>
                <Chip tone={`st-${stateOf(map, s.id).status}`}>{STATUS[stateOf(map, s.id).status].label}</Chip>
              </li>
            ))}
          </ul>
        )}
        {/* ⚠ The empty state used to say "add it to a session's questions" and offer no way to do
            that: the go-elsewhere pattern. The tie control writes the session from here. */}
        {staff ? (
          <SessionTie plan={plan} q={question} slug={slug}
            can={canAuthor || { can: false }}
            save={(s, fields) => onSaveRecord(s, 'session', fields)} />
        ) : !askedIn.length && (
          <p className="dd-nogap">No session covers this yet.</p>
        )}
      </section>

      {/* ⚠ THE STAKE, VISIBLE FROM THE QUESTION. A build lists the open questions on the
          processes it changes (BuildPage's derived askTeam join), and grading a question Known
          silently drops it off that list. This is the exact reverse of that join, so whoever
          arrived here from a build can get back to it and keep working, and a question can be
          prioritised by what is actually waiting on its answer. */}
      {waiting.length > 0 && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="proposed">What waits on this answer</Labelled></h2>
          <p className="org-sec-sub">Proposals on the processes this question sits on. Answering it here moves them.</p>
          <ul className="dd-cli">
            {waiting.map((b) => (
              <li key={b.id} className="dd-cli-row">
                <div className="dd-cli-main">
                  <h3><a className="ca-link" href={itemHref(slug, 'build', b.id)}>{[b.ref, b.name].filter(Boolean).join(' ')}</a></h3>
                  {b.what && <p className="dd-clamp2">{b.what}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(followUps.length > 0 || parent) && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="link">What it led to</Labelled></h2>
          {parent && (
            <p className="org-sec-sub">
              This came out of <a className="ca-link" href={questionHref(slug, parent.id)}>{parent.q}</a>.
            </p>
          )}
          {followUps.length > 0 && (
            <ul className="dd-cli">
              {followUps.map((q) => (
                <li key={q.id} className="dd-cli-row">
                  <div className="dd-cli-main">
                    <h3><a className="ca-link" href={questionHref(slug, q.id)}>{q.q}</a></h3>
                    <p>{q.pillar}</p>
                  </div>
                  <Chip tone={`cert-${q.certainty}`}>{CERTAINTY[q.certainty].label}</Chip>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {past.length > 0 && (
        <section className="org-sec dd-sec">
          <h2>Replaced and rejected</h2>
          <p className="org-sec-sub">Kept so a change is visible rather than silent.</p>
          <div className="dd-finds">
            {past.map((f) => (
              <FindingCard key={f.id} f={f} sessions={plan.SESSIONS || []} sources={plan.SOURCES || []}
                opportunities={plan.OPPORTUNITIES || []} evidence={plan.EVIDENCE || []}
                slug={slug} staff={false} busy={busy}
                onJudge={onJudge} onReplace={setReplacing} onDrop={onDropFinding} />
            ))}
          </div>
        </section>
      )}

      {entries.length > 0 && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="history">History</Labelled></h2>
          <p className="org-sec-sub">Everything done to this question, newest first.</p>
          <ChangeLog entries={entries} />
        </section>
      )}
    </div>
  );
}
