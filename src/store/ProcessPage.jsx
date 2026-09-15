// One process, opened.
//
// A process is one box on a chain and a dozen actions in the room, and the difference is where the
// work actually goes wrong. This is where the inside gets written down: who does each step and what
// they do it in, because "a person carries a file from one tool to another" is a finding that stays
// invisible until the handoffs inside a process are recorded.
//
// The number is shown ONLY where it means something. A process that sits in a workflow has a
// position; one that does not is a function, not a step, and numbering it was noise.
import React, { useMemo, useState } from 'react';
import { STATUS, stateOf, historyOf } from './deepdive-state.mjs';
import { deepDiveHref, questionHref, evidenceHref, sessionHref, itemHref } from '../lib/deepdive-route.mjs';
import { processHub } from './deepdive-org.mjs';
import InlineText from './InlineText.jsx';
import InlineLinks from './InlineLinks.jsx';
import InlinePeople from './InlinePeople.jsx';
import BuildStatePopover from './BuildStatePopover.jsx';
import { BUILD_STATE_WORD } from '../data/deepdive-schema.mjs';

// Plain words for the states. "proposed" is the default and the honest one: a GITA proposes, it
// does not commit anybody to anything.
import { Icon, Labelled } from './DeepDiveIcons.jsx';
import RecordSearch from './RecordSearch.jsx';
import ChangeLog from './ChangeLog.jsx';
import Attachments from './Attachments.jsx';

const Chip = ({ tone, children, title }) => (
  <span className={`dd-chip dd-${tone}`} title={title}>{children}</span>
);
const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'no date recorded'
    : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// Mapping what happens inside a process.
//
// This was a bare textarea with a `::` separator, which is a machine convention leaking into the
// screen: it read as a config file, the placeholder had to explain its own syntax, and nothing
// about it suggested you were describing a sequence. A step has three parts and an order, so the
// editor has three fields and an order.
//
// The paste path is kept, because a practitioner writing up a session has a list already and making
// them click "add step" eleven times is how the inside of a process stays unmapped. It is a mode,
// not the default, and it converts into rows the moment it is used.
// ⚠ `detail` BELONGS HERE. The schema stores it (stepList), the page renders it, and this editor
// used to build rows of {name, who, tool} only, so every save of the steps silently DESTROYED the
// detail on every step. No error, no warning: the text was on screen before you opened the editor
// and gone after you saved it. It is also the natural place to write the thing a practitioner most
// wants to add about a step, which is what actually happens inside it.
const EMPTY = { name: '', who: '', whoId: null, tool: '', detail: '' };

