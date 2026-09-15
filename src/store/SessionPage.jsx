// One session, as a page a practitioner runs the Deep Dive from.
//
// The sessions are where the evidence actually arrives, so this page has to be sufficient on its
// own: open it, follow it, and the session is covered. That means the questions in front of you and
// not in another tab, what is already established stated rather than re-asked, how long it should
// take, what to bring, and what only this person can give.
//
// Everything here is derived from the record. Nothing is restated, so nothing can drift out of step
// with the plan the rest of the Portal shows.
import React, { useMemo, useRef, useState } from 'react';
import { sessionBrief, PILLAR_GROUP, CERTAINTY_IDS } from '../data/deepdive-schema.mjs';
import { CERTAINTY, EVIDENCE_STATE } from '../data/deepdive.mjs';
import { certaintyDrift } from '../data/deepdive-findings.mjs';
import { STATUS, stateOf, sessionLeftovers, sessionNeedsRecord } from './deepdive-state.mjs';
import { deepDiveHref, sessionHref, questionHref, itemHref } from '../lib/deepdive-route.mjs';
import { Icon, Labelled } from './DeepDiveIcons.jsx';
import OutLink from './OutLink.jsx';
import RecordSearch from './RecordSearch.jsx';
import SessionRun from './SessionRun.jsx';
import InlineText from './InlineText.jsx';
import InlineSelect from './InlineSelect.jsx';
import InlineLinks from './InlineLinks.jsx';

const Chip = ({ tone, children, title }) => (
  <span className={`dd-chip dd-${tone}`} title={title}>{children}</span>
);

const mins = (n) => (!n ? null : n >= 60
  ? `${Math.floor(n / 60)}h${n % 60 ? ` ${n % 60}m` : ''}`
  : `${n} min`);

// What the room actually gave us, against the question it answers.
//
// This is the point of the whole record: a question is not answered by a status flag, it is answered
// by something somebody said. Capturing it HERE rather than in a notes tab means the answer arrives
// already attached to both the question and the session it came from, which is what lets the record
// say later where a finding came from instead of just asserting it.
function Answers({ questionId, label, sessionId, findings, staff, busy, onRecord, onDrop, canAuthor,
                   slug, sessions = [] }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const mine = (findings || []).filter((f) => f.questionId === questionId);
  // A finding from another sitting names that sitting and opens it, the same way QuestionPage's
  // FindingCard does: chasing an answer back to the transcript it came from should be one click,
  // not a detour through the question page. One recorded here needs no link, this is the page.
  const fromMeta = (f) => {
    if (f.sessionId === sessionId) return 'Recorded in this session';
    const from = sessions.find((s) => s.id === f.sessionId);
    return from
      ? <a className="dd-find-src" href={sessionHref(slug, from.id)}>From {from.person || from.name}</a>
      : 'From another session';
  };

  const save = async () => {
    const text = draft.trim();
    if (!text) return;
    await onRecord({ questionId, sessionId, text, label });
    setDraft(''); setOpen(false);
  };

  return (
    <div className="dd-ans">
      {mine.map((f) => (
        <div key={f.id} className={`dd-ans-row${f.sessionId === sessionId ? ' is-here' : ''}`}>
          <p>{f.text}</p>
          <div className="dd-ans-meta">
            {fromMeta(f)}
            {staff && onDrop && (
              <button type="button" className="dd-ans-x" disabled={busy}
                onClick={() => onDrop(f.id)}>Remove<span className="gs-sr-only"> this finding</span></button>
            )}
          </div>
        </div>
      ))}
      {staff && canAuthor?.can && (open ? (
        <div className="dd-ans-edit">
          <label>
            <span className="gs-sr-only">What was established about: {label}</span>
            <textarea rows="3" autoFocus value={draft} disabled={busy}
              placeholder="What they actually said, in their words where it matters."
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
              }} />
          </label>
          <div className="dd-ans-foot">
            <button type="button" className="gs-btn ghost sm" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="gs-btn primary sm" disabled={busy || !draft.trim()} onClick={save}>Record</button>
          </div>
        </div>
      ) : (
        <button type="button" className="dd-ans-add" disabled={busy} onClick={() => setOpen(true)}>
          + Record what was established<span className="gs-sr-only"> for: {label}</span>
        </button>
      ))}
    </div>
  );
}

