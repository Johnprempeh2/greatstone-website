// The session, being run.
//
// Everything else in the portal is for BEFORE and AFTER a conversation; this is the surface for
// DURING it (John, 10 Sep: "an interface for the practitioner to use in the live meeting"). One
// question at a time, what we already hold beside it so nothing gets re-asked, an answer box that
// writes straight into the record, and the things this session must not raise kept in view.
//
// Write semantics, deliberately:
//   - an answer APPENDS to the question's "what is established" with the session ref and date in
//     front, so the words land attributed rather than replacing what an earlier session got;
//   - certainty is saved IN THE SAME EDIT (the schema refuses a certainty above unknown with an
//     empty note, so the pair travels together);
//   - the answer is ALSO minted as a finding carrying the session id, the same shape the session
//     page's Answers box writes, so a live capture gets the provenance card and reaches the
//     validation queue instead of surviving only as note text;
//   - a question's identity is its pillar and wording, so none of this re-mints ids;
//   - the state map marks the question examined, and the History names the hand as always.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CERTAINTY } from '../data/deepdive.mjs';
import { findItem, CERTAINTY_IDS, PILLARS, PILLAR_GROUP } from '../data/deepdive-schema.mjs';
import { questionHref } from '../lib/deepdive-route.mjs';
import { Icon, Labelled } from './DeepDiveIcons.jsx';

const Chip = ({ tone, children }) => <span className={`dd-chip dd-${tone}`}>{children}</span>;

/** Minutes and seconds since the button was pressed, against the session's budget. */
function RunClock({ startedAt, minutes }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    // In a browser this is a number; under node (the render test) it is a Timeout that would
    // keep the event loop alive. unref where it exists, so a mounted clock can never pin a host.
    if (t && typeof t === 'object' && typeof t.unref === 'function') t.unref();
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  const over = minutes && s > minutes * 60;
  return (
    <span className={`dd-run-clock${over ? ' is-over' : ''}`}>
      {Icon.time({ size: 14 })} {mm}:{ss}{minutes ? ` of ${minutes}:00` : ''}
    </span>
  );
}