function StepRow({ step, i, count, busy, people = [], onAddPerson, onChange, onMove, onRemove }) {
  return (
    <li className="dd-srow">
      <span className="dd-srow-n" aria-hidden="true">{i + 1}</span>
      <div className="dd-srow-f">
        <label className="dd-srow-main">
          <span className="gs-sr-only">Step {i + 1}, what happens</span>
          <input value={step.name} disabled={busy} placeholder="What happens"
            onChange={(e) => onChange(i, { ...step, name: e.target.value })} />
        </label>
        {/* ⚠ ONE CONTROL, NOT TWO. This was a free-text box AND a dropdown, and the text box only
            existed as an escape hatch for somebody who is not on the org chart. Being able to ADD a
            person from the dropdown removes the need for the hatch: everybody who does a step is a
            person the record can follow, which is the entire point of recording who does it.
            ⚠ Legacy typed text is NOT destroyed. A step written before this shows its words as the
            current selection, so an unlinked role stays visible and editable rather than silently
            reverting to "Not linked" on the next save. */}
        <label>
          <span className="gs-sr-only">Step {i + 1}, who does it</span>
          <select className="dd-srow-sel" value={step.whoId || (step.who ? '__legacy' : '')} disabled={busy}
            onChange={(e) => {
              if (e.target.value === '__new') { onAddPerson(i); return; }
              if (e.target.value === '__legacy') return;
              onChange(i, { ...step, whoId: e.target.value || null, who: '' });
            }}>
            <option value="">Who does it</option>
            {step.who && !step.whoId && (
              <option value="__legacy">{step.who} (typed, not linked)</option>
            )}
            {people.map((n) => (
              <option key={n.id} value={n.id}>{n.name}{n.role ? ` · ${n.role}` : ''}</option>
            ))}
            {onAddPerson && <option value="__new">+ Add someone new…</option>}
          </select>
        </label>
        <label>
          <span className="gs-sr-only">Step {i + 1}, what they do it in</span>
          <input value={step.tool} disabled={busy} placeholder="What they do it in"
            onChange={(e) => onChange(i, { ...step, tool: e.target.value })} />
        </label>
        {/* The room for what actually happens. A step name is a label; this is where the finding
            lives, and until now there was nowhere to type it. Full width, because it is prose. */}
        {/* ⚠ THIS TEXTAREA WAS UNSTYLED and sat among three styled inputs looking like a browser
            default that had escaped: monospace, one line tall, with a resize grabber. `rows={1}`
            also meant the field for the most important thing on the row was the smallest thing on
            it. It is prose, and it is now sized and styled like the rest of the row. */}
        <label className="dd-srow-main">
          <span className="gs-sr-only">Step {i + 1}, what actually happens</span>
          <textarea value={step.detail} disabled={busy} rows={2}
            placeholder="What actually happens here, in their words (optional)"
            onChange={(e) => onChange(i, { ...step, detail: e.target.value })} />
        </label>
      </div>
      {/* Buttons rather than dragging: a row full of text inputs makes a drag handle fight text
          selection, and these work from the keyboard without any extra machinery. */}
      <div className="dd-srow-tools">
        <button type="button" className="dd-srow-b" disabled={busy || i === 0}
          aria-label={`Move step ${i + 1} up`} onClick={() => onMove(i, -1)}>↑</button>
        <button type="button" className="dd-srow-b" disabled={busy || i === count - 1}
          aria-label={`Move step ${i + 1} down`} onClick={() => onMove(i, 1)}>↓</button>
        <button type="button" className="dd-srow-b is-drop" disabled={busy}
          aria-label={`Remove step ${i + 1}`} onClick={() => onRemove(i)}>×</button>
      </div>
    </li>
  );
}

