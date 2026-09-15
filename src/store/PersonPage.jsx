// One person in the client's business.
//
// They are in this record because we are going to sit with them, or because a number is theirs, or
// because somebody named them. Most of them will never have an account, and that is the normal
// case: a person belongs to the record whether or not they can log in.
//
// The account line is deliberately careful. It says what is TRUE (this is the address they would
// sign in with, and whether an account answers to it), and it does not say they have been given
// anything, because access flows from the company's own account and from what is marked Shared.
import React, { useMemo } from 'react';
import { STATUS, stateOf, historyOf } from './deepdive-state.mjs';
import { personHolds, personLoad } from './deepdive-org.mjs';
import { deepDiveHref, itemHref, sessionHref } from '../lib/deepdive-route.mjs';
import { Icon, Labelled } from './DeepDiveIcons.jsx';
import RecordSearch from './RecordSearch.jsx';
import ChangeLog from './ChangeLog.jsx';
import InlineSelect from './InlineSelect.jsx';
import Attachments from './Attachments.jsx';

const Chip = ({ tone, children, title }) => (
  <span className={`dd-chip dd-${tone}`} title={title}>{children}</span>
);

// The four levers, coloured by whether the work leaves the person. Teal is what this portal uses
// for something settled; lime for what is still open.
// Tone follows what actually happens to the work, not how modern the answer sounds.
// ⚠ `moves` is deliberately NOT toned as a saving: the business still does that work.
const FATE_TONE = {
  'not decided': 'cert-unknown', stays: 'st-open',
  // lessened, still theirs
  simplified: 'cert-indicated', digitised: 'cert-indicated', augmented: 'cert-indicated',
  // off the person entirely
  eliminated: 'ev-held', automated: 'ev-held', agentic: 'ev-held',
  // off THIS person, still in the business
  moves: 'cert-indicated',
};

const SIDE_WORD = {
  client: 'In the client’s business',
  greatstone: 'Greatstone',
  'third party': 'Outside the business',
};