export default function SessionRun({
  slug, session, plan, map, busy, canAuthor, onSaveRecord, onSaveField, onStatus, onAddQuestion, onRecord, onDone,
}) {
  const can = canAuthor?.can === true;
  const startedAt = useRef(Date.now()).current;
  const today = new Date().toISOString().slice(0, 10);

  // The queue is the session's own covers, resolved to live questions. An id the record no longer
  // holds is shown as such rather than silently dropped: a queue that shrinks by itself is how a
  // question gets forgotten in the one meeting that was meant to answer it.
  const queue = useMemo(() => (session.covers || []).map((id) => {
    const f = findItem(plan, id);
    return f && f.kind === 'question' ? { id, q: f.item } : { id, q: null };
  }), [plan, session.covers]);

  const [at, setAt] = useState(0);
  const [answer, setAnswer] = useState('');
  const [certainty, setCertainty] = useState(null);
  const [skipped, setSkipped] = useState(() => new Set());
  const [asides, setAsides] = useState([]);   // what came up that no queued question owns
  const [aside, setAside] = useState('');
  const [err, setErr] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newQ, setNewQ] = useState({ pillar: PILLARS[0], q: '' });
  const [jumpTo, setJumpTo] = useState(null);
  const [addErr, setAddErr] = useState(null);   // the add form's own channel: one state in two render sites shows every error twice

  const current = queue[at] || null;
  const answered = (id) => (map && map[id] && map[id].status === 'done');
  const doneCount = queue.filter((x) => answered(x.id)).length;

  // moving to another question resets the drafting state to that question's reality
  const go = (i) => {
    setAt(i); setErr(null); setAnswer('');
    const q = queue[i]?.q;
    setCertainty(q ? (q.certainty === 'unknown' ? 'indicated' : q.certainty) : null);
  };
  useEffect(() => { go(0); /* eslint-disable-next-line */ }, [session.id]);
  useEffect(() => {
    if (!jumpTo) return;
    const i = queue.findIndex((x) => x.id === jumpTo);
    if (i >= 0) { go(i); setJumpTo(null); }
  /* eslint-disable-next-line */ }, [jumpTo, queue]);

  const saveAnswer = async () => {
    if (!current?.q || !answer.trim()) return;
    setErr(null);
    const q = current.q;
    const line = `${session.ref || 'In session'}, ${today}: ${answer.trim()}`;
    // ⚠ NOT AGAIN IF IT IS ALREADY THERE. Three writes follow and only the first one changes the
    // note. If a later one fails, the note is already saved, the answer stays in the box and the
    // practitioner presses save again, which is the right instinct; by then the plan has refreshed
    // and `q.note` CONTAINS this line, so appending would write the same words twice into the one
    // record this whole screen exists to fill. In a live sitting nobody is going to notice.
    const note = (q.note || '').includes(line) ? q.note : (q.note ? `${q.note}\n\n${line}` : line);
    try {
      await onSaveRecord(q, 'question', { note, certainty: certainty || q.certainty });
      // The same answer, minted as a finding carrying this session's id: the note line above is
      // what the question page reads, but only a finding gives the answer a provenance card that
      // links back to this sitting and reaches the validation queue. Same shape as the session
      // page's after-the-fact Answers box, so a live capture and a later one are one record.
      // ⚠ PAST THIS POINT THE ANSWER IS ON THE RECORD, so an error must not say it was lost. The
      // add-a-question path a few lines down already draws this distinction ("the question was
      // created but could not be tied"); answering one, which is what this screen is FOR, said a
      // flat "It could not be saved" for a failure that happened after the words were safe.
      try {
        if (onRecord) await onRecord({ questionId: q.id, sessionId: session.id, text: answer.trim(), label: q.q });
        await onStatus(q.id, { status: 'done' }, q.q);
      } catch (e2) {
        throw new Error(`The answer is saved on the question, but this sitting could not finish recording it: ${e2?.message || e2}`);
      }
      const next = queue.findIndex((x, i) => i > at && !answered(x.id) && !skipped.has(x.id));
      go(next >= 0 ? next : Math.min(at + 1, queue.length - 1));
    } catch (e) { setErr(e?.message || 'It could not be saved.'); }
  };

  // A question raised IN the room joins the queue in the room (John, 10 Sep). Two writes, in
  // order: mint the question (route 'session', because that is literally how it will be answered,
  // inheriting the processes this sitting walks), then tie it into covers. If the second write
  // fails the question still EXISTS on the record, so the error says exactly that rather than
  // implying the whole thing was lost.
  const addQuestion = async () => {
    if (!newQ.q.trim()) return;
    setAddErr(null);
    try {
      const fields = { pillar: newQ.pillar, q: newQ.q.trim(), certainty: 'unknown', route: 'session' };
      if ((session.processes || []).length) fields.processes = session.processes;
      const newId = await onAddQuestion(fields);
      if (!newId) throw new Error('The question was not created.');
      try {
        await onSaveRecord(session, 'session', { covers: [...(session.covers || []), newId] });
      } catch (e2) {
        throw new Error(`The question was created but could not be tied to this session: ${e2?.message || e2}`);
      }
      setNewQ({ pillar: newQ.pillar, q: '' });
      setAdding(false);
      setJumpTo(newId);
    } catch (e) { setAddErr(e?.message || 'It could not be added.'); }
  };

  const keepAside = () => {
    if (!aside.trim()) return;
    setAsides((xs) => [...xs, aside.trim()]);
    setAside('');
  };

  const end = async () => {
    setErr(null);
    try {
      if (asides.length) {
        const stamp = `${session.ref || 'Session'}, ${today}:`;
        const add = asides.map((x) => `${stamp} ${x}`).join('\n');
        await onSaveField(session, { output: session.output ? `${session.output}\n${add}` : add });
        // ⚠ CLEARED THE MOMENT THEY ARE SAVED, not when the whole close succeeds. If the status
        // write below fails and End is pressed again, an uncleared list would append the same
        // lines a second time: the classic double-write on retry, into a client record.
        setAsides([]);
      }
      await onStatus(session.id, { status: 'done' }, session.name || session.person);
      onDone();
    } catch (e) { setErr(e?.message || 'It could not be closed.'); }
  };

  return (
    <div className="dd-live" role="region" aria-label="Session in progress">
      <header className="dd-run-bar">
        <div className="dd-run-title">
          <span className="dd-run-live" aria-hidden="true" />
          <b>{session.name || session.person}</b>
          <span className="dd-run-who">{session.person}</span>
        </div>
        <div className="dd-run-tools">
          <RunClock startedAt={startedAt} minutes={session.minutes} />
          <span className="dd-run-n">{doneCount} of {queue.length} answered</span>
          <button type="button" className="gs-btn primary sm" onClick={end} disabled={busy}>
            End session
          </button>
        </div>
      </header>

      {session.opening && (
        <p className="dd-run-open"><Labelled icon="session">How to open</Labelled> {session.opening}</p>
      )}
      {(session.notHere || []).length > 0 && (
        <p className="dd-run-nothere">
          {/* Same colon as the banner below it: a label run straight into its items is a run-on
              either way, and this one only got away with it because its items are noun phrases. */}
          <Labelled icon="warn">Not raised here:</Labelled> {session.notHere.join(' · ')}
        </p>
      )}

      {(() => {
        const ask = (plan.EVIDENCE || []).filter((e) => (e.sessionIds || []).includes(session.id) && e.state !== 'held' && e.state !== 'ours');
        const test = (plan.HYPOTHESES || []).filter((h) => (h.sessionIds || []).includes(session.id) && h.verdict === 'open');
        if (!ask.length && !test.length) return null;
        return (
          <p className="dd-run-open">
            {/* ⚠ THE LABEL RAN STRAIGHT INTO THE ITEMS. With a hypothesis and no outstanding
                document this read "Also here test: Re-keying causes the delay", because the label
                is a heading and the items are instructions, joined by a space. The neighbouring
                "Not raised here" banner reads correctly only because ITS items are noun phrases.
                A colon after the label, and the claim quoted so the instruction and the sentence
                being tested do not run together. */}
            <Labelled icon="evidence">Also here:</Labelled>{' '}
            {ask.map((e) => `ask for ${e.item}`)
              .concat(test.map((h) => `test \u201c${h.claim}\u201d`)).join(' · ')}
          </p>
        );
      })()}
      <div className="dd-run-cols">
        {/* ⚠ NOT .dd-run-q, WHICH BELONGS TO SessionPage's question CARD. This is the queue
            container, and borrowing that class gave it the card's 46px left padding and, worse,
            its ::before counter: a stray digit sat at the top of the live session queue. */}
        <nav className="dd-run-queue" aria-label="The questions this session carries">
          {queue.map((x, i) => (
            <button key={x.id} type="button"
              className={`dd-run-qb${i === at ? ' is-at' : ''}${answered(x.id) ? ' is-done' : ''}${skipped.has(x.id) ? ' is-skip' : ''}`}
              onClick={() => go(i)}>
              <span className="dd-run-qn">{String(i + 1).padStart(2, '0')}</span>
              <span className="dd-run-qt">{x.q ? x.q.q : 'No longer in the record'}</span>
              {answered(x.id) && Icon.validated({ size: 13 })}
            </button>
          ))}
          {queue.length === 0 && (
            <p className="dd-run-empty">No questions are tied to this session yet. Tie them on the
              session page, add one below, or capture what comes up on the right.</p>
          )}
          {can && !adding && (
            <button type="button" className="dd-run-addq" disabled={busy} onClick={() => setAdding(true)}>
              {Icon.add({ size: 13 })} Add a question
            </button>
          )}
          {can && adding && (
            <div className="dd-run-addf">
              <label>Pillar
                <select value={newQ.pillar} disabled={busy}
                  onChange={(e) => setNewQ((x) => ({ ...x, pillar: e.target.value }))}>
                  {PILLARS.map((pl) => <option key={pl} value={pl}>{pl} ({PILLAR_GROUP[pl]})</option>)}
                </select>
              </label>
              <textarea rows={2} value={newQ.q} disabled={busy} autoFocus
                onChange={(e) => setNewQ((x) => ({ ...x, q: e.target.value }))}
                placeholder="The question, as it came up" />
              <div className="dd-run-addf-a">
                <button type="button" className="gs-btn primary sm" onClick={addQuestion}
                  disabled={busy || !newQ.q.trim()}>Add and ask it</button>
                <button type="button" className="gs-btn ghost sm" disabled={busy}
                  onClick={() => { setAdding(false); setAddErr(null); }}>Cancel</button>
              </div>
              {addErr && <p className="dd-warn" role="alert">{addErr}</p>}
            </div>
          )}
        </nav>

        <main className="dd-run-main">
          {queue.length > 0 && doneCount === queue.length && (
            <div className="dd-run-done">
              <h2><Labelled icon="validated">Everything this session carried is answered</Labelled></h2>
              <p>{queue.length} of {queue.length} captured on the record. Anything still in the room
                goes in below, then end the session.</p>
              <button type="button" className="gs-btn primary sm" onClick={end} disabled={busy}>
                End session
              </button>
            </div>
          )}
          {current?.q ? (
            <>
              <div className="dd-run-meta">
                <Chip tone="pillar">{current.q.pillar}</Chip>
                <Chip tone={`cert-${current.q.certainty}`}>{CERTAINTY[current.q.certainty].label}</Chip>
                {/* The way into the question's own record (findings, evidence, history) from the
                    room, when an answer contradicts what we hold. A NEW TAB on purpose: this
                    surface is state, not a route, so navigating in place would unmount it and
                    lose the clock, the skips and any unsaved aside. The ref is the handle when
                    the question has one; the wording below stays plain text so a hand reaching
                    for the answer box cannot click away mid-capture. */}
                {slug ? (
                  <a className={`dd-q-link dd-run-rec${current.q.ref ? '' : ' is-plain'}`}
                    href={questionHref(slug, current.id)} target="_blank" rel="noopener noreferrer"
                    title="Open this question's record in a new tab">
                    {current.q.ref || 'Open record'}
                    {Icon.link({ size: 12 })}
                    <span className="gs-sr-only">, opens the question's record in a new tab</span>
                  </a>
                ) : (current.q.ref && <span className="dd-run-ref">{current.q.ref}</span>)}
              </div>
              <h2 className="dd-run-ask">{current.q.q}</h2>
              {current.q.why && <p className="dd-run-why">{current.q.why}</p>}

              {current.q.note && (
                <div className="dd-run-held">
                  <h3><Labelled icon="validated">Already held, so build on it rather than re-ask</Labelled></h3>
                  <p>{current.q.note}</p>
                </div>
              )}

              {can ? (
                <div className="dd-run-cap">
                  <label className="dd-run-lab" htmlFor="dd-run-ans">What they said</label>
                  <textarea id="dd-run-ans" rows={5} value={answer} disabled={busy}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveAnswer(); }}
                    placeholder="Their words, as close as you can get them." />
                  <div className="dd-run-actions">
                    <label className="dd-run-cert">This makes it
                      <select value={certainty || current.q.certainty} disabled={busy}
                        onChange={(e) => setCertainty(e.target.value)}>
                        {CERTAINTY_IDS.map((c) => (
                          <option key={c} value={c}>{CERTAINTY[c].label}</option>
                        ))}
                      </select>
                    </label>
                    <button type="button" className="gs-btn primary sm" onClick={saveAnswer}
                      disabled={busy || !answer.trim()}
                      title="Cmd+Enter saves without leaving the keyboard">
                      Save answer
                    </button>
                    <button type="button" className="gs-btn ghost sm" disabled={busy}
                      onClick={() => { setSkipped((s) => new Set(s).add(current.id)); go(Math.min(at + 1, queue.length - 1)); }}>
                      Skip for now
                    </button>
                  </div>
                  {err && <p className="dd-warn" role="alert">{err}</p>}
                </div>
              ) : (
                <p className="dd-run-empty">You can follow this session, and answers are captured by
                  somebody who can write to the record.</p>
              )}
            </>
          ) : (
            <p className="dd-run-empty">Nothing selected.</p>
          )}

          <div className="dd-run-aside">
            <h3><Labelled icon="add">Something else came up</Labelled></h3>
            <p className="dd-run-aside-sub">Kept with this session as what came out of it. If it
              needs asking rather than keeping, add it as a question on the left.</p>
            <div className="dd-run-aside-row">
              <input value={aside} disabled={busy || !can} onChange={(e) => setAside(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') keepAside(); }}
                placeholder="One thing, in their words" />
              <button type="button" className="gs-btn ghost sm" onClick={keepAside}
                disabled={busy || !can || !aside.trim()}>Keep</button>
            </div>
            {asides.length > 0 && (
              <ul className="dd-run-aside-l">
                {asides.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