function StepEditor({ steps, busy, people = [], onAddPerson, onSave, onCancel }) {
  const [rows, setRows] = useState(() => (steps?.length
    ? steps.map((s) => ({ name: s.name || '', who: s.who || '', whoId: s.whoId || null, tool: s.tool || '', detail: s.detail || '' }))
    : [{ ...EMPTY }]));
  const [paste, setPaste] = useState(null);   // null = the builder, a string = the paste box
  const [err, setErr] = useState(null);
  // ⚠ Which row asked for a new person, so the name lands on that step and not another one.
  const [naming, setNaming] = useState(null);
  const [newPerson, setNewPerson] = useState({ name: '', role: '' });
  const [adding, setAdding] = useState(false);

  const change = (i, next) => setRows((r) => r.map((x, j) => (j === i ? next : x)));
  const move = (i, by) => setRows((r) => {
    const to = i + by;
    if (to < 0 || to >= r.length) return r;
    const copy = [...r];
    [copy[i], copy[to]] = [copy[to], copy[i]];
    return copy;
  });
  const remove = (i) => setRows((r) => (r.length === 1 ? [{ ...EMPTY }] : r.filter((_, j) => j !== i)));
  const add = () => setRows((r) => [...r, { ...EMPTY }]);

  // A pasted list becomes rows, so everything after the paste is edited the same way as everything
  // else. The `::` separator still works here, and only here, for anybody who knows it.
  const takePaste = () => {
    const made = String(paste || '').split('\n')
      .map((line) => {
        const [name, who, tool, detail] = line.split('::').map((x) => x.trim());
        return { name: name || '', who: who || '', tool: tool || '', detail: detail || '' };
      })
      .filter((x) => x.name);
    setRows(made.length ? made : [{ ...EMPTY }]);
    setPaste(null);
  };

  const filled = rows.filter((r) => r.name.trim());

  if (paste !== null) {
    return (
      <div className="dd-steps-edit">
        <label>
          One step per line
          <textarea rows={Math.max(6, String(paste).split('\n').length + 2)} value={paste} autoFocus
            disabled={busy} onChange={(e) => setPaste(e.target.value)}
            placeholder={'The client sends a list\nInterviewers call from the list\nResponses are keyed in by hand'} />
        </label>
        <p className="ca-note">These become rows you can edit one by one.</p>
        <div className="dd-att-foot">
          <button type="button" className="gs-btn ghost sm" disabled={busy} onClick={() => setPaste(null)}>Back</button>
          <button type="button" className="gs-btn primary sm" disabled={busy} onClick={takePaste}>Use these</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dd-steps-edit">
      <ol className="dd-srows">
        {rows.map((r, i) => (
          <StepRow key={i} step={r} i={i} count={rows.length} busy={busy} people={people}
            onAddPerson={onAddPerson ? (row) => setNaming(row) : null}
            onChange={change} onMove={move} onRemove={remove} />
        ))}
      </ol>
      {/* ⚠ ADDING A PERSON WITHOUT LEAVING THE STEP. The alternative is: abandon the step
          editor, go to the Organisation tab, add the person, come back, and retype the step. The
          record gets the person either way; this is the difference between it happening and not. */}
      {naming !== null && (
        <div className="dd-newp" role="group" aria-label="Add someone to the organisation">
          <input autoFocus value={newPerson.name} placeholder="Their name, or the role"
            aria-label="Name" disabled={adding}
            onChange={(e) => setNewPerson((n) => ({ ...n, name: e.target.value }))} />
          <input value={newPerson.role} placeholder="What they do (optional)"
            aria-label="Role" disabled={adding}
            onChange={(e) => setNewPerson((n) => ({ ...n, role: e.target.value }))} />
          <button type="button" className="gs-btn primary sm" disabled={adding || !newPerson.name.trim()}
            onClick={async () => {
              setAdding(true); setErr(null);
              try {
                const id = await onAddPerson(newPerson);
                // \u26a0 The step is linked only once the person EXISTS. Linking first and creating
                // second leaves a step pointing at nothing if the create is refused.
                if (id) change(naming, { ...rows[naming], whoId: id, who: '' });
                setNaming(null); setNewPerson({ name: '', role: '' });
              } catch (e2) { setErr(e2.message || String(e2)); }
              finally { setAdding(false); }
            }}>{adding ? 'Adding\u2026' : 'Add and link'}</button>
          <button type="button" className="gs-btn ghost sm" disabled={adding}
            onClick={() => { setNaming(null); setNewPerson({ name: '', role: '' }); }}>Cancel</button>
        </div>
      )}

      <div className="dd-steps-add">
        <button type="button" className="gs-btn ghost sm" disabled={busy} onClick={add}>
          {Icon.add({ size: 14 })}<span>Add a step</span>
        </button>
        <button type="button" className="dd-steps-paste" disabled={busy}
          // ⚠ SERIALISE ALL FOUR FIELDS, AND KEEP THE GAPS.
          // This wrote three, so a round trip through "or paste a list" destroyed every step's
          // detail — the exact loss the editor above was just fixed to prevent, reintroduced by the
          // other door. And `.filter(Boolean)` collapsed empty columns, so a step with no `who` but
          // a `tool` came back with the TOOL PARSED AS THE PERSON. trimEnd keeps the line tidy
          // without moving anything left.
          onClick={() => setPaste(rows.filter((r) => r.name)
            .map((r) => [r.name, r.who, r.tool, r.detail].join(' :: ').replace(/(?: :: )+$/, ''))
            .join('\n'))}>
          or paste a list
        </button>
        <span className="dd-steps-count">{filled.length} step{filled.length === 1 ? '' : 's'}</span>
      </div>
      {err && <p className="rd-err" role="alert">{err}</p>}
      <div className="dd-att-foot">
        <button type="button" className="gs-btn ghost sm" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className="gs-btn primary sm" disabled={busy || !filled.length}
          onClick={async () => { setErr(null); try { await onSave(filled); } catch (e) { setErr(e.message); } }}>
          {busy ? 'Saving…' : 'Save the steps'}
        </button>
      </div>
    </div>
  );
}

/** A stored list, shown as the list it is rather than as the newline-joined string the editor
 *  hands back. Without this the saved value reads as one run-on paragraph the moment you stop
 *  editing, which is worse than what it replaced. */
function Lines({ list, kind }) {
  if (!list || !list.length) return null;
  // ⚠ SPANS, NOT A <ul>. The inline editor's read state is a <button>, whose content model is
  // phrasing content: a list inside it is invalid HTML. These carry the same bullet and the same
  // colour as .dd-list through a phrasing-safe class, so the two ways of showing a list match.
  return (
    <span className={`dd-lines dd-lines-${kind}`}>
      {list.map((x, i) => <span className="dd-line" key={i}>{x}</span>)}
    </span>
  );
}

export default function ProcessPage({
  slug, item, plan, map, log, findings, files, staff, canAuthor, busy,
  onEdit, onStatus, onSaveSteps, onSaveField, onSaveRecord, onAddPerson, onAttach, onDetach,
}) {
  const can = staff ? (canAuthor || { can: false }) : { can: false };
  const [editing, setEditing] = useState(false);
  const st = stateOf(map, item.id);
  const entries = useMemo(() => historyOf(log, item.id), [log, item.id]);

  const offerings = (plan.OFFERINGS || []).filter((o) => (o.processes || []).includes(item.num));
  const inWorkflow = offerings.length > 0;
  const feedsInto = (plan.PROCESSES || []).filter((p) => (item.feeds || []).includes(p.num));
  const fedBy = (plan.PROCESSES || []).filter((p) => (p.feeds || []).includes(item.num));
  // ⚠ Used by the handoff controls to resolve a process NUMBER back to the record. Referenced
  // before it existed: the render test did not catch it because its fixture records no handoff, so
  // the callback that needs it is never called. A crash waiting for real data.
  const byNum = useMemo(
    () => new Map((plan.PROCESSES || []).map((x) => [x.num, x])), [plan],
  );
  // THE HUB. Ben: "every task, every goal within a business is made up of processes." John:
  // "everything needs to revolve around the process." So this page gathers everything that touches
  // it rather than only the evidence that names it.
  const hub = useMemo(() => processHub(plan, item.num), [plan, item.num]);
  const evidence = hub.evidence;
  const steps = item.steps || [];

  return (
    <div className="ca-wrap dd-wrap">
      <nav className="dd-crumb" aria-label="Breadcrumb">
        <a href={deepDiveHref(slug)}>&larr; {plan.engagement?.client || 'Record'}</a>
        <span aria-hidden="true"> · </span>
        <span>{inWorkflow ? offerings[0].name : 'Around the work'}</span>
      </nav>
      {plan && <RecordSearch slug={slug} plan={plan} />}

      <header className="dd-head">
        <div className="dd-kicker">
          <Labelled icon="process">{inWorkflow ? `Step ${item.num} of ${offerings[0].name}` : 'A function, not a step'}</Labelled>
        </div>
        <h1 className="dd-qh1">{item.name}</h1>
        {/* ⚠ `canAuthor` answers about the ENVIRONMENT, not the viewer: probeCanAuthor asks whether
            anything here can store a change. Every other authoring control on this page is behind
            `staff`, and these two were not.
            ⚠ THE TEXT AND THE LINK ARE ONE CONTROL NOW. They were two: a click-to-edit sentence,
            and a person link that could only be set in the drawer. Saving them separately makes two
            History entries for one decision and leaves a window where the record says one and not
            the other. */}
        <div className="dd-whorow">
          <span className="dd-whorow-l">Who runs it</span>
          <InlinePeople
            names={item.whoRuns} ids={item.whoRunsId ? [item.whoRunsId] : []}
            slug={slug} people={plan.PEOPLE || []} can={can}
            label="Who runs this process" multiline={false} describes
            placeholder="A named role, and how many people sit under it."
            nameField="whoRuns" idField="whoRunsId"
            onSave={({ whoRuns, whoRunsId }) => onSaveField(item,
              // ⚠ One id, not a list: the field is singular in the schema and handing it an array
              // would be refused. The picker allows several; the last one chosen wins.
              { whoRuns, whoRunsId: (whoRunsId || []).slice(-1)[0] || null })} />
        </div>
        <div className="dd-whorow">
          <span className="dd-whorow-l">Speak to</span>
          <InlinePeople
            names={item.speakTo || []} ids={item.speakToIds || []}
            slug={slug} people={plan.PEOPLE || []} can={can}
            label="Who to walk this process with"
            placeholder="One per line. Say what to ask each of them."
            nameField="speakTo" idField="speakToIds"
            onSave={(fields) => onSaveField(item, fields)} />
        </div>
        <dl className="dd-meta">
          {inWorkflow && <div><dt>Part of</dt><dd>{offerings.map((o) => o.name).join(', ')}</dd></div>}
          <div><dt>Status</dt><dd>{STATUS[st.status].label}</dd></div>
          <div><dt>Steps mapped</dt><dd>{steps.length || 'None yet'}</dd></div>
          {item.pillars?.length > 0 && <div><dt>Pillars</dt><dd>{item.pillars.join(' · ')}</dd></div>}
        </dl>
        {staff && (
          <div className="dd-headtools">
            <button type="button" className="gs-btn ghost sm" disabled={!canAuthor?.can}
              title={canAuthor?.can ? undefined : canAuthor?.why} onClick={() => onEdit(item)}>Edit this process</button>
            {!editing && (
              <button type="button" className="gs-btn primary sm" disabled={!canAuthor?.can}
                title={canAuthor?.can ? undefined : canAuthor?.why} onClick={() => setEditing(true)}>
                {steps.length ? 'Edit the steps' : 'Map what happens inside'}
              </button>
            )}
          </div>
        )}
      </header>

      {/* ⚠ This used to render ONLY when howToday was already filled in, so a process with none
          showed nothing at all and the only way to write it was the drawer. The empty state is the
          most important one: it is the prompt to go and find out. */}
      {(item.howToday || staff) && (
        <section className="dd-access">
          <div className="dd-access-mark" aria-hidden="true" />
          <div>
            <h2>How it works today</h2>
            <InlineText value={item.howToday} can={staff ? (canAuthor || { can: false }) : { can: false }}
              label="how it works today" rows={5}
              placeholder="What actually happens, in their words."
              empty="Not recorded yet."
              onSave={(v) => onSaveField(item, { howToday: v })} />
          </div>
        </section>
      )}

      <section className="org-sec dd-sec">
        <h2><Labelled icon="process">What happens inside</Labelled></h2>
        {editing ? (
          <StepEditor steps={steps} busy={busy} people={(plan.PEOPLE || []).filter((n) => n.side === 'client')}
            onAddPerson={onAddPerson}
            onSave={async (rows) => { await onSaveSteps(item, rows); setEditing(false); }}
            onCancel={() => setEditing(false)} />
        ) : steps.length === 0 ? (
          <div className="dd-empty">
            <h2>Not mapped yet</h2>
            <p>
              This is one box on a chain and a dozen actions in the room. Writing the steps down is
              usually where the handoffs, and the person carrying a file between two tools, become
              visible.
            </p>
            {/* ⚠ The action belongs HERE, not stranded in the header. An empty state that explains
                what is missing and makes you go and find the button is a dead end wearing an
                explanation — which is what the stylesheet says about this very class. */}
            {staff && (
              <div className="dd-empty-act">
                <button type="button" className="gs-btn primary sm" disabled={!canAuthor?.can}
                  title={canAuthor?.can ? undefined : canAuthor?.why}
                  onClick={() => setEditing(true)}>Map what happens inside</button>
              </div>
            )}
          </div>
        ) : (
          <ol className="dd-steps">
            {steps.map((s) => {
              // ⚠ The editor BLANKS `who` the moment `whoId` is linked, so a step with a properly
              // linked doer has no free text to fall back on: rendering only s.who made the exact
              // person the record holds invisible. Resolve the id and link their page.
              const doer = (plan.PEOPLE || []).find((n) => n.id === s.whoId);
              return (
                <li key={s.n} className="dd-step">
                  <span className="dd-step-n">{s.n}</span>
                  <div className="dd-step-main">
                    <h3>{s.name}</h3>
                    {(s.who || s.whoId || s.tool) && (
                      <p className="dd-step-by">
                        {doer
                          ? <a className="dd-either-a" href={itemHref(slug, 'person', doer.id)}>{doer.name}</a>
                          : s.who ? <span>{s.who}</span> : null}
                        {(doer || s.who) && s.tool ? <span aria-hidden="true"> · </span> : null}
                        {s.tool && <span className="dd-step-tool">{s.tool}</span>}
                      </p>
                    )}
                    {s.detail && <p className="dd-step-d">{s.detail}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* ⚠ THE SAME EMPTY-STATE TRAP, FOR THE THIRD TIME IN THIS FILE. This section only rendered
          when a handoff already existed, so the control for recording the FIRST one did not exist
          and the only route was the drawer. A handoff is the single thing that draws an arrow on
          the workflow board: hiding the way to record one is hiding the board's whole point. */}
      {(fedBy.length > 0 || feedsInto.length > 0 || can.can) && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="link">Either side of it</Labelled></h2>
          <div className="dd-either">
            <div>
              <h3 className="dd-sub">Takes work from</h3>
              {/* ⚠ A HANDOFF IS STORED ON THE PROCESS THAT HANDS IT OVER, so recording "this takes
                  work from 02" is an edit to 02, not to this one. That is what onSaveRecord is for:
                  it labels the History entry from the record being written, so the change lands in
                  02's own trail under 02's name rather than under this page's. */}
              <InlineLinks
                value={fedBy.map((x) => x.num)}
                options={(plan.PROCESSES || []).filter((x) => x.num !== item.num)
                  .map((x) => ({ id: x.num, label: `${x.num} ${x.name}`, sub: x.whoRuns }))}
                can={onSaveRecord ? can : { can: false }} label="process" addLabel="Add a handoff in"
                empty="Nothing recorded."
                href={(num) => { const pr = byNum.get(num); return pr ? itemHref(slug, 'process', pr.id) : '#'; }}
                onChange={async (next) => {
                  const was = fedBy.map((x) => x.num);
                  const added = next.filter((n) => !was.includes(n));
                  const gone = was.filter((n) => !next.includes(n));
                  for (const n of added) {
                    const src = byNum.get(n);
                    if (src) await onSaveRecord(src, 'process', { feeds: [...new Set([...(src.feeds || []), item.num])] });
                  }
                  for (const n of gone) {
                    const src = byNum.get(n);
                    if (src) await onSaveRecord(src, 'process', { feeds: (src.feeds || []).filter((f) => f !== item.num) });
                  }
                }} />
            </div>
            <div>
              <h3 className="dd-sub">Hands work to</h3>
              <InlineLinks
                value={item.feeds || []}
                options={(plan.PROCESSES || []).filter((x) => x.num !== item.num)
                  .map((x) => ({ id: x.num, label: `${x.num} ${x.name}`, sub: x.whoRuns }))}
                can={can} label="process" addLabel="Add a handoff out" empty="Nothing recorded."
                href={(num) => { const pr = byNum.get(num); return pr ? itemHref(slug, 'process', pr.id) : '#'; }}
                onChange={(next) => onSaveField(item, { feeds: next })} />
            </div>
          </div>
        </section>
      )}

      {/* ⚠ THE FIX MADE FOR howToday NINETY LINES UP WAS NEVER CARRIED HERE. Both of these rendered
          only when already non-empty, so a process with no pain recorded showed nothing and the
          only way to write one was the drawer. These are the two fields a walkthrough fills in as
          it goes, which makes them the worst possible pair to make somebody leave the page for.
          They are lists, and they need no list editor: strList() already splits a newline-separated
          string, which is the same shape the drawer's own textarea hands over. */}
      {(item.pains?.length > 0 || item.opens?.length > 0 || staff) && (
        <div className="dd-proc-cols">
          <div><h3 className="dd-sub">Already named</h3>
            <InlineText value={(item.pains || []).join('\n')} rows={4}
              can={staff ? (canAuthor || { can: false }) : { can: false }}
              label="the pains already named" render={(v) => <Lines list={item.pains} kind="named" />}
              placeholder={'One per line.'} empty="Nothing named yet."
              onSave={(v) => onSaveField(item, { pains: v })} /></div>
          <div><h3 className="dd-sub">What we establish</h3>
            <InlineText value={(item.opens || []).join('\n')} rows={4}
              can={staff ? (canAuthor || { can: false }) : { can: false }}
              label="what this process leaves open" render={(v) => <Lines list={item.opens} kind="open" />}
              placeholder={'One per line.'} empty="Nothing open yet."
              onSave={(v) => onSaveField(item, { opens: v })} /></div>
        </div>
      )}

      {/* Everything the record ties to this process. People arrive through the TASKS they do inside
          it, because that is the only link the record can evidence: naming somebody against a
          process with no task behind it would be a guess. */}
      <section className="org-sec dd-sec">
        <h2><Labelled icon="link">What sits on this process</Labelled></h2>
        <div className="dd-hub">
          <div className="dd-hub-c">
            <h3 className="dd-sub">People in it</h3>
            {hub.people.length ? hub.people.map((n) => (
              <a key={n.id} className="dd-either-a" href={itemHref(slug, 'person', n.id)}>{n.name}</a>
            )) : <p className="dd-prov-none">Nobody, because no task has been recorded inside it.</p>}
          </div>
          <div className="dd-hub-c">
            <h3 className="dd-sub">Questions about it</h3>
            {/* ⚠ The tie lives on the QUESTION, so this writes to the question. On the live record
                86 of 86 questions name no process, which makes tying one from the process you are
                reading the single most useful control on this page. */}
            <InlineLinks
              value={hub.questions.map((q) => q.id)}
              options={(plan.QUESTIONS || []).flatMap((g) => (g.items || [])
                .map((q) => ({ id: q.id, label: q.q, sub: g.pillar })))}
              can={onSaveRecord ? can : { can: false }} label="question" addLabel="Tie a question"
              empty="None tied to it yet."
              href={(qid) => questionHref(slug, qid)}
              onChange={async (next) => {
                const qs = (plan.QUESTIONS || []).flatMap((g) => g.items || []);
                const was = hub.questions.map((q) => q.id);
                for (const id of next.filter((x) => !was.includes(x))) {
                  const q = qs.find((x) => x.id === id);
                  if (q) await onSaveRecord(q, 'question', { processes: [...new Set([...(q.processes || []), item.num])] });
                }
                for (const id of was.filter((x) => !next.includes(x))) {
                  const q = qs.find((x) => x.id === id);
                  if (q) await onSaveRecord(q, 'question', { processes: (q.processes || []).filter((n) => n !== item.num) });
                }
              }} />
          </div>
          <div className="dd-hub-c">
            <h3 className="dd-sub">Sessions that walk it</h3>
            <InlineLinks
              value={hub.sessions.map((x) => x.id)}
              options={(plan.SESSIONS || []).map((x) => ({ id: x.id, label: x.person, sub: x.only }))}
              can={onSaveRecord ? can : { can: false }} label="session" addLabel="Tie a session"
              empty="None tied to it yet."
              href={(sid) => sessionHref(slug, sid)}
              onChange={async (next) => {
                const ss = plan.SESSIONS || [];
                const was = hub.sessions.map((x) => x.id);
                for (const id of next.filter((x) => !was.includes(x))) {
                  const x = ss.find((y) => y.id === id);
                  if (x) await onSaveRecord(x, 'session', { processes: [...new Set([...(x.processes || []), item.num])] });
                }
                for (const id of was.filter((x) => !next.includes(x))) {
                  const x = ss.find((y) => y.id === id);
                  if (x) await onSaveRecord(x, 'session', { processes: (x.processes || []).filter((n) => n !== item.num) });
                }
              }} />
          </div>
          <div className="dd-hub-c">
            <h3 className="dd-sub">Delivers</h3>
            {/* ⚠ Which services this process delivers is decided while looking at the process, not
                in a form over it. Same runOp as the drawer. */}
            <InlineLinks
              value={item.offerings || []}
              options={(plan.OFFERINGS || []).map((o) => ({ id: o.ref, label: o.name, sub: o.what }))}
              can={staff ? (canAuthor || { can: false }) : { can: false }}
              label="service" addLabel="Add a service" empty="No offering names it."
              onChange={(next) => onSaveField(item, { offerings: next })} />
            {hub.kpis.length > 0 && (
              <>
                <h3 className="dd-sub" style={{ marginTop: 'var(--dd-3)' }}>Measured by</h3>
                {/* A chip that names a number should open it: KpiPage holds the target and what
                    moves it, and going the long way round via the KPIs tab is the dead end. */}
                {hub.kpis.map((k) => <a key={k.id} className="dd-chip dd-ev-held" href={itemHref(slug, 'kpi', k.id)}>{k.name}</a>)}
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── the forward half ────────────────────────────────────────────────────────────────────
          Everything above says how this chain runs TODAY. This says what the GITA proposed would
          change it, and what we still have to find out before we can say it would work here. That
          second part IS the Deep Dive's job on a build: a proposal with unanswered unknowns is not
          ready to be costed, and an unknown with nothing investigating it is a gap in the record. */}
      {/* Staff only. What we proposed, what it would take out and what we still cannot answer is
          our working material; the client sees what is marked Shared, deliberately. */}
      {staff && hub.builds.length > 0 && (
        <section className="org-sec dd-sec dd-builds">
          <h2><Labelled icon="link">What we proposed for it</Labelled></h2>
          <p className="dd-sub-lead">From the GITA. This is what the engagement is working towards,
            so the record carries it beside the process it would change.</p>
          <ul className="dd-buildl">
            {hub.builds.map((b) => (
              <li key={b.id} className={`dd-build dd-bs-${b.state}`}>
                <div className="dd-build-h">
                  {b.ref && <span className="dd-build-ref">{b.ref}</span>}
                  {/* The name is the way through: BuildPage holds the demo, the opportunity and
                      the complexity assessment, and this section used to dead-end short of it. */}
                  <h3><a className="dd-q-link" href={itemHref(slug, 'build', b.id)}>{b.name}</a></h3>
                  {/* ⚠ THE SAME PANE AS THE PROPOSAL'S OWN PAGE. Deciding a proposal is stopped
                      happens while looking at the process it would have changed, which is where the
                      argument for stopping it actually is. Cross-record, so it writes through
                      onSaveRecord and lands in the proposal's own history under its own name. */}
                  <BuildStatePopover build={b} busy={busy} size="sm"
                    can={onSaveRecord ? can : { can: false }}
                    onSave={(fields) => onSaveRecord(b, 'build', fields)} />
                </div>
                {b.what && <p className="dd-build-what">{b.what}</p>}
                <dl className="dd-build-d">
                  {b.forWhom && <div><dt>Who would use it</dt><dd>{b.forWhom}</dd></div>}
                  {b.replaces && <div><dt>What it takes out</dt><dd>{b.replaces}</dd></div>}
                </dl>
                {b.needs.length > 0 && (
                  <div className="dd-build-l">
                    <h4 className="dd-sub">What it needs to work here</h4>
                    <ul>{b.needs.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </div>
                )}
                {/* Lime, because this is open work being asked of the investigation. */}
                <div className="dd-build-l dd-build-unknown">
                  <h4 className="dd-sub">What we still have to find out</h4>
                  {/* ⚠ Written where it is noticed. These are the Deep Dive's own job list on a
                      proposal, and a practitioner walking the process is exactly the person who
                      spots one. It was read only on both pages that show it. */}
                  <InlineText value={(b.unknowns || []).join('\n')} rows={3}
                    can={onSaveRecord ? can : { can: false }}
                    label={`what we still have to find out about ${b.name}`}
                    render={() => <Lines list={b.unknowns} kind="open" />}
                    placeholder="One per line."
                    empty="Nothing recorded, which means either it is understood or nobody has asked. Say which."
                    onSave={(v) => onSaveRecord(b, 'build', { unknowns: v })} />
                </div>
                {b.note && <p className="dd-build-note">{b.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {evidence.length > 0 && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="evidence">Evidence that bears on it</Labelled></h2>
          <ul className="dd-cli">
            {evidence.map((e) => (
              <li key={e.id} className="dd-cli-row">
                <div className="dd-cli-main">
                  <h3><a className="ca-link" href={evidenceHref(slug, e.id)}>{e.item}</a></h3>
                  {e.missing && <p>{e.missing}</p>}
                </div>
                <Chip tone={`ev-${e.state}`}>{e.state === 'held' ? 'Held' : e.state === 'partial' ? 'Part held' : 'Outstanding'}</Chip>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Attachments slug={slug} itemId={item.id} files={files} staff={staff}
        canAuthor={canAuthor} busy={busy} onAttach={onAttach} onDetach={onDetach} />

      {staff && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="proposed">Where it has got to</Labelled></h2>
          <div className="dd-ctl">
            <label className="dd-ctl-status">
              <span className="gs-sr-only">Status for {item.name}</span>
              <select value={st.status} disabled={busy || !canAuthor?.can}
                className={`dd-sel dd-sel-${STATUS[st.status].tone}`}
                onChange={(e) => onStatus(item.id, { status: e.target.value }, item.name)}>
                {Object.keys(STATUS).map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
              </select>
            </label>
          </div>
        </section>
      )}

      {/* ⚠ Nothing is not a history. Three of these pages already hid this section when empty and
          five rendered a heading over the words "Nothing yet.", which is a section telling you what
          you could already see. */}
      {entries.length > 0 && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="history">History</Labelled></h2>
          <ChangeLog entries={entries} />
        </section>
      )}
    </div>
  );
}