export default function SessionPage({ slug, session, plan, map, staff, onEdit, onSaveField,
                                     onStatus, onSaveRecord, canAuthor,
                                     findings = [], onRecord, onDropFinding, busy, onAddQuestion,
}) {
  // The live surface. State rather than a route on purpose: nothing recorded lives in this flag,
  // so a refresh loses only the stopwatch, never an answer.
  const [running, setRunning] = useState(false);
  const leftovers = sessionLeftovers(plan, map, session);
  const needsRecord = sessionNeedsRecord(map, session);
  const recordRef = useRef(null);

  if (running) {
    return (
      <div className="ca-wrap dd-wrap">
        <SessionRun slug={slug} session={session} plan={plan} map={map} busy={busy} canAuthor={canAuthor}
          onSaveRecord={onSaveRecord} onSaveField={onSaveField} onStatus={onStatus}
          onAddQuestion={onAddQuestion} onRecord={onRecord}
          onDone={() => {
            setRunning(false);
            // The nudge, made physical: ending without a record scrolls to where it goes.
            setTimeout(() => recordRef.current?.scrollIntoView({ block: 'center' }), 60);
          }} />
      </div>
    );
  }

  const can = staff ? (canAuthor || { can: false }) : { can: false };
  const brief = useMemo(() => sessionBrief(plan, session), [plan, session]);
  const st = stateOf(map, session.id);
  const sources = useMemo(
    () => (plan.SOURCES || []).filter((r) => (r.pillars || []).some((x) => (session.pillars || []).includes(x))),
    [plan, session],
  );
  // A rough shape for the room: the asking is the session, the rest is framing and close.
  const perQuestion = brief.toAsk.length && session.minutes
    ? Math.max(2, Math.round((session.minutes * 0.75) / brief.toAsk.length))
    : null;

  return (
    <div className="ca-wrap dd-wrap dd-session">
      <nav className="dd-crumb" aria-label="Breadcrumb">
        <a href={deepDiveHref(slug)}>&larr; {plan.engagement?.client || 'Record'}</a>
        <span aria-hidden="true"> · </span><span>Sessions</span>
      </nav>
        {plan && <RecordSearch slug={slug} plan={plan} />}

      <header className="dd-head">
        <div className="dd-kicker"><Labelled icon="session">Session</Labelled>
          {session.priority && <> <span aria-hidden="true">·</span> {session.priority}</>}
          {session.method && <> <span aria-hidden="true">·</span> {session.method}</>}
        </div>
        {/* The purpose is the title; the people in the room stand under it. */}
        <h1>{session.name || session.person}</h1>
        {/* The person's own page holds the prep: who they report to, their unit, what they run
            and own. When the record knows who is in the room, the name is the way in. */}
        {session.name && (
          <p className="dd-lead"><Labelled icon="session">
            {session.personId
              ? <a className="dd-q-link" href={itemHref(slug, 'person', session.personId)}>{session.person}</a>
              : session.person}
          </Labelled></p>
        )}
        {session.only && <p className="dd-lead">{session.only}</p>}
        <dl className="dd-meta">
          {/* ⚠ How long a session should take is the number a practitioner adjusts most, while
              looking at how many questions it carries. It was set in a twenty-five field form. */}
          <div><dt>Length</dt><dd>
            <InlineText value={session.minutes ? String(session.minutes) : ''} can={can}
              label="how long it should take" multiline={false} empty="Not set"
              placeholder="Minutes, 1 to 480"
              onSave={(v) => onSaveField(session, { minutes: v })} />
          </dd></div>
          <div><dt>Questions</dt><dd>{brief.toAsk.length} to ask{brief.toState.length ? `, ${brief.toState.length} to confirm` : ''}</dd></div>
          <div><dt>Pillars</dt><dd>{(session.pillars || []).length} of {(plan.PILLAR_ORDER || []).length}</dd></div>
          <div><dt>Status</dt><dd>
            {staff ? (
              <InlineSelect value={st.status} can={onStatus ? can : { can: false }} label="Status"
                options={Object.keys(STATUS).map((k) => ({ id: k, label: STATUS[k].label }))}
                onSave={(next) => onStatus(session.id, { status: next }, session.person)} />
            ) : STATUS[st.status].client}
          </dd></div>
        </dl>
        {/* ⚠ `notHere` is what stops the same question being put to four people, and it was stored
            and never shown — so the one thing the plan uses to protect a stakeholder's time was
            invisible to the person walking into the room. */}
        {staff && (session.notHere || []).length > 0 && (
          <p className="dd-nothere">
            <b>Not to be raised here:</b> {(session.notHere || []).join('; ')}
          </p>
        )}
        {staff && (
          <div className="dd-headtools">
            {/* The whole point of the plan: this page becomes the surface the meeting is run
                from. Starting needs nothing; writing an answer inside is what needs authorship. */}
            <button type="button" className="gs-btn primary sm" onClick={() => setRunning(true)}>
              {Icon.session({ size: 14 })} Start session
            </button>
            <button type="button" className="gs-btn ghost sm" disabled={!canAuthor?.can}
              title={canAuthor?.can ? undefined : canAuthor?.why}
              onClick={() => onEdit(session)}>Edit this session</button>
          </div>
        )}
      </header>

      {/* What the meeting left behind. Judged against the record NOW: a question answered later by
          any route drops off this list, because the point is the gap, not the history. Each one
          links to its page, where SessionTie moves it into a follow-up sitting: this is the
          Targeted Clarification phase of Ben's plan, surfaced instead of remembered. */}
      {leftovers.length > 0 && (
        <section className="org-sec dd-sec dd-left">
          <h2><Labelled icon="warn">Left unanswered when this ended</Labelled></h2>
          <p className="dd-sub-lead">{leftovers.length} of the {(session.covers || []).length} questions
            this session carried {leftovers.length === 1 ? 'is' : 'are'} still open. Open one and tie it
            to a follow-up session, or answer it from the transcript.</p>
          <ul className="dd-left-l">
            {leftovers.map((x) => {
              const followUps = (plan.SESSIONS || [])
                .filter((t) => t.id !== session.id && (t.covers || []).includes(x.id));
              const targets = (plan.SESSIONS || [])
                .filter((t) => t.id !== session.id && !(t.covers || []).includes(x.id));
              return (
                <li key={x.id}>
                  <a className="dd-q-link" href={itemHref(slug, 'question', x.id)}>{x.q.q}</a>
                  <Chip tone="pillar">{x.pillar}</Chip>
                  {/* The chip names the follow-up sitting, so it opens it: a leftover is checked
                      by looking at the session that now carries it. Still a chip, a.dd-chip rules
                      keep it one. */}
                  {followUps.map((t) => (
                    <a key={t.id} className="dd-chip dd-ev-held" href={sessionHref(slug, t.id)}
                      title={t.name || t.person}>also in {t.ref || (t.name || t.person)}</a>
                  ))}
                  {/* The re-tie, on the row: the whole reason this list exists is to move a missed
                      question into a follow-up sitting, so the move lives here rather than a page
                      away. Adding, never moving: the question stays tied to the session that
                      carried it, because that history is what "left unanswered" means. */}
                  {staff && canAuthor?.can && targets.length > 0 && (
                    <select className="dd-left-tie" value="" disabled={busy}
                      aria-label={`Tie "${x.q.q}" into a follow-up session`}
                      onChange={(e) => {
                        const t = targets.find((z) => z.id === e.target.value);
                        if (t) onSaveRecord(t, 'session', { covers: [...(t.covers || []), x.id] });
                      }}>
                      <option value="">Tie into…</option>
                      {targets.map((t) => (
                        <option key={t.id} value={t.id}>{[t.ref, t.name || t.person].filter(Boolean).join(' · ')}</option>
                      ))}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Beyond its questions, a sitting carries the documents to ask for and the claims to test
          there. Both are ties written on the item (evidence.sessionIds, hypothesis.sessionIds), so
          this list is the record's, not a guess. */}
      {(() => {
        const ask = (plan.EVIDENCE || []).filter((e) => (e.sessionIds || []).includes(session.id));
        const test = (plan.HYPOTHESES || []).filter((h) => (h.sessionIds || []).includes(session.id));
        if (!ask.length && !test.length) return null;
        return (
          <section className="org-sec dd-sec">
            <h2><Labelled icon="evidence">Also in this room</Labelled></h2>
            {ask.length > 0 && (
              <>
                <h3 className="dd-sub">Ask for</h3>
                <ul className="dd-left-l">
                  {ask.map((e) => (
                    <li key={e.id}>
                      <a className="dd-q-link" href={itemHref(slug, 'evidence', e.id)}>{e.item}</a>
                      <Chip tone={`ev-${e.state}`}>{e.state}</Chip>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {test.length > 0 && (
              <>
                <h3 className="dd-sub">Test</h3>
                <ul className="dd-left-l">
                  {test.map((h) => (
                    <li key={h.id}>
                      <a className="dd-q-link" href={itemHref(slug, 'hypothesis', h.id)}>{h.claim}</a>
                      <Chip tone={`hv-${h.verdict}`}>{h.verdict}</Chip>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        );
      })()}

      {/* Once a session has been run, every answer that came out of it should be traceable back to
          what was actually said. A transcript nobody can open turns each of those answers into
          something a reader has to take on trust. */}
      <section className="org-sec dd-sec dd-record" ref={recordRef}>
        {needsRecord && (
          <p className="dd-run-nothere" role="alert">
            <Labelled icon="warn">This session is examined and its record can be opened by nobody.</Labelled>{' '}
            Add the link or say where it lives: a finding traced to this session is only checkable
            through it.
          </p>
        )}
        <h2><Labelled icon="source">The record of this session</Labelled></h2>
        {session.record || session.recordNote ? (
          <div className="dd-reach">
            {session.record && <OutLink href={session.record} className="dd-out dd-out-big">Open the transcript</OutLink>}
            {session.recordNote && <p className="dd-reach-where">{session.recordNote}</p>}
          </div>
        ) : null}
        {/* ⚠ This section told you to add the transcript and gave you nowhere to put it. Both halves
            are editable here now: the link itself, and where it lives when there is no link. */}
        <div className="dd-recedit">
          <div>
            <h3 className="dd-sub">A link to it</h3>
            <InlineText value={session.record} can={staff ? (canAuthor || { can: false }) : { can: false }}
              label="the link to the record" multiline={false}
              placeholder="https://…"
              empty="Not recorded. Without it, every answer this produces has to be taken on trust."
              onSave={(v) => onSaveField(session, { record: v })} />
          </div>
          <div>
            <h3 className="dd-sub">Or where it lives</h3>
            <InlineText value={session.recordNote} can={staff ? (canAuthor || { can: false }) : { can: false }}
              label="where the record lives" rows={2}
              placeholder="Whose notebook, which drive, which recording."
              empty="Not said."
              onSave={(v) => onSaveField(session, { recordNote: v })} />
          </div>
        </div>
      </section>

      {/* ⚠ `output` is in the schema, has been since the beginning, and was rendered NOWHERE. What a
          session actually produced is the thing you write the moment you walk out of it, and the
          record had no place for it at all. */}
      {(session.output || staff) && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="validated">What came out of it</Labelled></h2>
          <InlineText value={session.output} can={staff ? (canAuthor || { can: false }) : { can: false }}
            label="what came out of it" rows={4}
            placeholder="What this session actually produced, written while it is fresh."
            empty="Nothing written down yet."
            onSave={(v) => onSaveField(session, { output: v })} />
        </section>
      )}

      {brief.toAsk.length === 0 && (
        <div className="dd-nogap" style={{ marginBottom: 18 }}>
          No questions are tied to this session yet, so there is nothing to run it against.
          {staff ? ' Edit the session and choose the questions it is meant to answer.' : ''}
        </div>
      )}

      {session.context && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="session">Who you are speaking to</Labelled></h2>
          <p className="dd-prose">{session.context}</p>
        </section>
      )}

      {session.objectives?.length > 0 && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="target">What this session has to achieve</Labelled></h2>
          <ol className="dd-outcomes">
            {session.objectives.map((o, i) => (
              <li key={i}><span className="dd-outcome-n">{String(i + 1).padStart(2, '0')}</span><span>{o}</span></li>
            ))}
          </ol>
        </section>
      )}

      {session.opening && (
        <section className="org-sec dd-sec">
          <h2>How to open</h2>
          <blockquote className="dd-opening">{session.opening}</blockquote>
        </section>
      )}

      {brief.toState.length > 0 && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="validated">Already established, do not re-ask</Labelled></h2>
          <p className="org-sec-sub">
            Confirm these in passing if it helps, but they are answered. Asking again spends the
            goodwill the earlier stages built.
          </p>
          <ul className="dd-known">
            {brief.toState.map((q) => (
              <li key={q.id}>
                {/* Established is a claim about provenance; the question page holds where it was
                    established, so the row opens it before the answer is stated in the room. */}
                <div className="dd-known-q"><a className="dd-q-link" href={questionHref(slug, q.id)}>{q.q}</a></div>
                {q.note && <div className="dd-known-a">{q.note.replace(/^(Known|Indicated|Partly)\.\s*/i, '')}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {brief.byPillar.length > 0 && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="question">What to get through</Labelled></h2>
          <p className="org-sec-sub">
            Grouped by pillar, so a thread can be followed rather than jumped between.
            {perQuestion ? ` Roughly ${perQuestion} minutes each leaves room to open and close.` : ''}
          </p>
          {brief.byPillar.map((g) => {
            // ⚠ "KNOWN" MEANS NEVER ASKED AGAIN, AND THAT IS RIGHT UNTIL IT DRIFTS. A question
            // carried in as established, which an account has since contradicted or which turns out
            // to rest on one uncorroborated voice, is exactly the one worth raising in the room. It
            // was filtered out of the run sheet on its rating alone, so the only questions that
            // could never come back were the ones the record already knew were shaky.
            const ask = g.questions.filter((q) => q.certainty !== 'known' || certaintyDrift(q, findings));
            if (!ask.length) return null;
            return (
              <div key={g.pillar} className="dd-runblock">
                <h3 className="dd-runblock-h">
                  {g.pillar}<span className="dd-runblock-g">{g.group}</span>
                  <span className="dd-runblock-n">{ask.length}</span>
                </h3>
                <ol className="dd-run">
                  {ask.map((q) => (
                    <li key={q.id} className={`dd-run-q dd-q-${q.certainty}`}>
                      <div className="dd-run-t">
                        <a className="dd-q-link" href={questionHref(slug, q.id)}>{q.q}</a>
                      </div>
                      <div className="dd-run-s">
                        <Chip tone={`cert-${q.certainty}`}>{CERTAINTY[q.certainty].label}</Chip>
                        {/* Internal: this is our own rating disagreeing with our own findings, and
                            it is a prompt to the practitioner running the session, not something a
                            client attending needs to read about our record-keeping. */}
                        {staff && (() => {
                          const d = certaintyDrift(q, findings);
                          return d ? <span className="dd-q-note"><strong>Worth raising:</strong> {d.why}</span> : null;
                        })()}
                        {q.note && <span className="dd-q-note">{q.note.replace(/^(Known|Indicated|Partly)\.\s*/i, '')}</span>}
                        {q.certainty === 'indicated' && !q.note && (
                          <span className="dd-q-note">Believed, not evidenced. Validate it.</span>
                        )}
                      </div>
                      <Answers questionId={q.id} label={q.q} sessionId={session.id}
                        slug={slug} sessions={plan.SESSIONS || []}
                        findings={findings} staff={staff} busy={busy}
                        onRecord={onRecord} onDrop={onDropFinding} canAuthor={canAuthor} />
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </section>
      )}

      {session.materials?.length > 0 && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="evidence">Bring with you</Labelled></h2>
          <ul className="dd-list dd-list-speak">{session.materials.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </section>
      )}

      {brief.processes.length > 0 && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="process">The processes this touches</Labelled></h2>
          <p className="org-sec-sub">Context for the room, so an answer can be placed as it arrives.</p>
          <ul className="dd-cli">
            {brief.processes.map((pr) => (
              <li key={pr.id} className="dd-cli-row">
                <div className="dd-cli-main">
                  <h3><a className="dd-q-link" href={itemHref(slug, 'process', pr.id)}>{pr.name}</a></h3>
                  <p>{pr.howToday}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sources.length > 0 && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="source">What to ask them for</Labelled></h2>
          <p className="org-sec-sub">Sources in their area. Asking in the room beats an email afterwards.</p>
          <ul className="dd-cli">
            {sources.map((r) => (
              <li key={r.id} className="dd-cli-row">
                <div className="dd-cli-main">
                  {/* The source page holds the owner and what already cites it; the row here
                      holds only what it gives and how to get at it. */}
                  <h3><a className="dd-q-link" href={itemHref(slug, 'source', r.id)}>{r.name}</a> <Chip tone="pillar">{r.sourceType}</Chip></h3>
                  {r.gives && <p>{r.gives}</p>}
                  {r.access && <p className="dd-src-access">Access: {r.access}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
