// The workflow board: what the client sells, and how each one is delivered.
//
// One merged diagram of every process asserted that a mystery shopping job and a tracking study run
// the same way. They do not, so the picture is now one workflow per service offering, chosen first.
//
// Two geometries, and the difference between them is a claim about the record:
//   a ROW with arrows  only when the recorded handoffs order every member into one path
//   a SET with no lines when they do not, with the absence said out loud
// Nothing is laid out by the order an offering happens to list its processes in. That list states
// membership; its order is an artefact of how it was read, and drawing it as a sequence would put a
// claim in the picture that nobody in the business ever made.
//
// HTML nodes, not SVG text: SVG cannot wrap and has no text-overflow, so the old map truncated by
// counting characters and long names crossed their own borders. A node here is a real link with a
// real focus ring, and it wraps.
import React, { useMemo, useState } from 'react';
import { Icon, Labelled } from './DeepDiveIcons.jsx';
import More from './More.jsx';
import ProcessCanvas from './ProcessCanvas.jsx';
import { itemHref } from '../lib/deepdive-route.mjs';
import { STATUS, stateOf } from './deepdive-state.mjs';
import {
  processesForOffering, chainOf, handoffsWithin, unnamedProcesses, driftOf, defaultOffering,
} from './deepdive-board.mjs';

const STATE_WORD = {
  live: 'Live', attempted: 'Attempted', stopped: 'Stopped', planned: 'Planned',
};

/** What the rail can prove, in words. Never a percentage and never a progress bar: a segmented run
 *  read left to right is a sequence claim, at a size with no room for its own disclaimer. */
function railLine(members, handoffs, offering) {
  if (!members.length) {
    return offering.state === 'live'
      ? 'No process recorded'
      : `${STATE_WORD[offering.state] || offering.state}, nothing recorded`;
  }
  const p = `${members.length} process${members.length === 1 ? '' : 'es'} recorded`;
  return handoffs
    ? `${p}, ${handoffs} handoff${handoffs === 1 ? '' : 's'}`
    : `${p}, no handoff`;
}

function Node({ p, slug, staff, map, wiring, armed, onPick, onEdit, showNum, people }) {
  const st = stateOf(map, p.id);
  const steps = p.steps || [];
  const shown = steps.slice(0, 4);
  // ⚠ Who runs it is a name somebody typed AND a link the record can follow, together (the rule on
  // InlinePeople: both, never one instead of the other). This card read only the text, so a process
  // linked the right way with the text left empty said "Who runs it is not recorded": a false gap,
  // on the card a reader checks before an interview, with the person one id away. The text stays
  // verbatim; the linked person is an anchor beside it, or plain in wiring mode, where the whole
  // body sits inside a <button> and an anchor inside a button is invalid.
  const runner = p.whoRunsId ? people?.get(p.whoRunsId) : null;
  const who = (p.whoRuns || '').trim();
  // Only an exact repeat is dropped ("Ama Owusu · Ama Owusu"). A description that merely mentions
  // the person carries information the link does not, and stays.
  const whoText = runner && who.toLowerCase() === runner.name.trim().toLowerCase() ? '' : who;
  const body = (
    <>
      <div className="dd-node-top">
        {showNum && <span className="dd-node-n">{p.num}</span>}
        <span className={`dd-node-st dd-nst-${st.status}`} title={STATUS[st.status].label} aria-hidden="true" />
      </div>
      <h3 className="dd-node-t">{p.name}</h3>
      <p className="dd-node-who">
        {!whoText && !runner ? 'Who runs it is not recorded' : (
          <>
            {whoText}
            {whoText && runner ? ' · ' : ''}
            {runner && (wiring
              ? runner.name
              : (
                <a className="dd-either-a dd-node-who-a"
                  href={itemHref(slug, 'person', runner.id)}>{runner.name}</a>
              ))}
          </>
        )}
      </p>
      {steps.length === 0 ? (
        <p className="dd-node-empty">What happens inside has not been recorded</p>
      ) : (
        <ol className="dd-ladder">
          {shown.map((s) => {
            // ⚠ The encouraged linking path (the step editor) clears `who` and sets `whoId`, so a
            // card reading only s.who ERASED the owner of every step linked the right way. The id
            // resolves to the person, and the name links to their page. Not in wiring mode: the
            // whole body sits inside a <button> there, and an anchor inside a button is invalid.
            const person = s.whoId ? people?.get(s.whoId) : null;
            const ownerName = person ? person.name : s.who;
            return (
              <li key={s.n}>
                <span className="dd-ladder-n">{s.n}</span>
                <span className="dd-ladder-t">{s.name}{ownerName ? (
                  <em> · {person && !wiring
                    ? (
                      <a className="dd-either-a dd-ladder-who"
                        href={itemHref(slug, 'person', person.id)}>{person.name}</a>
                    )
                    : ownerName}</em>
                ) : null}</span>
              </li>
            );
          })}
          {steps.length > shown.length && (
            <li className="dd-ladder-more"><span className="dd-ladder-n" aria-hidden="true" />
              <span className="dd-ladder-t">and {steps.length - shown.length} more inside</span></li>
          )}
        </ol>
      )}
    </>
  );

  if (wiring) {
    return (
      <button type="button" className={`dd-node dd-node-btn${armed ? ' is-armed' : ''}`}
        onClick={() => onPick(p)} aria-pressed={armed}>{body}</button>
    );
  }
  return (
    <div className="dd-node">
      <a className="dd-node-link" href={itemHref(slug, 'process', p.id)}>
        <span className="gs-sr-only">Open {p.name}</span>
      </a>
      {body}
      {staff && onEdit && (
        <button type="button" className="dd-node-edit" onClick={() => onEdit(p)}
          aria-label={`Edit ${p.name}`}>{Icon.edit({ size: 14 })}</button>
      )}
    </div>
  );
}