export default function PersonPage({
  slug, item, plan, map, log, files, staff, canAuthor, busy, onEdit, onEditTask, onStatus,
  onSaveField, onSaveRecord, onAttach, onDetach,
}) {
  const can = staff ? (canAuthor || { can: false }) : { can: false };
  const st = stateOf(map, item.id);
  const entries = useMemo(() => historyOf(log, item.id), [log, item.id]);
  const holds = useMemo(() => personHolds(plan, item.id), [plan, item.id]);
  const load = useMemo(() => personLoad(plan, item.id), [plan, item.id]);

  // A task carries process NUMBERS, not ids. Each one is a way into the chain the work lives in, so
  // it is resolved to the process and linked. A number the record no longer knows stays as bare
  // text: `remove` does not cascade (deepdive-org.mjs, dangling), so a dangling num is a real state
  // and a dead link would be worse than a plain one. Separators stay outside the anchors.
  const byNum = useMemo(() => new Map((plan.PROCESSES || []).map((p) => [p.num, p])), [plan]);
  const processLinks = (nums, sep) => nums.map((num, i) => {
    const p = byNum.get(num);
    return (
      <React.Fragment key={num}>
        {i > 0 ? sep : ''}
        {p ? <a className="dd-either-a" href={itemHref(slug, 'process', p.id)}>{num} {p.name}</a> : num}
      </React.Fragment>
    );
  });

  return (
    <div className="ca-wrap dd-wrap">
      <nav className="dd-crumb" aria-label="Breadcrumb">
        <a href={deepDiveHref(slug)}>&larr; {plan.engagement?.client || 'Record'}</a>
        <span aria-hidden="true"> · </span>
        <span>{holds.unit ? holds.unit.name : 'People'}</span>
      </nav>
      {plan && <RecordSearch slug={slug} plan={plan} />}

      <header className="dd-head">
        <div className="dd-kicker"><Labelled icon="session">{SIDE_WORD[item.side] || item.side}</Labelled></div>
        <h1 className="dd-qh1">{item.name}</h1>
        {item.role && <p className="dd-lead">{item.role}</p>}
        <dl className="dd-meta">
          {/* ⚠ WHERE SOMEBODY SITS AND WHO THEY REPORT TO were both read only, and both are the
              answers most likely to be wrong on a first pass: an org chart gets corrected while you
              are looking at it, not by opening a form over it. Rendered even when unset, because
              "nobody has placed them" is the state you most want to fix. */}
          <div><dt>Sits in</dt><dd>
            <InlineSelect value={item.unitId || ''} can={can} label="Which team they sit in"
              empty="Not placed"
              options={[{ id: '', label: 'Not placed' },
                ...(plan.UNITS || []).map((u) => ({ id: u.id, label: u.name }))]}
              onSave={(next) => onSaveField(item, { unitId: next || null })} />
          </dd></div>
          <div><dt>Reports to</dt><dd>
            {/* The manager's name is a way UP the chart: their page says what they run and whether a
                session covers them. A read-only viewer gets the name as the link (InlineSelect would
                give them a dead span); an editor keeps the select, because correcting the line in
                place is the point of it, and gets the link beside it. When reportsTo names somebody
                the record does not know, holds.manager is null and the select's own "not one of this
                record's choices" handling stays in charge. */}
            {holds.manager && !can.can ? (
              <a className="dd-isel-v dd-either-a" href={itemHref(slug, 'person', holds.manager.id)}>
                {holds.manager.name}
              </a>
            ) : (
              <>
                <InlineSelect value={item.reportsTo || ''} can={can} label="Who they report to"
                  empty="Not recorded"
                  options={[{ id: '', label: 'Not recorded' },
                    // ⚠ Never themselves: the record refuses it, and offering it invites a refusal.
                    ...(plan.PEOPLE || []).filter((n) => n.id !== item.id)
                      .map((n) => ({ id: n.id, label: n.name }))]}
                  onSave={(next) => onSaveField(item, { reportsTo: next || null })} />
                {holds.manager && (
                  <a className="dd-either-a dd-isel-go" href={itemHref(slug, 'person', holds.manager.id)}
                    aria-label={`Their page: ${holds.manager.name}`}>Their page</a>
                )}
              </>
            )}
          </dd></div>
          <div><dt>Reporting to them</dt><dd>{holds.reports.length || 'Nobody recorded'}</dd></div>
          <div><dt>Sessions</dt><dd>{holds.sessions.length || 'None arranged'}</dd></div>
        </dl>
        {staff && (
          <div className="dd-headtools">
            <button type="button" className="gs-btn ghost sm" disabled={!canAuthor?.can}
              title={canAuthor?.can ? undefined : canAuthor?.why} onClick={() => onEdit(item)}>Edit this person</button>
          </div>
        )}
      </header>

      {staff && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="link">Reaching them</Labelled></h2>
          <div className="dd-reach">
            {item.email
              ? <p><b>Email.</b> {item.email}</p>
              : <p className="dd-prov-none">No email recorded, so nobody can arrange anything with them from here.</p>}
            {item.accountEmail ? (
              <p><b>Signs in as.</b> {item.accountEmail}</p>
            ) : (
              <p className="dd-prov-none">No account. That is the normal case: most of the people we
                interview never have one, and they belong in this record either way.</p>
            )}
            {/* Said out loud, because "linked to an account" reads like a permission and is not one. */}
            <p className="ca-note">
              Linking an account records who they are. It does not grant anything: what a client can
              see still follows their company&rsquo;s own account, and only what is marked Shared.
            </p>
          </div>
        </section>
      )}

      {/* What they actually do, and what is left of it. Ben, 6 Sep: "understand what each person
          does, what their tasks are... and in the target state, are there going to be less
          processes attached to this individual?" */}
      <section className="org-sec dd-sec">
        <h2><Labelled icon="process">What they do</Labelled></h2>
        {load.tasks.length === 0 ? (
          <div className="dd-empty">
            <h2>No tasks recorded</h2>
            <p>
              Until somebody writes down what this person actually does, they are a name on a chart.
              The tasks are what carry the target state: a process only comes off somebody if the
              work behind it is recorded first.
            </p>
          </div>
        ) : (
          <>
            <div className="dd-load">
              <div><dt>Tasks</dt><dd>{load.tasks.length}</dd></div>
              <div><dt>Hours a week</dt>
                <dd>{load.hoursNow || 'Not recorded'}
                  {load.hoursUnknown > 0 && <span className="dd-org-of"> · {load.hoursUnknown} not timed</span>}</dd></div>
              <div><dt>Freed in the target state</dt>
                <dd className={load.hoursFreed ? 'is-freed' : undefined}>{load.hoursFreed ? `${load.hoursFreed} hours` : 'None yet'}</dd></div>
              <div><dt>Still to decide</dt><dd>{load.tasks.length - load.decided}</dd></div>
            </div>
            <ul className="dd-tasks">
              {load.tasks.map((t) => (
                <li key={t.id} className={`dd-task dd-fate-${t.fate.replace(/ /g, '-')}`}>
                  <div className="dd-task-main">
                    <h3>{t.what}</h3>
                    <p className="dd-task-meta">
                      {t.hours ? `${t.hours} hours a week` : 'Hours not recorded'}
                      {t.cadence ? ` · ${t.cadence}` : ''}
                      {t.processes.length ? <> · inside {processLinks(t.processes, ', ')}</> : null}
                    </p>
                    {t.why && <p className="dd-task-why">{t.why}</p>}
                    {/* ⚠ `task.note` is in the schema, is editable in the drawer, and was rendered
                        NOWHERE. Somebody typed it and no screen in the portal showed it back. */}
                    {t.note && <p className="dd-task-note">{t.note}</p>}
                  </div>
                  <Chip tone={FATE_TONE[t.fate] || 'st-open'}>{t.fate}</Chip>
                  {/* ⚠ A TASK USED TO BE FROZEN THE MOMENT IT WAS SAVED. There was an Add path and
                      no edit and no remove anywhere in the portal, so `fate` — the field the whole
                      target-state panel is computed from — could never be changed once wrong. */}
                  {staff && (
                    <button type="button" className="dd-edit" disabled={!canAuthor?.can}
                      title={canAuthor?.can ? undefined : canAuthor?.why}
                      aria-label={`Edit the task: ${t.what}`}
                      onClick={() => onEditTask && onEditTask(t)}>Edit</button>
                  )}
                </li>
              ))}
            </ul>
            {load.processesFreed.length > 0 && (
              <p className="dd-task-off">
                In the target state, {processLinks(load.processesFreed, ' and ')} comes off them entirely.
              </p>
            )}
          </>
        )}
      </section>

      {(holds.reports.length > 0 || holds.worksWith.length > 0 || holds.leads.length > 0) && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="link">Who they work with</Labelled></h2>
          <div className="dd-either">
            <div>
              <h3 className="dd-sub">Reporting to them</h3>
              {holds.reports.length ? holds.reports.map((n) => (
                <a key={n.id} className="dd-either-a" href={itemHref(slug, 'person', n.id)}>{n.name}</a>
              )) : <p className="dd-prov-none">Nobody recorded.</p>}
            </div>
            <div>
              <h3 className="dd-sub">Works with</h3>
              {holds.worksWith.length ? holds.worksWith.map((n) => (
                <a key={n.id} className="dd-either-a" href={itemHref(slug, 'person', n.id)}>{n.name}</a>
              )) : <p className="dd-prov-none">Nothing recorded.</p>}
            </div>
          </div>
          {holds.leads.length > 0 && (
            <p className="dd-org-runs">
              Runs {holds.leads.map((u) => u.name).join(', ')}.
            </p>
          )}
        </section>
      )}

      <section className="org-sec dd-sec">
        <h2><Labelled icon="session">Sitting with them</Labelled></h2>
        {holds.sessions.length === 0 ? (
          <div className="dd-empty">
            <h2>No session is arranged</h2>
            <p>
              {item.side === 'client'
                ? 'Somebody in the business we have not planned to speak to. That is either a gap in the plan or a decision, and the record cannot tell which until one of them is written down.'
                : 'Nothing arranged with them.'}
            </p>
          </div>
        ) : (
          <ul className="dd-cli">
            {holds.sessions.map((sn) => (
              <li key={sn.id} className="dd-cli-row">
                <div className="dd-cli-main">
                  <h3><a className="dd-q-link" href={sessionHref(slug, sn.id)}>{sn.person}</a></h3>
                  {sn.only && <p>{sn.only}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {item.note && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="evidence">Note</Labelled></h2>
          <p className="dd-org-does">{item.note}</p>
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

      {/* ── what they are on the hook for ──────────────────────────────────────────────────────
          ⚠ THIS PAGE COULD NOT ANSWER THE ONE QUESTION IT EXISTS FOR. Who runs a process, who to
          speak to inside it, who controls a source and whose number a KPI is were all free text,
          so a person's own page showed their tasks and their reporting line and nothing about what
          they are actually responsible for. The names are still written on those records; these
          are the links, and a name with no link is listed underneath rather than left invisible. */}
      <section className="org-sec dd-sec">
        <h2><Labelled icon="link">What they are responsible for</Labelled></h2>
        {(holds.runs.length + holds.walkWith.length + holds.owns.length
          + holds.numbers.length + holds.leads.length + holds.doesSteps.length) === 0 ? (
          <p className="dd-prov-none">
            Nothing in the record is tied to {item.name}. Either they are not on the hook for
            anything, or their name is written somewhere as text that nobody has linked yet.
          </p>
        ) : (
          <div className="dd-holds">
            {holds.leads.length > 0 && (
              <div className="dd-holds-c"><h3 className="dd-sub">Leads</h3>
                <ul className="dd-list dd-list-named">
                  {holds.leads.map((u) => <li key={u.id}>{u.name}</li>)}
                </ul></div>
            )}
            {holds.doesSteps.length > 0 && (
              <div className="dd-holds-c"><h3 className="dd-sub">Does, step by step</h3>
                <ul className="dd-list dd-list-named">
                  {holds.doesSteps.map(({ process, step }) => (
                    <li key={`${process.id}-${step.n}`}>
                      <a href={itemHref(slug, 'process', process.id)}>{step.name}</a>
                      <span className="dd-holds-w"> in {process.num} {process.name}</span>
                    </li>
                  ))}
                </ul></div>
            )}
            {holds.runs.length > 0 && (
              <div className="dd-holds-c"><h3 className="dd-sub">Runs</h3>
                <ul className="dd-list dd-list-named">
                  {holds.runs.map((x) => (
                    <li key={x.id}><a href={itemHref(slug, 'process', x.id)}>{x.num} {x.name}</a></li>
                  ))}
                </ul></div>
            )}
            {holds.walkWith.length > 0 && (
              <div className="dd-holds-c"><h3 className="dd-sub">To be walked through with them</h3>
                <ul className="dd-list dd-list-open">
                  {holds.walkWith.map((x) => (
                    <li key={x.id}><a href={itemHref(slug, 'process', x.id)}>{x.num} {x.name}</a></li>
                  ))}
                </ul></div>
            )}
            {holds.owns.length > 0 && (
              <div className="dd-holds-c"><h3 className="dd-sub">Access goes through them</h3>
                <ul className="dd-list dd-list-named">
                  {holds.owns.map((x) => (
                    <li key={x.id}><a href={itemHref(slug, 'source', x.id)}>{x.name}</a></li>
                  ))}
                </ul></div>
            )}
            {holds.numbers.length > 0 && (
              <div className="dd-holds-c"><h3 className="dd-sub">Numbers that are theirs</h3>
                <ul className="dd-list dd-list-named">
                  {holds.numbers.map((x) => (
                    <li key={x.id}>
                      <a href={itemHref(slug, 'kpi', x.id)}>{x.name}</a>
                      {x.target != null ? ` · target ${x.target}${x.unit ? ` ${x.unit}` : ''}` : ''}
                    </li>
                  ))}
                </ul></div>
            )}
          </div>
        )}
      </section>

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