/** One disagreement between the two sides of the offering link, each party a way in. The process
 *  opens its page. The offering has no page, so a button fronts its lane on the rail above rather
 *  than an href pretending there is somewhere to go (the same move the rail's arrow keys make). A
 *  ref that resolves to nothing is only named, because there is nothing behind it to open. The
 *  shapes are driftOf's (deepdive-board.mjs). */
function DriftLine({ d, slug, onFront }) {
  const proc = d.process ? (
    <a className="dd-either-a" href={itemHref(slug, 'process', d.process.id)}>
      {d.process.num} {d.process.name}
    </a>
  ) : null;
  const off = d.offering ? (onFront ? (
    <button type="button" className="dd-tie-go" onClick={() => onFront(d.offering)}>{d.offering.name}</button>
  ) : d.offering.name) : null;
  if (proc && off) return <>{proc} says it serves {off}, which does not name it back</>;
  if (proc) return <>{proc} names {d.ref}, an offering this record does not hold</>;
  return <>{off} names {d.ref}, a process this record does not hold</>;
}

export default function OfferingBoard({
  plan, slug, staff, canAuthor, busy, map, selectedId, onSelect, onEdit, onEditOffering, onConnect,
  onAddProcess, onMove, onTidy,
}) {
  const offerings = plan.OFFERINGS || [];

  // Controlled from the tab, so the cards listed underneath the board always describe the workflow
  // the board is showing. Two independent selections was how the picture and the list drifted.
  const selected = offerings.find((o) => o.id === selectedId) || defaultOffering(plan);

  const rail = useMemo(() => offerings.map((o) => {
    const members = processesForOffering(plan, o);
    return { o, members, handoffs: handoffsWithin(members).length };
  }), [plan, offerings]);

  const outside = useMemo(() => unnamedProcesses(plan), [plan]);
  const drift = useMemo(() => (staff ? driftOf(plan) : []), [plan, staff]);
  // So a step's whoId resolves to a person the card can name and link.
  const peopleById = useMemo(() => new Map((plan.PEOPLE || []).map((n) => [n.id, n])), [plan]);

  if (!offerings.length) return null;

  const members = selected ? processesForOffering(plan, selected) : [];
  const chain = chainOf(members);
  const loose = handoffsWithin(members);

  return (
    <>
      <section className="dd-board">
        <div className="dd-board-head">
          <h2><Labelled icon="process">How each service is delivered</Labelled></h2>
          <p className="dd-board-lead">
            The client sells {offerings.length} thing{offerings.length === 1 ? '' : 's'}. Pick one to see the workflow behind it, drawn
            only from handoffs the record actually holds. Click a box to open it and map what happens
            inside.
          </p>
        </div>

        {/* ⚠ THIS CLAIMED TO BE A TABLIST AND DELIVERED NONE OF IT: no aria-controls, no tabpanel,
            no roving tabindex, no arrow keys. An INCOMPLETE ARIA PATTERN IS WORSE THAN NONE — a
            screen reader announces "tab, 2 of 6" and then the arrow keys the announcement promises
            do nothing. Completed here rather than dropped, mirroring the record's own tab bar, which
            has had the full pattern all along forty lines away. */}
        <div className="dd-rail" role="tablist" aria-label="Service offerings">
          {rail.map(({ o, members: ms, handoffs }, i) => {
            const on = selected && o.id === selected.id;
            return (
              <button key={o.id} type="button" role="tab" aria-selected={on}
                id={`dd-rail-${o.id}`} aria-controls="dd-rail-stage"
                tabIndex={on ? 0 : -1}
                className={`dd-railcard${on ? ' is-on' : ''}${o.state !== 'live' ? ' is-ghost' : ''}`}
                onKeyDown={(e) => {
                  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
                  e.preventDefault();
                  const last = rail.length - 1;
                  const k = e.key === 'ArrowRight' ? (i === last ? 0 : i + 1)
                    : e.key === 'ArrowLeft' ? (i === 0 ? last : i - 1)
                    : e.key === 'Home' ? 0 : last;
                  const next = rail[k].o;
                  onSelect && onSelect(next.id);
                  const el = document.getElementById(`dd-rail-${next.id}`); if (el) el.focus();
                }}
                onClick={() => { onSelect && onSelect(o.id); }}>
                <span className="dd-rail-ref">{o.ref}</span>
                <span className="dd-rail-name">{o.name}</span>
                {o.alias && <span className="dd-rail-alias">they call it {o.alias}</span>}
                <span className="dd-rail-cov">
                  <span className="dd-pips" aria-hidden="true">
                    {ms.length
                      ? ms.map((p) => <i key={p.id} className="dd-pip is-rec" />)
                      : <i className={`dd-pip ${o.state === 'live' ? 'is-open' : 'is-none'}`} />}
                  </span>
                  {railLine(ms, handoffs, o)}
                </span>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="dd-stage" key={selected.id}
            id="dd-rail-stage" role="tabpanel" aria-labelledby={`dd-rail-${selected.id}`}>
            <div className="dd-stage-head">
              <div>
                <h3>{selected.name}
                  {/* ⚠ AN OFFERING WAS FROZEN AT CREATION: an Add path, and no edit and no remove
                      anywhere. Its name, what it is, who buys it and which processes deliver it
                      could not be corrected once typed. */}
                  {staff && onEditOffering && (
                    <button type="button" className="dd-edit" disabled={busy || !canAuthor?.can}
                      title={canAuthor?.can ? undefined : canAuthor?.why}
                      aria-label={`Edit the offering: ${selected.name}`}
                      onClick={() => onEditOffering(selected)}>Edit</button>
                  )}
                </h3>
                {/* Up to ~330 characters of what-it-is, plus who buys it, ran as one paragraph in
                    the board's head. The description folds; the buyer stands on its own line. */}
                {selected.what && (
                  <More lines={2}><p className="dd-stage-sub">{selected.what}</p></More>
                )}
                {selected.who && (
                  <p className="dd-stage-sub"><span className="dd-stage-who">Bought by {selected.who}</span></p>
                )}
              </div>
              {/* ⚠ A SECOND "Record a handoff" BUTTON USED TO SIT HERE, directly above the canvas's
                  own. It toggled `wiring`, which fed `nodeProps`, which was never spread anywhere:
                  the only <Node> on this screen is hard-coded wiring={false}. So the two buttons
                  were stacked, identical, and this one did nothing but change a hint. The canvas
                  owns wiring; one control, where the boxes it wires actually are. */}
            </div>

            {members.length === 0 ? (
              <div className="dd-stage-empty">
                <p className="dd-stage-emptyh">
                  {selected.state === 'live'
                    ? 'Nobody has walked this one yet.'
                    : `${STATE_WORD[selected.state] || selected.state}, and no process was recorded.`}
                </p>
                {selected.note && <More lines={2}><p>{selected.note}</p></More>}
                <p className="dd-stage-emptyw">
                  That is the finding, not a gap in the page: the record holds what this service is
                  and who buys it, and nothing about how it is delivered.
                </p>
                {staff && onAddProcess && (
                  <button type="button" className="gs-btn primary sm" disabled={!canAuthor?.can}
                    title={canAuthor?.can ? undefined : canAuthor?.why}
                    onClick={() => onAddProcess(selected)}>Walk this offering</button>
                )}
              </div>
            ) : (
              <>
                {/* ⚠ The add lands INSIDE the offering being viewed. Adding a process from a
                    workflow and having it appear unattached to that workflow is the kind of small
                    dishonesty that makes somebody stop trusting a tool. */}
                <ProcessCanvas processes={members} slug={slug} staff={staff} canAuthor={canAuthor}
                  busy={busy} map={map} onMove={onMove} onConnect={onConnect} onTidy={onTidy}
                  onAddProcess={onAddProcess ? () => onAddProcess(selected) : null}
                  people={peopleById} />
                {!chain && (
                  <p className="dd-set-note">
                    {loose.length === 0 ? (
                      <>{members.length} processes deliver this, and nothing records which hands to
                      which, so there are no arrows between them. Arranging the boxes does not change
                      that: the order is still not something the record knows.</>
                    ) : (
                      <>These processes do not form one chain. The handoffs that are recorded:{' '}
                      {loose.map((e, i) => (
                        <span key={i}>{i > 0 && '; '}{e.from.name} to {e.to.name}</span>
                      ))}.</>
                    )}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </section>

      {outside.length > 0 && (
        <section className="dd-around">
          <div className="dd-board-head">
            <h2><Labelled icon="process">Around the work</Labelled></h2>
            <p className="dd-board-lead">
              No offering names these, so they are not a step in anything. They are how the business
              wins work, gets paid and staffs itself, and every offering leans on them.
            </p>
          </div>
          <div className="dd-set dd-set-plain">
            {outside.map((p) => (
              <Node key={p.id} p={p} slug={slug} staff={staff} map={map} wiring={false}
                armed={false} onPick={() => {}} onEdit={onEdit} showNum={false}
                people={peopleById} />
            ))}
          </div>
          {/* ⚠ This used to print three of the disagreements as plain text and ", and more" for the
              rest, so a record with seven held four nobody could see anywhere in the app, and the
              three it did show named a process and an offering with no way into either. Every one
              is listed now, folded past the first few lines, and each party is a way in. */}
          {staff && drift.length > 0 && (
            <div className="dd-drift">
              <p className="dd-drift-p" role="status">
                {drift.length} disagreement{drift.length === 1 ? '' : 's'} between the two sides of the
                offering link:
              </p>
              <More lines={6} label={`Show all ${drift.length}`}>
                <ul className="dd-drift-list">
                  {drift.map((d, i) => (
                    <li key={i}>
                      <DriftLine d={d} slug={slug} onFront={onSelect ? (o) => {
                        onSelect(o.id);
                        // Land the reader on the lane, not just repaint it: the rail sits a whole
                        // board above this line. Focusing the tab scrolls it into view.
                        const el = document.getElementById(`dd-rail-${o.id}`); if (el) el.focus();
                      } : null} />
                    </li>
                  ))}
                </ul>
              </More>
            </div>
          )}
        </section>
      )}
    </>
  );
}
