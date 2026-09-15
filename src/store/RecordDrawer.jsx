// The one place information gets INTO a client record.
//
// Four kinds of item and the record's own details all go through this drawer, because they are the
// same act from the admin's side: "write down something we now know". It uses the site's existing
// dialog behaviour (DrawerScrim + useModal) rather than a new one, so focus, Escape and scroll
// locking work exactly as they do everywhere else in the admin.
//
// It validates with the SHARED rules before sending, so a mistake is answered by the field that
// caused it rather than by a failed request. The server runs the same rules again on arrival.
//
// EVERY PLACEHOLDER HERE IS GENERIC. Placeholder text is compiled into the public JavaScript bundle,
// so an example drawn from a live engagement is a confidentiality leak wearing the costume of a
// helpful hint. The first draft of this file put a real client's tool names into the bundle, and the
// dist grep caught it. Keep examples abstract.
import React, { useState, useRef, useMemo } from 'react';
import DrawerScrim from './DrawerScrim.jsx';
import { useModal } from './useModal.mjs';
import {
  KINDS, PILLARS, PILLAR_GROUP, CERTAINTY_IDS, EVIDENCE_STATE_IDS, SOURCE_TYPES, DESCRIPTOR, applyOp,
  KPI_SCOPES, KPI_DIRECTIONS, HYPOTHESIS_VERDICTS, OFFERING_STATES, ownFields,
  UNIT_TYPES, CADENCES, PROVENANCE_KINDS, PERSON_SIDES, CLARITY, AMBITION_FIT, TASK_FATE, FATE_MEANS, cadenceOf,
  ROUTES, BUILD_STATES, SESSION_METHODS, SESSION_PRIORITIES, OPPORTUNITY_STATES, COMPLEXITY_STATES, COMPLEXITY_DIMENSIONS,
  EVIDENCE_VSTATE_IDS, HOLDS_SOMETHING, canReview, MEASURE_CONFIDENCE, MEASURE_CONFIDENCE_MEANS,
} from '../data/deepdive-schema.mjs';
import { orgList } from './deepdive-org.mjs';
import { CERTAINTY, EVIDENCE_STATE, EVIDENCE_VSTATE } from '../data/deepdive.mjs';
import {
  BUILD_STATES_NEEDING_WHY, BUILD_STATE_MEANS, BUILD_STATE_WORD, DEMO_KINDS, DEMO_KIND_MEANS,
} from '../data/deepdive-schema.mjs';

/** A named group of fields.
 *
 *  At 440px the form could only be a single flat run, and the run order was schema-declaration
 *  order, which is the order a MACHINE needs the fields in. At 1040px the form can show the shape
 *  of the thing being described: what it IS, what it TOUCHES, what is still OPEN. The groups are
 *  those questions, and the first one always holds the required fields so the minimum viable
 *  record can be saved without scrolling.
 *
 *  role="group" + aria-labelledby rather than fieldset/legend: a legend cannot sit inside the
 *  grid flow, and a fieldset resets `min-width` in ways that fight `minmax(0, 1fr)` columns. */
let grpSeq = 0;
function Grp({ title, hint, children }) {
  const [id] = useState(() => `rd-grp-${++grpSeq}`);
  return (
    <section className="rd-grp" role="group" aria-labelledby={id}>
      <div className="rd-grp-head">
        <h3 id={id} className="rd-grp-h">{title}</h3>
        {hint ? <p className="rd-grp-hint">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

const KIND_LABEL = {
  process: 'Process', question: 'Question', evidence: 'Evidence', session: 'Session',
  source: 'Source', kpi: 'KPI', hypothesis: 'Hypothesis', competitor: 'Competitor',
  offering: 'Offering', unit: 'Unit', person: 'Person', task: 'Task', build: 'Proposed build',
};


/** The thirteen kinds, grouped by what they are FOR.
 *
 *  ⚠ THIRTEEN FLAT PILLS IN A PILL-SHAPED BOX wrapped to three ragged rows, and because each one
 *  was `flex: 1 1 auto` they stretched to a different width on every row, so the first thing anybody
 *  saw when adding anything was a shape that looked like a mistake. Thirteen equal options also say
 *  the thirteen things are equally likely, which they are not.
 *
 *  The groups are not decoration. They are the three questions this record answers: how the
 *  business runs, what we are establishing about it, and what we proposed to change. A competitor
 *  sits in the middle group because it is a research finding, "what we actually found, not what we
 *  assume", rather than a part of the client's own business. */
const KIND_GROUPS = [
  { label: 'How the business runs', kinds: ['process', 'offering', 'unit', 'person', 'task', 'kpi'] },
  { label: 'What we are establishing', kinds: ['question', 'session', 'evidence', 'source', 'hypothesis', 'competitor'] },
  { label: 'What we proposed', kinds: ['build'] },
];

/** Every kind the picker can actually offer. A drawer opened on anything else hides the picker
 *  rather than showing one that cannot represent it. */
const PICKABLE = new Set(KIND_GROUPS.flatMap((g) => g.kinds));

const KIND_BLURB = {
  process: 'A part of the business, walked end to end: how it works today, who runs it, and what we still need to establish.',
  question: 'Something this record has to answer, under one pillar. Certainty decides the effort: Known is stated, Indicated is validated, Unknown is investigated.',
  evidence: 'A document, dataset or system we need, and whether we have it yet.',
  session: 'A person whose time we need, what only they can give, and the questions this session is meant to answer.',
  source: 'Where information comes from: a person, a team, a system or a document. Sources outlive any one session.',
  kpi: 'A number the business measures itself by, and what moves it. Scope matters: a team\u2019s own number and a company number are different conversations.',
  hypothesis: 'Something we think is true and have not yet tested. An open one has to say what would KILL it, because a claim with no falsifier is an opinion.',
  competitor: 'Somebody else in this market, and what we actually found about them rather than what we assume.',
  offering: 'One of the things the client sells. The processes that deliver it are what turn a service line into a workflow on the board.',
  build: 'Something the GITA proposed we build for them. The record carries it beside the process it would change, because the Deep Dive exists to work out what it would actually take to get there.',
  unit: 'A box on the org chart: the company, a division, a department, a team, or one person\u2019s role. Put it under the one above it, and numbers can be assigned to it and tracked.',
  person: 'Somebody in the client\u2019s business, or around it. They belong here whether or not they have an account: most of the people we interview never will.',
  task: 'One thing a person actually does. What becomes of it, eliminated / automated / augmented / agentic, is what turns the org chart into a target state.',
};

// `state` is shared by two kinds with two different vocabularies, so the default has to follow the
// kind. Seeding an offering with an evidence state renders a select with no matching option and
// throws on the first save.
// ⚠ THREE kinds now, and a missing entry kills the ADD path silently: the select renders blank
// because the seeded value matches no option, and the first save throws. Adding `build` without
// this line meant the only way to create the first build was to notice an untouched-looking
// dropdown. Any kind whose buildItem validates `state` MUST be here — deepdive-drawer.test.mjs
// checks it now.
const KIND_STATE = { evidence: 'missing', offering: 'live', build: 'proposed', opportunity: 'draft', complexity: 'initial' };


// A textarea whose lines become a list, because typing five pain points is five lines, not five
// clicks on "+ add another".
/** ⚠ A SELECT CANNOT SHOW A VALUE THAT IS NOT IN ITS LIST. It shows the FIRST option instead, so a
 *  dangling reference reads as "Not assigned" while the form still holds the dead id and submits it
 *  back. Removing a unit does NOT clear the `unitId` of the people, KPIs, processes and sessions
 *  that named it, and removing a person does not clear `reportsTo` — both verified. So the stored
 *  value always gets an option, and when nothing matches it says so.
 *  Fifth instance of this shape in this build, which is why it is now one helper. */
function Dangling({ value, known }) {
  if (!value || known.has(value)) return null;
  return <option value={value}>Not in this record any more, it was removed</option>;
}

// Which part of the business something belongs to. Indented to match the chart, so the list you
// pick from is the same shape as the picture you looked at.
const UnitPicker = ({ plan, value, onChange, label = 'Which part of the business', exclude = null }) => {
  const rows = orgList(plan || {}).filter((n) => n.unit.id !== exclude);
  if (!rows.length) {
    return (
      <label>{label}
        <select disabled value=""><option value="">No organisation mapped yet</option></select>
      </label>
    );
  }
  return (
    <label>{label}
      <select value={value || ''} onChange={onChange}>
        <option value="">Not assigned</option>
        <Dangling value={value} known={new Set(rows.map((n) => n.unit.id))} />
        {rows.map((n) => (
          <option key={n.unit.id} value={n.unit.id}>
            {'\u2007'.repeat(n.depth * 2)}{n.unit.ref ? `${n.unit.ref} ` : ''}{n.unit.name}
          </option>
        ))}
      </select>
    </label>
  );
};

// Somebody in the record. Shows their unit beside the name, because two people called "the
// supervisor" is the normal case and the team is what tells them apart.
const PersonPicker = ({ plan, value, onChange, label, exclude = null, blank = 'Not linked' }) => {
  const units = new Map((plan?.UNITS || []).map((u) => [u.id, u]));
  const rows = (plan?.PEOPLE || []).filter((n) => n.id !== exclude)
    .slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (!rows.length) {
    return (
      <label>{label}
        <select disabled value=""><option value="">Nobody in the record yet</option></select>
      </label>
    );
  }
  return (
    <label>{label}
      <select value={value || ''} onChange={onChange}>
        <option value="">{blank}</option>
        <Dangling value={value} known={new Set(rows.map((n) => n.id))} />
        {rows.map((n) => (
          <option key={n.id} value={n.id}>
            {n.name}{n.role ? ` · ${n.role}` : ''}{units.get(n.unitId) ? ` (${units.get(n.unitId).name})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
};

/** Pick an initiative, or the opportunity an initiative serves.
 *
 *  ⚠ BOTH USE `Dangling`, and that is not decoration. A <select> whose stored value matches no
 *  option renders as the FIRST option and saves that instead, so a link written by an MCP session
 *  to an item this browser has not loaded is destroyed by opening the drawer and pressing save.
 *  That has happened three times in this record. Dangling keeps the unknown id selectable. */
const BuildPicker = ({ plan, value, onChange, label = 'The initiative', blank = 'Not linked' }) => {
  const rows = (plan?.BUILDS || []).slice()
    .sort((a, b) => String(a.ref || a.name).localeCompare(String(b.ref || b.name)));
  if (!rows.length) {
    return (
      <label>{label}
        <select disabled value=""><option value="">No initiatives in the record yet</option></select>
      </label>
    );
  }
  return (
    <label>{label}
      <select value={value || ''} onChange={onChange}>
        <option value="">{blank}</option>
        <Dangling value={value} known={new Set(rows.map((b) => b.id))} />
        {rows.map((b) => <option key={b.id} value={b.id}>{[b.ref, b.name].filter(Boolean).join(' ')}</option>)}
      </select>
    </label>
  );
};

const OpportunityPicker = ({ plan, value, onChange, label = 'The opportunity it serves', blank = 'Not linked' }) => {
  const rows = (plan?.OPPORTUNITIES || []).slice()
    .sort((a, b) => String(a.ref || a.name).localeCompare(String(b.ref || b.name)));
  if (!rows.length) {
    return (
      <label>{label}
        <select disabled value=""><option value="">No opportunities in the record yet</option></select>
      </label>
    );
  }
  return (
    <label>{label}
      <select value={value || ''} onChange={onChange}>
        <option value="">{blank}</option>
        <Dangling value={value} known={new Set(rows.map((o) => o.id))} />
        {rows.map((o) => <option key={o.id} value={o.id}>{[o.ref, o.name].filter(Boolean).join(' ')}</option>)}
      </select>
    </label>
  );
};

const Lines = ({ label, hint, value, onChange, rows = 3, placeholder }) => (
  <label>
    {label} {hint && <span style={{ fontWeight: 400 }}>({hint})</span>}
    <textarea rows={rows} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} />
  </label>
);

// THE TIE, made a control rather than a convention. A session's whole purpose is to answer
// particular questions, so choosing them is part of writing the session down, and the record can
// then say which questions nobody is scheduled to answer.
function QuestionPicker({ plan, value, onToggle }) {
  const groups = useMemo(() => (plan?.QUESTIONS || [])
    .map((g) => ({ pillar: g.pillar, items: (g.items || []).filter((q) => q.certainty !== 'known') }))
    .filter((g) => g.items.length), [plan]);
  if (!groups.length) {
    return (
      <p className="ca-note">
        This record has no open questions yet, so there is nothing for a session to answer. Add
        questions first and the session can be tied to them.
      </p>
    );
  }
  return (
    <fieldset className="rd-fieldset rd-qpick">
      <legend>Questions this session answers <span style={{ fontWeight: 400 }}>({value.length} chosen)</span></legend>
      <p className="ca-note" style={{ margin: '0 0 4px' }}>
        Questions already Known are not listed: they are stated, not asked.
      </p>
      {groups.map((g) => (
        <div key={g.pillar} className="rd-pgroup">
          <span className="rd-pgroup-l">{g.pillar}</span>
          <ul className="rd-qlist">
            {g.items.map((q) => (
              <li key={q.id}>
                <label className="rd-qrow">
                  <input type="checkbox" checked={value.includes(q.id)} onChange={() => onToggle(q.id)} />
                  <span>{q.q}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </fieldset>
  );
}

/** Which offerings a process delivers. Chips over a typed list of references, because the refs are
 *  the client's own numbering and nobody remembers whether tracking is 02 or 03. */
function OfferingPicker({ value, offerings: all, onToggle }) {
  // ⚠ THE LINK IS STORED AS THE REFERENCE, so an offering without one cannot be tied to a process
  // at all. Left in the list it was worse than absent: toggling it wrote '' (which strList drops,
  // so the process silently belonged to nothing), and `value.includes('')` lit up EVERY blank-ref
  // offering at once. Named as the fixable problem it is instead.
  const offerings = all.filter((o) => String(o.ref || '').trim());
  const noRef = all.length - offerings.length;
  if (!all.length) {
    return (
      <fieldset className="rd-fieldset">
        <legend>What it delivers</legend>
        <p className="ca-note">No offerings are recorded yet, so a process cannot be tied to one.</p>
      </fieldset>
    );
  }
  return (
    <fieldset className="rd-fieldset">
      <legend>What it delivers <span style={{ fontWeight: 400 }}>(the offerings this chain serves)</span></legend>
      <div className="rd-body">
        <div className="rd-pills">
          {offerings.map((o) => (
            <button key={o.id} type="button" className={`rd-pill${value.includes(o.ref) ? ' is-on' : ''}`}
              aria-pressed={value.includes(o.ref)} onClick={() => onToggle(o.ref)}>
              {o.ref} {o.name}
            </button>
          ))}
        </div>
        {noRef > 0 && (
          <p className="ca-note">
            {noRef} offering{noRef === 1 ? ' has' : 's have'} no reference, so nothing can be tied
            to {noRef === 1 ? 'it' : 'them'}. Give {noRef === 1 ? 'it' : 'them'} one first.
          </p>
        )}
      </div>
    </fieldset>
  );
}

/** Who somebody works with, as chips. `reportsTo` had a picker from the start and this had NOTHING,
 *  while the person page rendered it under a heading of its own — so "Works with" could only ever
 *  say "Nothing recorded". It is a set, not a line, which is why it is chips and not a select. */
/** Several people, linked. Beside a free-text list, never instead of it: the words are what
 *  somebody was told, the links are what the record can follow onto a person's own page. */
function PeopleLinks({ plan, value, label, onToggle }) {
  const rows = plan?.PEOPLE || [];
  if (!rows.length) return null;
  return (
    <fieldset className="rd-fieldset"><legend>{label}</legend>
      <div className="rd-body">
        <div className="rd-pills">
          {rows.map((n) => (
            <button key={n.id} type="button" className={`rd-pill${value.includes(n.id) ? ' is-on' : ''}`}
              aria-pressed={value.includes(n.id)} onClick={() => onToggle(n.id)}>
              {n.name}{n.role ? ` · ${n.role}` : ''}
            </button>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

/** The sittings an evidence item will be asked for in, or a hypothesis tested in. Same pill
 *  shape as the people picker, because it is the same act: naming which room this reaches. */
/** Pick real items by their names, for fields that store ids.
 *
 *  ⚠ THREE FIELDS ASKED A PERSON TO TYPE A CONTENT HASH. "Numbers it should move (KPI ids, one per
 *  line)", "What has to exist first (build ids, one per line)" and the opportunity's "numbers that
 *  would show it" were plain textareas, and an id in this record looks like `k:c31def0d`. Nobody
 *  produces that from memory, so in practice the field stays empty and the link is never made: the
 *  record quietly loses the connection the field exists to hold. The drawer already picks sessions,
 *  units, offerings and pillars this way; these three were simply never converted. */
/** A finding is a sentence, so its pill is the sentence, shortened enough to stay a pill. */
const cutLabel = (t) => { const v = String(t || '').trim(); return v.length > 64 ? `${v.slice(0, 64)}…` : v; };

function ItemPicker({ value = [], items, onToggle, label, hint, none }) {
  if (!items.length) {
    return (
      <fieldset className="rd-fieldset">
        <legend>{label}</legend>
        <p className="ca-note">{none}</p>
      </fieldset>
    );
  }
  return (
    <fieldset className="rd-fieldset">
      <legend>{label}</legend>
      {hint && <p className="rd-say">{hint}</p>}
      <div className="rd-body">
        <div className="rd-pills">
          {items.map((it) => (
            <button key={it.id} type="button" className={`rd-pill${value.includes(it.id) ? ' is-on' : ''}`}
              aria-pressed={value.includes(it.id)} onClick={() => onToggle(it.id)}>
              {it.label}
            </button>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

function SessionPicker({ value = [], sessions, onToggle, label }) {
  if (!sessions.length) {
    return (
      <fieldset className="rd-fieldset">
        <legend>{label}</legend>
        <p className="ca-note">No sessions in the record yet.</p>
      </fieldset>
    );
  }
  return (
    <fieldset className="rd-fieldset">
      <legend>{label}</legend>
      <div className="rd-body">
        <div className="rd-pills">
          {sessions.map((s) => (
            <button key={s.id} type="button" className={`rd-pill${value.includes(s.id) ? ' is-on' : ''}`}
              aria-pressed={value.includes(s.id)} onClick={() => onToggle(s.id)}>
              {[s.ref, s.name || s.person].filter(Boolean).join(' · ')}
            </button>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

function PeoplePicker({ value, people, exclude, onToggle }) {
  const rows = people.filter((n) => n.id !== exclude);
  if (!rows.length) {
    return (
      <fieldset className="rd-fieldset">
        <legend>Works with</legend>
        <p className="ca-note">Nobody else is in the record yet.</p>
      </fieldset>
    );
  }
  return (
    <fieldset className="rd-fieldset">
      <legend>Works with <span style={{ fontWeight: 400 }}>(day to day, whoever they sit with)</span></legend>
      <div className="rd-body">
        <div className="rd-pills">
          {rows.map((n) => (
            <button key={n.id} type="button" className={`rd-pill${value.includes(n.id) ? ' is-on' : ''}`}
              aria-pressed={value.includes(n.id)} onClick={() => onToggle(n.id)}>
              {n.name}{n.role ? ` · ${n.role}` : ''}
            </button>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

function PillarPicker({ value, onToggle, label = 'Pillars this touches', hint = 'one or more' }) {
  const groups = useMemo(() => {
    const out = [];
    PILLARS.forEach((p) => {
      const g = PILLAR_GROUP[p];
      let row = out.find((x) => x.group === g);
      if (!row) { row = { group: g, pillars: [] }; out.push(row); }
      row.pillars.push(p);
    });
    return out;
  }, []);
  return (
    <fieldset className="rd-fieldset">
      <legend>{label} <span style={{ fontWeight: 400 }}>({hint})</span></legend>
      <div className="rd-body">
      {groups.map((g) => (
        <div key={g.group} className="rd-pgroup">
          <span className="rd-pgroup-l">{g.group}</span>
          <div className="rd-pills">
            {g.pillars.map((p) => (
              <button key={p} type="button" className={`rd-pill${value.includes(p) ? ' is-on' : ''}`}
                aria-pressed={value.includes(p)} onClick={() => onToggle(p)}>{p}</button>
            ))}
          </div>
        </div>
      ))}
      </div>
    </fieldset>
  );
}

const asText = (v) => (Array.isArray(v) ? v.join('\n') : (v || ''));

export default function RecordDrawer({ mode, kind: initialKind, item, plan, findings = [], onSave, onRemove, onClose }) {
  const ref = useRef(null);
  // A form the practitioner opened to fill in: start them in the first field, not on Close.
  useModal(ref, true, onClose, { focusFirstField: true });
  const isDetails = mode === 'details';
  const isNorthStar = mode === 'northstar';
  const isNew = mode === 'add';
  const [kind, setKind] = useState(initialKind || 'process');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const seed = item || {};
  const eng = plan?.engagement || {};
  const [f, setF] = useState(() => (isNorthStar
    ? { words: '', saidBy: '', saidOn: '', clarity: 'unclear', gap: '', ambition: 'not yet tested', target: '', note: '', ...(plan?.NORTH_STAR || {}) }
    : isDetails
    ? { ...Object.fromEntries(DESCRIPTOR.map((k) => [k, eng[k] || ''])), outcomes: asText(plan?.OUTCOMES) }
    : {
      num: seed.num || '', group: seed.group || 'Delivery', name: seed.name || '',
      howToday: seed.howToday || '', whoRuns: seed.whoRuns || '',
      pains: asText(seed.pains), opens: asText(seed.opens), speakTo: asText(seed.speakTo),
      feeds: asText(seed.feeds),
      // ⚠ `offerings` WAS MISSING FROM HERE, and it is the one field that decides which board a
      // process appears on. "Walk this offering" seeds { offerings: [ref] } and the seed was never
      // copied into the form, so ownFields sent `undefined`, strList made it [], and the process was
      // created belonging to nothing. The action that exists to put a process on a board did the
      // opposite, silently.
      offerings: seed.offerings || [],
      // The three fields the evidence page displays under headings of their own and, until now,
      // gave nobody a way to write. "Provenance not recorded, so a finding built on this cannot say
      // how far to trust it" was printed on screen next to no field at all.
      held: seed.held || '', missing: seed.missing || '', provenance: seed.provenance || '', sessionIds: seed.sessionIds || [],
      // The evidence record's SECOND axis, and the two fields that make an outstanding item a gap
      // rather than a shopping-list entry.
      vstate: seed.vstate || 'captured',
      // A measure is only a BASELINE once somebody can say how it was calculated and what period it
      // covers. Recording the number is the easy half.
      period: seed.period || '', population: seed.population || '',
      limitations: seed.limitations || '', confidence: seed.confidence || 'moderate',
      whyItMatters: seed.whyItMatters || '', impactIfUnresolved: seed.impactIfUnresolved || '',
      route: seed.route || '', from: seed.from || '', mergedFrom: seed.mergedFrom || [],
      lead: seed.lead || '',
      // what the GITA proposed
      forWhom: seed.forWhom || '', replaces: seed.replaces || '',
      needs: asText(seed.needs), unknowns: asText(seed.unknowns), kpis: asText(seed.kpis),
      // ── a proposed build, in full ─────────────────────────────────────────────────────────
      // ⚠ A FIELD WITH NO KEY HERE IS SILENTLY DROPPED when the drawer is seeded, so editing an
      // item written by an MCP session would have blanked everything the form did not know about.
      stateWhy: seed.stateWhy || '', roi: seed.roi || '',
      options: asText(seed.options), problems: asText(seed.problems), blockers: asText(seed.blockers),
      touches: asText(seed.touches), dependsOn: asText(seed.dependsOn),
      decisions: asText((seed.decisions || []).map((d) => (typeof d === 'string' ? d
        : [d.when, d.who, d.said].filter(Boolean).join(' :: ')))),
      effort: seed.effort ?? '', impact: seed.impact ?? '',
      // ── the opportunity, and the complexity of delivering it ──────────────────────────────
      // An opportunity is where change may create value. It is deliberately NOT the design: a
      // record that already names its solution has skipped the layer where we decide whether the
      // solution is the right one.
      statement: seed.statement || '', rootCause: seed.rootCause || '',
      desiredOutcome: seed.desiredOutcome || '', potentialValue: seed.potentialValue || '',
      fromFindings: asText(seed.fromFindings), baselineRequired: !!seed.baselineRequired,
      // Which opportunity an initiative serves. One opportunity, several builds.
      opportunityId: seed.opportunityId || '',
      // Delivery complexity. `dimensions` is a list of {dimension, level, driver, implication}
      // rather than ten fixed fields, because a dimension nobody assessed is ABSENT, not Standard.
      buildId: seed.buildId || '', dimensions: seed.dimensions || [],
      interactions: asText(seed.interactions), preconditions: asText(seed.preconditions),
      risks: asText(seed.risks), uncertainty: seed.uncertainty || '',
      foundational: !!seed.foundational,
      demoKind: seed.demoKind || 'none', demoLink: seed.demoLink || '', demoNote: seed.demoNote || '',
      pillars: seed.pillars || [],
      pillar: seed.pillar || (plan?.QUESTIONS || []).find((g) => (g.items || []).some((i) => i.id === seed.id))?.pillar || 'Data',
      q: seed.q || '', certainty: seed.certainty || 'unknown', note: seed.note || '',
      item: seed.item || '', state: seed.state || KIND_STATE[initialKind] || 'missing',
      processes: asText(seed.processes),
      claim: seed.claim || '', grounds: seed.grounds || '', confirms: seed.confirms || '',
      kills: seed.kills || '', test: seed.test || '', ifWrong: seed.ifWrong || '', sessionIds: seed.sessionIds || [],
      verdict: seed.verdict || 'open', bearsOn: asText(seed.bearsOn),
      evidence: seed.evidence || '', overlaps: seed.overlaps || '', logo: seed.logo || '', source: seed.source || '',
      alias: seed.alias || '', what: seed.what || '', who: seed.who || '',
      ref: seed.ref || '', subset: seed.subset || '', why: seed.why || '', alsoPillars: seed.alsoPillars || [],
      role: seed.role || '', output: seed.output || '', notHere: asText(seed.notHere),
      steps: seed.steps || [],
      link: seed.link || '', located: seed.located || '', provenanceKind: seed.provenanceKind || '',
      unitType: seed.unitType || 'team', parent: seed.parent || '', does: seed.does || '',
      headcount: seed.headcount ?? '', unitId: seed.unitId || '', leadId: seed.leadId || '',
      side: seed.side || 'client', reportsTo: seed.reportsTo || '', worksWith: seed.worksWith || [],
      email: seed.email || '', accountEmail: seed.accountEmail || '', personId: seed.personId || '',
      // the links that sit beside a typed name
      whoRunsId: seed.whoRunsId || '', speakToIds: seed.speakToIds || [], ownerId: seed.ownerId || '',
      hours: seed.hours ?? '', fate: seed.fate || 'not decided',
      cadenceNote: seed.cadenceNote || cadenceOf(seed.cadence)[1],
      record: seed.record || '', recordNote: seed.recordNote || '',
      name: seed.name || '', person: seed.person || '', method: seed.method || '', priority: seed.priority || '', only: seed.only || '',
      scope: seed.scope || 'company', unit: seed.unit || '',
      current: seed.current ?? '', target: seed.target ?? '', direction: seed.direction || 'up',
      // Mapped on the way IN, not just on the way out. A KPI written before this vocabulary existed
      // holds free text, and a <select> with no matching option shows blank and then silently saves
      // that blank over what somebody wrote. Anything unrecognised becomes "other" with the original
      // words carried into cadenceNote, where the form can show them.
      cadence: cadenceOf(seed.cadence)[0],
      definition: seed.definition || '', measuredBy: seed.measuredBy || '',
      affectedBy: asText(seed.affectedBy),
      objectives: asText(seed.objectives), covers: seed.covers || [],
      minutes: seed.minutes ?? '', materials: asText(seed.materials),
      context: seed.context || '', opening: seed.opening || '',
      sourceType: seed.sourceType || 'person', gives: seed.gives || '',
      access: seed.access || '', owner: seed.owner || '',
    }));
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  // functional, so several clicks in one tick all land
  const toggleCover = (qid) => setF((p) => {
    const cur = p.covers || [];
    return { ...p, covers: cur.includes(qid) ? cur.filter((x) => x !== qid) : [...cur, qid] };
  });
  const togglePillar = (k) => (pillar) => setF((p) => {
    const cur = p[k] || [];
    return { ...p, [k]: cur.includes(pillar) ? cur.filter((x) => x !== pillar) : [...cur, pillar] };
  });
  const on = (k) => (e) => set(k)(e.target.value);
  /** ⚠ THIS USED TO CLEAR cadenceNote ON EVERY CHANGE, and that destroyed the client's own words on
   *  a single keystroke: a <select> fires change on every arrow-key step, so tabbing onto cadence
   *  and pressing the down arrow once wiped a stored "every third Tuesday" with no stash and no
   *  undo. Coming back to "other" showed an empty box, and saving wrote the blank over their words.
   *  The contradiction it was added to prevent (a cadence of "monthly" beside a note reading "every
   *  third Tuesday") is now refused by buildItem, which holds every writer to it rather than only
   *  the one using this form. Here the note simply stays put while somebody looks around. */
  const onCadence = on('cadence');

  const submit = async (e) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const op = isNorthStar
        ? { type: 'set_engagement', fields: { northStar: f } }
        : isDetails
        ? { type: 'set_engagement', fields: { ...Object.fromEntries(DESCRIPTOR.map((k) => [k, f[k]])), outcomes: f.outcomes } }
        // ownFields, not the whole form. One form object covers nine kinds, so submitting it
        // wholesale writes an empty string over any field the edited kind owns but this screen
        // never showed. Silent, first-edit-only, and it took `ref` and the evidence provenance
        // fields with it.
        : isNew
          ? { type: 'add', kind, fields: ownFields(kind, f) }
          : { type: 'edit', id: seed.id, kind, currentKind: kind, currentFields: seed, fields: ownFields(kind, f) };
      // Say what is wrong here, next to the field that caused it, rather than after a round trip.
      if (plan) applyOp(plan, op, (isDetails || isNorthStar) ? null : (seed.id || 'x:00000000'));
      await onSave(op);
      onClose();
    } catch (e2) { setErr(e2.message || String(e2)); setBusy(false); }
  };

  // Fall back rather than throw: a drawer with a slightly wrong heading is a blemish, a drawer that
  // crashes on open is a dead end the user cannot get out of. An acronym keeps its case, because
  // "Add kpi" reads like a typo.
  const rawName = KIND_LABEL[kind] || kind || 'item';
  const kindName = rawName === rawName.toUpperCase() ? rawName : rawName.toLowerCase();
  const title = isNorthStar ? 'The North Star' : isDetails ? 'Record details' : isNew ? `Add ${kindName}` : `Edit ${kindName}`;

  return (
    <DrawerScrim onClose={onClose}>
      {/* ⚠ A PANEL, NOT A DRAWER. This form carries up to twenty five fields for one of thirteen
          kinds, and a 440px column down the right edge turns that into a mile of scrolling with
          two words of context per line. It is the same fields on a surface that can hold them: a
          panel over the record rather than a strip beside it, wide enough to put short fields in
          pairs and prose across the full width.
          ⚠ `rd-modal` and NOT a change to `.ca-drawer`: that class is the whole admin's drawer,
          used by the catalogue, the order manager and the client manager, none of which asked for
          this. The scrim centres itself only when it contains one of these. */}
      <form ref={ref} tabIndex={-1} className="ca-drawer rd-drawer rd-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit} role="dialog" aria-modal="true" aria-label={title}>
        <div className="rd-modal-head">
          <h2>{title}</h2>
          <button type="button" className="rd-modal-x" onClick={onClose} aria-label="Close without saving">
            &times;
          </button>
        </div>

        {/* ⚠ THE ONLY THING THAT SCROLLS. The title and the actions stay put, because on a form
            this long losing the heading means losing which of thirteen kinds you are filling in,
            and losing Save means hunting for it at the bottom of a mile of fields. */}
        <div className="rd-modal-body">

        {isNorthStar ? (
          <>
            <p className="ca-note" style={{ marginTop: -2 }}>
              Where the chief executive says the business is going, in their own words. This is the
              minimum the target state has to beat, so it is captured before anything is proposed.
            </p>
            {/* Verbatim, and labelled as such. A vision we have tidied up is our vision. */}
            <label>Their words, exactly as they said them
              <textarea rows="5" value={f.words} onChange={on('words')} required
                placeholder="Paste or type what they actually said. Do not tidy it up: the point is that it is theirs." /></label>
            <div className="rd-row">
              <label style={{ flex: 1 }}>Who said it<input value={f.saidBy} onChange={on('saidBy')} placeholder="A name, or their role" /></label>
              <label style={{ flex: '0 0 150px' }}>When<input value={f.saidOn} onChange={on('saidOn')} placeholder="21 August 2026" /></label>
            </div>
            <label>How clear it is
              <select value={f.clarity} onChange={on('clarity')}>
                {CLARITY.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>What is still not clear <span style={{ fontWeight: 400 }}>(the thing to put back to them)</span>
              <textarea rows="3" value={f.gap} onChange={on('gap')}
                placeholder="If anything is not clear, it has not been thought through properly. Say what." /></label>
            <label>Does the ambition match the business
              <select value={f.ambition} onChange={on('ambition')}>
                {AMBITION_FIT.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label>What we intend to leave them with <span style={{ fontWeight: 400 }}>(it has to EXCEED their words)</span>
              <textarea rows="4" value={f.target} onChange={on('target')}
                placeholder="The target state. Not a restatement of their vision: a better one." /></label>
            <label>Note<textarea rows="2" value={f.note} onChange={on('note')} /></label>
          </>
        ) : isDetails ? (
          <>
            <p className="ca-note" style={{ marginTop: -2 }}>
              Who this record is for, and what it has to deliver. Client, title, stage and access
              cannot be left blank: the record could not be opened again without them.
            </p>
            <label>Client<input value={f.client} onChange={on('client')} required /></label>
            <label>Title<input value={f.title} onChange={on('title')} placeholder="Client record" required /></label>
            <label>Sponsor <span style={{ fontWeight: 400 }}>(the named person accountable on their side)</span><input value={f.sponsor} onChange={on('sponsor')} /></label>
            <label>Stage<input value={f.stage} onChange={on('stage')} placeholder="Greatstone Deep Dive" required /></label>
            <label>Follows <span style={{ fontWeight: 400 }}>(what preceded this)</span><input value={f.follows} onChange={on('follows')} /></label>
            <label>Access<input value={f.access} onChange={on('access')} placeholder="Commitment in principle" required /></label>
            <label>Access note<textarea rows="2" value={f.accessNote} onChange={on('accessNote')} /></label>
            <label>Lead line <span style={{ fontWeight: 400 }}>(one sentence, shown under the title)</span><textarea rows="2" value={f.lead} onChange={on('lead')} /></label>
            <Lines label="Outcomes" hint="one per line, what this has to deliver" value={f.outcomes} onChange={set('outcomes')} rows={5} />
          </>
        ) : (
          <>
            {/* ⚠ ONLY WHEN THE PICKER CAN REPRESENT WHAT IS BEING ADDED. Two kinds are deliberately
                absent from the groups above because they are never started from the generic Add
                flow: a complexity is assessed against an initiative, an opportunity is raised from
                one. Rendering the picker anyway gave those two a row of thirteen buttons with NONE
                of them selected, above a form for a fourteenth thing: a control that cannot show
                the current state and offers only ways to leave it. Nothing to pick means no
                picker, and the blurb below still says what is being added. */}
            {isNew && PICKABLE.has(kind) && (
              <div className="rd-kindpick" role="group" aria-label="What are you adding?">
                {KIND_GROUPS.map((g) => (
                  <div className="rd-kindgrp" key={g.label}>
                    <span className="rd-kindgrp-l" aria-hidden="true">{g.label}</span>
                    <div className="rd-kinds">
                      {g.kinds.map((k) => (
                        <button key={k} type="button" className={`rd-kind${kind === k ? ' is-on' : ''}`}
                          aria-pressed={kind === k}
                          aria-label={`${KIND_LABEL[k]}, in ${g.label}`}
                          onClick={() => { setKind(k); if (KIND_STATE[k]) set('state')(KIND_STATE[k]); }}>
                          {KIND_LABEL[k]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="rd-kindsay">{KIND_BLURB[kind]}</p>

            {kind === 'process' && (
              <>
                <Grp title="What this part of the business is" hint="The least we need before it can be saved.">
                  <div className="rd-row">
                    <label style={{ flex: '0 0 88px' }}>Number<input value={f.num} onChange={on('num')} placeholder="01" inputMode="numeric" /></label>
                    <label style={{ flex: 1 }}>Band<input value={f.group} onChange={on('group')} placeholder="Delivery" /></label>
                  </div>
                  <label>Name<input value={f.name} onChange={on('name')} placeholder="What this part of the business is called" required /></label>
                  <label>How it works today<textarea rows="4" value={f.howToday} onChange={on('howToday')} placeholder="What actually happens, in their words." required /></label>
                </Grp>
                <Grp title="Who runs it and who we speak to" hint="The words somebody said, and beside them the person the record can follow.">
                  <label>Who runs it<input value={f.whoRuns} onChange={on('whoRuns')} placeholder="A named role, and how many people sit under it." /></label>
                  {/* ⚠ THE NAME ABOVE IS WHAT SOMEBODY TYPED; THIS IS WHAT THE RECORD CAN FOLLOW.
                      Both, never one instead of the other: a picker in place of the text is how a
                      name matching nobody gets silently blanked. Linking is also what makes a
                      person's own page able to answer "what are they on the hook for?" */}
                  <PersonPicker plan={plan} value={f.whoRunsId} onChange={on('whoRunsId')}
                    label="…and who that is in the organisation" blank="Not linked to anybody yet" />
                  <Lines label="Who we speak to" hint="one per line" value={f.speakTo} onChange={set('speakTo')} />
                  <PeopleLinks plan={plan} value={f.speakToIds || []} label="…and which of them are in the organisation"
                    onToggle={(id) => setF((p2) => ({ ...p2,
                      speakToIds: (p2.speakToIds || []).includes(id)
                        ? p2.speakToIds.filter((x) => x !== id) : [...(p2.speakToIds || []), id] }))} />
                </Grp>
                <Grp title="What it touches" hint="The part of the business that runs it, what it delivers, and what it hands on.">
                  <UnitPicker plan={plan} value={f.unitId} onChange={on('unitId')} label="Which part of the business runs it" />
                  <OfferingPicker value={f.offerings} offerings={plan?.OFFERINGS || []}
                    onToggle={togglePillar('offerings')} />
                  <Lines label="Hands its work to" hint="process numbers, one per line. This is what draws the flow"
                    value={f.feeds} onChange={set('feeds')} rows={2} />
                  <PillarPicker value={f.pillars} onToggle={togglePillar('pillars')} />
                </Grp>
                <Grp title="What hurts and what is still open" hint="What they have already told us, and what we go and establish.">
                  <Lines label="Already named" hint="one per line, what they have told us hurts" value={f.pains} onChange={set('pains')} />
                  <Lines label="What we establish" hint="one per line, what we go and find out" value={f.opens} onChange={set('opens')} />
                </Grp>
                {/* steps, x and y are held on the record and moved on the process page's own
                    canvas, never typed here: position is layout, not a claim. */}
              </>
            )}

            {kind === 'question' && (
              <>
                <Grp title="The question we have to answer" hint="The pillar it sits under, and what we are actually asking.">
                  <label>Pillar
                    <select value={f.pillar} onChange={on('pillar')}>
                      {PILLARS.map((p) => <option key={p} value={p}>{p} ({PILLAR_GROUP[p]})</option>)}
                    </select>
                  </label>
                  {/* ⚠ `ref` is the number the PLAN and the CLIENT call this question, Q34. The
                      schema names it as the loss that motivated ownFields. */}
                  <label>Reference<input value={f.ref} onChange={on('ref')} placeholder="Q34" /></label>
                  <label>The question<textarea rows="3" value={f.q} onChange={on('q')} placeholder="Something this record has to answer" required /></label>
                  {/* Displayed on the question page, and until now settable nowhere. */}
                  <label>Only for <span style={{ fontWeight: 400 }}>(a segment, a region, one offering)</span>
                    <input value={f.subset} onChange={on('subset')} placeholder="Leave blank if it is about the whole business" /></label>
                </Grp>
                <Grp title="What we already know" hint="Known and Indicated are claims, so both need what we hold written down.">
                  <label>Certainty
                    <select value={f.certainty} onChange={on('certainty')}>
                      {CERTAINTY_IDS.map((c) => <option key={c} value={c}>{CERTAINTY[c].label} · {CERTAINTY[c].verb}</option>)}
                    </select>
                  </label>
                  <label>
                    What is already established {f.certainty === 'unknown'
                      ? <span style={{ fontWeight: 400 }}>(optional while this is Unknown)</span>
                      : <span className="rd-req">required for {CERTAINTY[f.certainty].label}</span>}
                    <textarea rows="3" value={f.note} onChange={on('note')}
                      placeholder="What we already hold, and where it came from." />
                  </label>
                  {f.certainty !== 'unknown' && (
                    <p className="ca-note" style={{ marginTop: -6 }}>
                      Marking this {CERTAINTY[f.certainty].label} means we do not ask the client again. Say what we already hold.
                    </p>
                  )}
                </Grp>
                <Grp title="What it touches" hint="The processes it is about, and the question it came out of.">
                  {/* The home pillar is chosen above and is part of the question's identity; these
                      are the OTHER pillars it also belongs under, so every pillar view finds it. */}
                  <PillarPicker value={f.alsoPillars} onToggle={togglePillar('alsoPillars')}
                    label="Also belongs under" hint="the other pillars this question speaks to" />
                  {/* Everything revolves around a process. A question tied to none is a question
                      about the company in general, and those are the ones that go unanswered. */}
                  <Lines label="Which processes it is about" hint="process numbers, one per line"
                    value={f.processes} onChange={set('processes')} rows={2} />
                  {/* The question this one followed from. Rendered BOTH ways on the question page,
                      "what it led to" and the parent link, and creatable only by an MCP session. */}
                  {/* ⚠ A SELECT WITH NO MATCHING OPTION SHOWS THE FIRST ONE AND LIES.
                      If the question this followed from was reworded (re-minted) or removed, `from`
                      holds a dead id: the browser renders "Nothing, this was asked on its own" while
                      the form state still carries the id and re-submits it verbatim. That is the
                      fourth time this exact shape has appeared in this build, so the dead value gets
                      an option of its own and says what it is.
                      Cycles: a question already pointing AT this one is excluded, so A→B→A cannot be
                      built from the form. */}
                  <label>It followed from
                    <select value={f.from || ''} onChange={on('from')}>
                      <option value="">Nothing, this was asked on its own</option>
                      {/* ⚠ `known` MUST BE THE LIST THAT IS ACTUALLY OFFERED, not every question in
                          the plan. Built from the unfiltered set, a `from` sitting in the gap the
                          filter creates got NEITHER a real option NOR a Dangling one — so the select
                          showed "Nothing, this was asked on its own" and resubmitted the id verbatim,
                          which is the exact failure Dangling exists to prevent.
                          ⚠ And `q.from === seed.id` is `undefined === undefined` on ADD, which is TRUE
                          for any question object with no `from` key — emptying the whole dropdown on a
                          plan authored outside buildItem. Guarded on seed.id. */}
                      {(() => {
                        const all = (plan?.QUESTIONS || []).flatMap((g) => (g.items || [])
                          .map((q) => ({ q, pillar: g.pillar })));
                        // What may be CHOSEN excludes this question and its direct children, because
                        // either would be a loop. What COUNTS AS KNOWN is the whole record.
                        // ⚠ Built from the offered list, `Dangling` said "Not in this record any more,
                        // it was removed" about a question sitting three rows below it in the same
                        // select: the exclusions made a live question look deleted.
                        const offer = all.filter(({ q }) => !(seed.id && (q.id === seed.id || q.from === seed.id)));
                        return (
                          <>
                            <Dangling value={f.from} known={new Set(all.map(({ q }) => q.id))} />
                            {offer.map(({ q, pillar }) => (
                              <option key={q.id} value={q.id}>{pillar} &middot; {q.q.slice(0, 70)}</option>
                            ))}
                          </>
                        );
                      })()}
                    </select>
                  </label>
                </Grp>
                <Grp title="The route to an answer" hint="Most of these need nobody's diary. Say the route, and what changes once we know.">
                  {/* Eight values, and what lets the record say "38 of 49 of these need nobody's
                      diary" rather than treating every question as a meeting. */}
                  <label>How it gets answered
                    <select value={f.route} onChange={on('route')}>
                      <option value="">Not decided</option>
                      {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                  {/* `why` is what lets a question be dropped honestly. */}
                  <label>Why it matters<input value={f.why} onChange={on('why')} placeholder="What changes once we know" /></label>
                </Grp>
              </>
            )}

            {kind === 'evidence' && (
              <>
                <Grp title="What it is, and whether we hold it" hint="The document, dataset or system, and where it stands.">
                  <label>What we need<input value={f.item} onChange={on('item')} placeholder="A document, dataset or system" required /></label>
                  <label>Do we have it
                    <select value={f.state} onChange={on('state')}>
                      {EVIDENCE_STATE_IDS.map((s) => <option key={s} value={s}>{EVIDENCE_STATE[s].label} · {EVIDENCE_STATE[s].blurb}</option>)}
                    </select>
                  </label>
                  {/* ⚠ THE SECOND AXIS, and it only exists once something is in hand. Holding a
                      document and having actually weighed it are different facts, and until now both
                      read as "Held", so a finding resting on an unread export looked as sound as one
                      resting on a reviewed system record. The control disappears rather than
                      greying out, because a validation status on evidence nobody has provided is a
                      claim about thin air. */}
                  {HOLDS_SOMETHING.has(f.state) ? (
                    <label>Have we assessed it
                      <select value={f.vstate} onChange={on('vstate')}>
                        {EVIDENCE_VSTATE_IDS.map((v) => (
                          <option key={v} value={v}>{EVIDENCE_VSTATE[v].label} · {EVIDENCE_VSTATE[v].blurb}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <p className="rd-hint">{canReview({ state: f.state }).why}</p>
                  )}
                </Grp>
                <Grp title="What we hold, and what is missing" hint="Split honestly: in our hands, asked for and not got.">
                  <label>Detail<textarea rows="3" value={f.note} onChange={on('note')} placeholder="What we hold, and what is still missing." /></label>
                  {/* The three-way split the evidence page is built around. It rendered all three and
                      offered a field for none of them, so the page could tell you provenance was
                      missing and give you nowhere to put it. */}
                  <label>What we hold<textarea rows="2" value={f.held} onChange={on('held')}
                    placeholder="What is actually in our hands right now." /></label>
                  <label>What is still missing<textarea rows="2" value={f.missing} onChange={on('missing')}
                    placeholder="What we asked for and have not got." /></label>
                  {/* An outstanding item with no stated consequence cannot be prioritised against
                      the next one, so chasing order ends up being whoever asked most recently. */}
                  <label>Why it matters<textarea rows="2" value={f.whyItMatters} onChange={on('whyItMatters')}
                    placeholder="What this would let us establish that nothing else can." /></label>
                  <label>What happens if we never get it<textarea rows="2" value={f.impactIfUnresolved} onChange={on('impactIfUnresolved')}
                    placeholder="Which conclusion stays unsupported, and how far that limits the assessment." /></label>
                  <label>Link to it <span style={{ fontWeight: 400 }}>(once we hold it)</span>
                    <input value={f.link} onChange={on('link')} type="url" inputMode="url" placeholder="https://…" /></label>
                </Grp>
                <Grp title="How we know it" hint="Told and measured are different claims.">
                  {/* ⚠ BOTH CONTROLS HERE WERE LABELLED "How we know it", the group's own words,
                      so the panel would have said the same sentence three times in a row. The
                      heading absorbs the idea; the controls differentiate. */}
                  <label>Told, or measured
                    <select value={f.provenanceKind} onChange={on('provenanceKind')}>
                      <option value="">Not recorded</option>
                      {PROVENANCE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </label>
                  <label>Who showed us, and in what
                    <textarea rows="2" value={f.provenance} onChange={on('provenance')}
                      placeholder="Who showed us, when, and in what. Without this a finding cannot say how far to trust it." /></label>
                </Grp>
                <Grp title="What it touches" hint="The process numbers this evidence speaks to.">
                  <SessionPicker value={f.sessionIds || []} sessions={plan?.SESSIONS || []}
                    onToggle={togglePillar('sessionIds')} label="Asked for in" />
                  <Lines label="Bears on which processes" hint="numbers, one per line, e.g. 01" value={f.processes} onChange={set('processes')} rows={2} />
                </Grp>
              </>
            )}

            {kind === 'kpi' && (
              <>
                <Grp title="What the number is and whose it is" hint="The minimum to save it, and the person and team it belongs to.">
                  <label>Name<input value={f.name} onChange={on('name')} placeholder="What the number is called" required /></label>
                  <div className="rd-row">
                    <label style={{ flex: 1 }}>Whose number
                      <select value={f.scope} onChange={on('scope')}>
                        {KPI_SCOPES.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </label>
                    <label style={{ flex: 1 }}>Owned by<input value={f.owner} onChange={on('owner')} placeholder="A role, or a name" /></label>
                  </div>
                  <PersonPicker plan={plan} value={f.ownerId} onChange={on('ownerId')}
                    label="…and who that is in the organisation" blank="Not linked to anybody yet" />
                  {/* ⚠ THIS WAS A HAND COPY OF UnitPicker, forty lines from the original — so it
                      missed the guard the original just gained, and a KPI whose unit had been removed
                      read as "Not assigned" while still holding the dead id. Use the component. */}
                  <UnitPicker plan={plan} value={f.unitId} onChange={on('unitId')}
                    label="Which part of the business" />
                </Grp>
                <Grp title="Where it stands today" hint="The reading now, what they are aiming at, and which way is better.">
                  <div className="rd-row">
                    <label style={{ flex: 1 }}>Now<input value={f.current} onChange={on('current')} inputMode="decimal" placeholder="16" /></label>
                    <label style={{ flex: 1 }}>Target<input value={f.target} onChange={on('target')} inputMode="decimal" placeholder="20" /></label>
                    <label style={{ flex: 1 }}>Unit<input value={f.unit} onChange={on('unit')} placeholder="per day" /></label>
                  </div>
                  <label>Better when it goes
                    <select value={f.direction} onChange={on('direction')}>
                      {KPI_DIRECTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </label>
                </Grp>
                <Grp title="How the number is arrived at" hint="How it is worked out, what it is read from, and how often.">
                  <label>How it is calculated<textarea rows="2" value={f.definition} onChange={on('definition')} placeholder="In their terms, not ours." /></label>
                  <label>Where the number comes from<input value={f.measuredBy} onChange={on('measuredBy')} placeholder="A system, a report, a spreadsheet" /></label>
                  {/* ⚠ WITHOUT THESE TWO A NUMBER CANNOT BE COMPARED TO A LATER ONE. A baseline of
                      8.4 days and a post-implementation 2.7 days that counted different months, or
                      a different caseload, is not a 68% improvement: it is two numbers. This is
                      where benefits realisation normally dies, so the record asks for them. */}
                  <label>What period it covers<input value={f.period} onChange={on('period')}
                    placeholder="July to September 2026. Not a season, an exceptional month or a part-year." /></label>
                  <label>What is counted <span style={{ fontWeight: 400 }}>(and what is not)</span>
                    <textarea rows="2" value={f.population} onChange={on('population')}
                      placeholder="Which cases, which teams, which sites. Name the exclusions: they are what a later comparison trips on." /></label>
                  <div className="rd-row">
                    <label style={{ flex: '0 0 180px' }}>How far it can be relied on
                      <select value={f.confidence} onChange={on('confidence')}>
                        {MEASURE_CONFIDENCE.map((c) => (
                          <option key={c} value={c}>{c} · {MEASURE_CONFIDENCE_MEANS[c]}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ flex: 1 }}>What limits it
                      <input value={f.limitations} onChange={on('limitations')}
                        placeholder="Seasonality, an exceptional event, incomplete data" /></label>
                  </div>
                  {/* Categorical, so it can be filtered and grouped. "Other" keeps the odd cadence
                      rather than forcing it, and what was typed is stored beside it. */}
                  <div className="rd-row">
                    <label style={{ flex: 1 }}>How often it is measured
                      <select value={f.cadence} onChange={onCadence}>
                        <option value="">Not recorded</option>
                        {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    {f.cadence === 'other' && (
                      <label style={{ flex: 1 }}>In their words
                        <input value={f.cadenceNote} onChange={on('cadenceNote')} placeholder="e.g. every third Tuesday" /></label>
                    )}
                  </div>
                </Grp>
                <Grp title="What it touches" hint="The processes, questions and other numbers that move it, and the streams it sits in.">
                  <Lines label="What moves it" hint="ids of processes, questions or other KPIs, one per line"
                    value={f.affectedBy} onChange={set('affectedBy')} rows={3} />
                  <p className="ca-note" style={{ marginTop: -6 }}>
                    Linking a KPI to what affects it is what turns the record into a model rather than a list.
                    An id that matches nothing is refused.
                  </p>
                  <PillarPicker value={f.pillars} onToggle={togglePillar('pillars')} />
                </Grp>
              </>
            )}

            {kind === 'session' && (
              <>
                <Grp title="What this session is for, and who is in it" hint="A session is named for what it establishes. Several people can be in the room.">
                  <label>What it exists to establish<input value={f.name} onChange={on('name')}
                    placeholder="The purpose that names this session" /></label>
                  <label>Who is in the room<input value={f.person} onChange={on('person')} placeholder="Names or roles, in words" required /></label>
                  <div className="rd-row">
                    <label style={{ flex: 1 }}>How it is run
                      <select value={f.method} onChange={on('method')}>
                        <option value="">Not decided</option>
                        {SESSION_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </label>
                    <label style={{ flex: 1 }}>Priority
                      <select value={f.priority} onChange={on('priority')}>
                        <option value="">Not set</option>
                        {SESSION_PRIORITIES.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </label>
                  </div>
                  <PersonPicker plan={plan} value={f.personId} onChange={on('personId')}
                    label="Who this session is with" blank="Not linked to anybody in the record" />
                  {/* S3, and why this person rather than another. Both stored, neither settable. */}
                  <div className="rd-row">
                    <label style={{ flex: '0 0 96px' }}>Reference<input value={f.ref} onChange={on('ref')} placeholder="S3" /></label>
                    <label style={{ flex: 1 }}>Why them<input value={f.role} onChange={on('role')} placeholder="What only this person can answer" /></label>
                  </div>
                  <label>What only they can give<textarea rows="2" value={f.only} onChange={on('only')} placeholder="The thing nobody else in the business can tell us." /></label>
                  <label>Who they are <span style={{ fontWeight: 400 }}>(context for the practitioner)</span>
                    <textarea rows="2" value={f.context} onChange={on('context')} placeholder="How to approach them, and anything that shapes the conversation." /></label>
                </Grp>
                <Grp title="What this session has to get through" hint="The questions it is set to answer, and the ones it deliberately leaves alone.">
                  <Lines label="What this session has to achieve" hint="one objective per line" value={f.objectives} onChange={set('objectives')} rows={3} />
                  <QuestionPicker plan={plan} value={f.covers} onToggle={toggleCover} />
                  {/* ⚠ This is what stops the same question being put to four people, and it had no
                      control anywhere — so the one thing the plan uses to protect somebody's time
                      could only be set by an MCP session. */}
                  <Lines label="Not to be raised here" hint="one per line, put to somebody else, or already settled"
                    value={f.notHere} onChange={set('notHere')} rows={2} />
                </Grp>
                <Grp title="What to have ready on the day" hint="What a practitioner needs in front of them when they walk in.">
                  <div className="rd-row">
                    <label style={{ flex: '0 0 120px' }}>Length
                      <input type="number" min="5" max="480" step="5" value={f.minutes} onChange={on('minutes')} placeholder="45" /></label>
                    <label style={{ flex: 1 }}>How to open <span style={{ fontWeight: 400 }}>(optional)</span>
                      <input value={f.opening} onChange={on('opening')} placeholder="The first thing you say" /></label>
                  </div>
                  <Lines label="Bring with you" hint="one per line" value={f.materials} onChange={set('materials')} rows={2} />
                </Grp>
                <Grp title="What it touches" hint="Where this sits against the rest of the record.">
                  <UnitPicker plan={plan} value={f.unitId} onChange={on('unitId')} label="Which part of the business they sit in" />
                  <Lines label="Which processes it walks" hint="process numbers, one per line"
                    value={f.processes} onChange={set('processes')} rows={2} />
                  <PillarPicker value={f.pillars} onToggle={togglePillar('pillars')}
                    label="Pillars this session covers" hint="cover everything they can speak to, in one sitting" />
                </Grp>
                <Grp title="Where the record of it will live" hint="Empty until it has been run. A finding is only checkable if somebody can open this.">
                  <label>The record of it <span style={{ fontWeight: 400 }}>(the transcript, the notes, the recording)</span>
                    <input value={f.record} onChange={on('record')} type="url" inputMode="url"
                      placeholder="https://…  so every answer can be traced back to what was said" /></label>
                  <label>Or where the record lives<input value={f.recordNote} onChange={on('recordNote')}
                    placeholder="When there is no link" /></label>
                </Grp>
              </>
            )}

            {kind === 'source' && (
              <>
                <Grp title="What this source is" hint="A name is the only thing that cannot be left blank.">
                  <label>Name<input value={f.name} onChange={on('name')} placeholder="What this source is called" required /></label>
                  <label>Kind
                    <select value={f.sourceType} onChange={on('sourceType')}>
                      {SOURCE_TYPES.map((t2) => <option key={t2} value={t2}>{t2}</option>)}
                    </select>
                  </label>
                  <label>What it can tell us<textarea rows="3" value={f.gives} onChange={on('gives')} placeholder="The information this source holds." /></label>
                </Grp>
                <Grp title="What it takes to get to it" hint="Who has to say yes, and what saying yes involves.">
                  <label>Access <span style={{ fontWeight: 400 }}>(how we reach it, and what that needs)</span>
                    <input value={f.access} onChange={on('access')} placeholder="Read-only login, an export, an introduction" /></label>
                  <label>Who controls it<input value={f.owner} onChange={on('owner')} placeholder="Whose permission is needed" /></label>
                  <PersonPicker plan={plan} value={f.ownerId} onChange={on('ownerId')}
                    label="…and who that is in the organisation" blank="Not linked to anybody yet" />
                </Grp>
                <Grp title="Where it actually lives" hint="A link when it has a web address, a place when it does not.">
                  <label>Link <span style={{ fontWeight: 400 }}>(the page, the document, the dashboard)</span>
                    <input value={f.link} onChange={on('link')} type="url" inputMode="url"
                      placeholder="https://…  anything a click can open" /></label>
                  <label>Or where it lives <span style={{ fontWeight: 400 }}>(when there is no web address)</span>
                    <input value={f.located} onChange={on('located')} placeholder="A shared drive, a filing cabinet, a person's laptop" /></label>
                </Grp>
                <Grp title="What it touches" hint="Which parts of the business this source can speak to.">
                  <PillarPicker value={f.pillars} onToggle={togglePillar('pillars')} label="Pillars this bears on" />
                </Grp>
              </>
            )}

            {kind === 'hypothesis' && (
              <>
                <Grp title="The claim, what would kill it, what would confirm it" hint="A claim with no falsifier is an opinion, so the killer is required while it is open.">
                  <div className="rd-row">
                    <label style={{ flex: '0 0 96px' }}>Reference<input value={f.ref} onChange={on('ref')} placeholder="H01" /></label>
                    <label style={{ flex: 1 }}>Group<input value={f.group} onChange={on('group')} placeholder="What kind of claim this is" /></label>
                  </div>
                  <label>The claim<textarea rows="3" value={f.claim} onChange={on('claim')} placeholder="What we think is true and have not yet tested." required /></label>
                  <label>What would KILL it <span style={{ fontWeight: 400 }}>(required while it is open)</span>
                    <textarea rows="2" value={f.kills} onChange={on('kills')} placeholder="The finding that would disprove it. A claim with no falsifier is an opinion." /></label>
                  <label>What would confirm it<textarea rows="2" value={f.confirms} onChange={on('confirms')} /></label>
                </Grp>
                <Grp title="What we hold, and how we test it" hint="The grounds behind it, and the test itself.">
                  <label>What makes us think so<textarea rows="2" value={f.grounds} onChange={on('grounds')} placeholder="What we already hold that points this way." /></label>
                  <label>How we test it<textarea rows="2" value={f.test} onChange={on('test')} /></label>
                </Grp>
                <Grp title="What it touches" hint="The records it would change, and the pillars it sits in.">
                  <SessionPicker value={f.sessionIds || []} sessions={plan?.SESSIONS || []}
                    onToggle={togglePillar('sessionIds')} label="Tested in" />
                  <Lines label="What it bears on" hint="ids, one per line" value={f.bearsOn} onChange={set('bearsOn')} />
                  <PillarPicker value={f.pillars} onToggle={togglePillar('pillars')} label="Pillars this bears on" />
                </Grp>
                <Grp title="Where it stands, and what changes" hint="The verdict, and what the plan does if this turns out to be false.">
                  <label>Verdict
                    <select value={f.verdict} onChange={on('verdict')}>
                      {HYPOTHESIS_VERDICTS.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </label>
                  <label>What changes if it is wrong<textarea rows="2" value={f.ifWrong} onChange={on('ifWrong')} /></label>
                </Grp>
              </>
            )}

            {kind === 'opportunity' && (
              <>
                <Grp title="Where change could create value" hint="An opportunity is where meaningful change may create value. It is NOT the design: naming the solution here skips the layer where we decide whether that solution is the right one.">
                  <div className="rd-row">
                    <label style={{ flex: '0 0 96px' }}>Reference<input value={f.ref} onChange={on('ref')} placeholder="Y01" /></label>
                    <label style={{ flex: 1 }}>Name<input value={f.name} onChange={on('name')} placeholder="Redesign the onboarding capability" required /></label>
                  </div>
                  <label>The opportunity<textarea rows="3" value={f.statement} onChange={on('statement')}
                    placeholder="Where meaningful change may create value, grounded in what the findings established." /></label>
                  <label>Root cause<textarea rows="2" value={f.rootCause} onChange={on('rootCause')}
                    placeholder="Why it is happening, not what it looks like. Leave blank rather than manufacture one." /></label>
                </Grp>
                <Grp title="What has to get better" hint="The outcome is required: without one this is an observation, not an opportunity.">
                  <label>Desired outcome<textarea rows="2" value={f.desiredOutcome} onChange={on('desiredOutcome')}
                    placeholder="What needs to become materially better. Not the solution." required /></label>
                  <label>Potential value<textarea rows="2" value={f.potentialValue} onChange={on('potentialValue')}
                    placeholder="Capacity, cost, speed, quality, risk. Proportionate to the evidence held." /></label>
                </Grp>
                <Grp title="What points here, and what would show it moved" hint="Several findings may point at ONE opportunity. That is why this is a record with an id rather than a sentence written on each finding.">
                  {/* ⚠ A finding's id is a TIMESTAMP (`f:2026091423110101`). Asking for it by hand
                      was asking for something nobody can produce, so the field stayed empty and the
                      link the opportunity exists to carry was never made. The findings come from
                      the state document rather than the plan, which is the only reason this one was
                      still a textarea when sessions, units and offerings already had pickers. */}
                  <ItemPicker label="Findings that point here" value={f.fromFindings}
                    onToggle={togglePillar('fromFindings')}
                    items={(findings || []).map((x) => ({ id: x.id, label: cutLabel(x.text) }))}
                    none="Nothing has been established yet, so no finding can point here." />
                  <label className="rd-check">
                    <input type="checkbox" checked={f.baselineRequired} onChange={(e) => set('baselineRequired')(e.target.checked)} />
                    A measurable baseline is needed before anyone can claim this moved
                  </label>
                  <ItemPicker label="The numbers that would show it" value={f.kpis} onToggle={togglePillar('kpis')}
                    items={(plan?.KPIS || []).map((k) => ({ id: k.id, label: [k.scope, k.name].filter(Boolean).join(' · ') }))}
                    none="No numbers in the record yet." />
                  <PillarPicker value={f.pillars} onToggle={togglePillar('pillars')} label="Pillars this sits in" />
                </Grp>
                <Grp title="Where it stands" hint="Draft, then refined against the evidence, then validated.">
                  <label>State
                    <select value={f.state} onChange={on('state')}>
                      {OPPORTUNITY_STATES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </label>
                  <label>Note<textarea rows="2" value={f.note} onChange={on('note')} /></label>
                </Grp>
              </>
            )}

            {kind === 'complexity' && (
              <>
                <Grp title="Which initiative this assesses" hint="What makes the transformation hard to IMPLEMENT. Not how much investigation the Deep Dive needs, and not what the work is worth.">
                  <BuildPicker plan={plan} value={f.buildId} onChange={on('buildId')} label="The initiative" blank="Pick one" />
                </Grp>
                <Grp title="The dimensions that matter here" hint="Assess only what is relevant: a dimension nobody assessed is ABSENT, not Standard. A level with no driver and no implication is noise, so both are required.">
                  <Lines label="Dimensions"
                    hint="one per line: dimension :: standard|elevated|significant :: what drives it :: what we do differently"
                    value={f.dimensions} onChange={set('dimensions')} />
                  <p className="rd-hint">Dimensions: {COMPLEXITY_DIMENSIONS.join(' · ')}</p>
                </Grp>
                <Grp title="Where factors compound" hint="Legacy technology plus poor data plus multiple integrations plus a regulated environment is not the sum of four problems.">
                  <Lines label="Interactions" hint="one per line" value={f.interactions} onChange={set('interactions')} />
                  <Lines label="Risks" hint="one per line" value={f.risks} onChange={set('risks')} />
                </Grp>
                <Grp title="What would make this easier" hint="Complexity is not fixed. Resolving a dependency FIRST can move a Significant to Standard, which drives sequencing rather than merely warning about cost.">
                  <Lines label="Preconditions" hint="one per line" value={f.preconditions} onChange={set('preconditions')} />
                  <label>What is still not known<textarea rows="2" value={f.uncertainty} onChange={on('uncertainty')}
                    placeholder="Kept visible at every stage rather than resolved by assumption." /></label>
                </Grp>
                <Grp title="Where it stands" hint="Initial, refined once the design is clearer, then validated.">
                  <label>State
                    <select value={f.state} onChange={on('state')}>
                      {COMPLEXITY_STATES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </label>
                  <label>Note<textarea rows="2" value={f.note} onChange={on('note')} /></label>
                </Grp>
              </>
            )}

            {kind === 'competitor' && (
              <>
                <Grp title="Who they are" hint="A name is enough to save. The overlap is the ground being contested.">
                  <label>Name<input value={f.name} onChange={on('name')} placeholder="What they are called" required /></label>
                  <label>Their mark <span style={{ fontWeight: 400 }}>(a URL, never an uploaded file)</span>
                    <input value={f.logo} onChange={on('logo')} type="url" inputMode="url"
                      placeholder="https://…  their logo or favicon. Blank renders as a lettermark." /></label>
                  <label>Where they meet the client<textarea rows="2" value={f.overlaps} onChange={on('overlaps')} /></label>
                </Grp>
                <Grp title="What we found and how it can be checked" hint="What was established, and where somebody else can go and look.">
                  <label>What we found<textarea rows="3" value={f.evidence} onChange={on('evidence')} placeholder="What we actually established, not what we assume." /></label>
                  <label>Where we found it <span style={{ fontWeight: 400 }}>(so it can be checked)</span>
                    <input value={f.source} onChange={on('source')} placeholder="The site, the filing, the person who told us" /></label>
                </Grp>
              </>
            )}

            {kind === 'task' && (
              <>
                <Grp title="What they actually do" hint="One thing, in their words. Not a job title: an actual activity.">
                  <label>What they do<textarea rows="2" value={f.what} onChange={on('what')}
                    placeholder="One thing, in their words. Not a job title: an actual activity." required /></label>
                  <PersonPicker plan={plan} value={f.personId} onChange={on('personId')}
                    label="Who does it" blank="Nobody yet" />
                </Grp>
                <Grp title="How much of the week it takes" hint="Roughly is fine. A shape is better than a blank.">
                  <div className="rd-row">
                    <label style={{ flex: 1 }}>How often
                      <select value={f.cadence} onChange={onCadence}>
                        <option value="">Not recorded</option>
                        {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <label style={{ flex: '0 0 160px' }}>Hours a week<input value={f.hours} onChange={on('hours')}
                      inputMode="decimal" placeholder="Roughly" /></label>
                  </div>
                  {/* ⚠ The "in their words" input existed ONLY in the KPI branch, so a task on cadence
                      "other" lost the words somebody actually said. Vocabularies are meant to keep
                      them, not replace them. */}
                  {f.cadence === 'other' && (
                    <label>In their words<input value={f.cadenceNote} onChange={on('cadenceNote')}
                      placeholder="How they described how often it happens" /></label>
                  )}
                </Grp>
                <Grp title="What it touches" hint="The processes it sits inside, and the pillars it leans on.">
                  <Lines label="Which processes it sits inside" hint="process numbers, one per line" value={f.processes} onChange={set('processes')} rows={2} />
                  <PillarPicker value={f.pillars} onToggle={togglePillar('pillars')} label="Pillars it touches" />
                </Grp>
                {/* Named for the set, not repeated from the field inside it: the Organisation tab
                    already calls this section "The target state", and the field below is the one
                    question it asks. */}
                <Grp title="The target state" hint="Ben's own four levers, plus the honest default.">
                  <label>What becomes of it
                    <select value={f.fate} onChange={on('fate')}>
                      {/* In assessment order, each with what it means for the work and who performs
                          it afterwards. Elimination is offered first because removing work recovers
                          its full cost while automating preserves that cost in another form, and a
                          bare list of words let every task skip straight to the modern-sounding
                          answer. */}
                      {TASK_FATE.map((x) => <option key={x} value={x}>{x} · {FATE_MEANS[x]}</option>)}
                    </select>
                  </label>
                  <label>Why <span style={{ fontWeight: 400 }}>(so the claim can be argued with)</span>
                    <textarea rows="2" value={f.why} onChange={on('why')}
                      placeholder="What makes it automatable, or why it has to stay with a person." /></label>
                </Grp>
              </>
            )}

            {kind === 'person' && (
              <>
                <Grp title="Who this is" hint="Their side decides what may ever be shown to them.">
                  <div className="rd-row">
                    <label style={{ flex: 1 }}>Name<input value={f.name} onChange={on('name')} placeholder="What they are called" required /></label>
                    <label style={{ flex: 1 }}>Their job<input value={f.role} onChange={on('role')} placeholder="In the company's own words" /></label>
                  </div>
                  <label>Which side they are on
                    <select value={f.side} onChange={on('side')}>
                      {PERSON_SIDES.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </label>
                </Grp>
                <Grp title="Where they sit" hint="Somebody can sit in one team and report into another, and that gap is usually the finding.">
                  <UnitPicker plan={plan} value={f.unitId} onChange={on('unitId')} label="Which part of the business" />
                  {/* The people chart. Not the same shape as the unit chart: somebody can sit in one
                      team and report into another, and that gap is usually the finding. */}
                  <PersonPicker plan={plan} value={f.reportsTo} onChange={on('reportsTo')}
                    label="Reports to" exclude={seed.id} blank="Nobody recorded" />
                  <PeoplePicker value={f.worksWith || []} people={plan?.PEOPLE || []}
                    exclude={seed.id} onToggle={togglePillar('worksWith')} />
                </Grp>
                <Grp title="How we reach them" hint="An account is a fact about them, never a grant of access.">
                  <label>Email<input value={f.email} onChange={on('email')} type="email" placeholder="How we reach them" /></label>
                  {/* A fact about them, NOT a grant of access. Nothing here gives anybody a login. */}
                  <label>Signs in as <span style={{ fontWeight: 400 }}>(only if they have an account)</span>
                    <input value={f.accountEmail} onChange={on('accountEmail')} type="email"
                      placeholder="Leave blank if they have no account" /></label>
                </Grp>
                <Grp title="What the chart does not say" hint="Anything about them the boxes and lines above cannot hold.">
                  <label>Note<textarea rows="3" value={f.note} onChange={on('note')} /></label>
                </Grp>
              </>
            )}

            {/* What the GITA proposed. `unknowns` is the field that makes this a Deep Dive artefact
                rather than a wish list: it is what we still have to establish before anyone can say
                the thing would work here. ⚠ No cost, no hours, no rate — deliberately. */}
            {kind === 'build' && (
              <>
                <Grp title="What we are proposing" hint="The least a proposal needs, plus the reason if it has stopped moving.">
                  <div className="rd-row">
                    <label style={{ flex: '0 0 110px' }}>Reference<input value={f.ref} onChange={on('ref')} placeholder="B1" /></label>
                    <label style={{ flex: 1 }}>Name<input value={f.name} onChange={on('name')} placeholder="What the GITA called it" required /></label>
                  </div>
                  <label>Where it stands
                    <select value={f.state} onChange={on('state')}>
                      {BUILD_STATES.map((b) => (
                        <option key={b} value={b}>{BUILD_STATE_WORD[b] || b}</option>
                      ))}
                    </select>
                  </label>
                  <p className="rd-hintline">{BUILD_STATE_MEANS[f.state] || ''}</p>
                  {/* ⚠ THE REASON IS NOT OPTIONAL ON A STOPPED PROPOSAL. Cancelled, tabled, deferred
                      and under-consideration each tell a reader the outcome and nothing about the
                      reasoning, so the next person either re-runs the whole argument or treats a
                      decision made on old information as settled. The record refuses these without
                      it; the form says so before the refusal rather than after. */}
                  {BUILD_STATES_NEEDING_WHY.includes(f.state) && (
                    <label>Why it is {BUILD_STATE_WORD[f.state]?.toLowerCase() || f.state} <span style={{ fontWeight: 400 }}>(required)</span>
                      <textarea rows="2" value={f.stateWhy} onChange={on('stateWhy')} required
                        placeholder="What the decision actually rested on, so somebody can revisit it knowing that." /></label>
                  )}
                  <label>What it does<textarea rows="3" value={f.what} onChange={on('what')} placeholder="In a sentence, what it would do for them." /></label>
                  <label>Who would use it<input value={f.forWhom} onChange={on('forWhom')} placeholder="A named role or team in their business" /></label>
                  <label>What it takes out<textarea rows="2" value={f.replaces} onChange={on('replaces')} placeholder="The manual step, tool or handoff it removes." /></label>
                </Grp>
                <Grp title="What it is for" hint="The opportunity this initiative serves. Several initiatives may serve one opportunity, which is why the link lives here rather than as a list on the opportunity.">
                  <OpportunityPicker plan={plan} value={f.opportunityId} onChange={on('opportunityId')} />
                </Grp>
                <Grp title="What it touches" hint="The chains, the steps inside them, and the numbers it should move.">
                  <Lines label="Which processes it changes" hint="process numbers, one per line. A proposal that names none is a proposal about nothing"
                    value={f.processes} onChange={set('processes')} rows={2} />
                  <Lines label="Which steps inside a process it changes"
                    hint={'one per line, written "01:2" for step 2 of process 01, or "01" for the whole chain'}
                    value={f.touches} onChange={set('touches')} rows={2} />
                  <ItemPicker label="Numbers it should move" value={f.kpis} onToggle={togglePillar('kpis')}
                    items={(plan?.KPIS || []).map((k) => ({ id: k.id, label: [k.scope, k.name].filter(Boolean).join(' · ') }))}
                    none="No numbers in the record yet." />
                  <PillarPicker value={f.pillars} onToggle={togglePillar('pillars')} />
                </Grp>
                {/* ⚠ THE GROUP AND ONE OF ITS OWN FIELDS HAD THE SAME NAME. "What we still have to
                    find out" was both the heading over six fields and the label on the second of
                    them, so nothing on screen said which one the reader was being asked for. The
                    page already names this section "What we would have to settle", so the drawer
                    now says what the page says: one thing, one name, whichever surface you meet it
                    on. "proposal" rather than "build" for the same reason. */}
                <Grp title="What we would have to settle" hint="This is the Deep Dive's job on this proposal.">
                  <Lines label="What it needs to work here" hint="one per line: access, data, an integration, a person"
                    value={f.needs} onChange={set('needs')} />
                  <Lines label="What we still have to find out" hint="one per line" value={f.unknowns} onChange={set('unknowns')} />
                  <Lines label="Questions it raises" hint="one per line" value={f.opens} onChange={set('opens')} />
                  {/* ⚠ A PROPOSAL IS NOT ONE THING. "A client portal" could be a website, an app,
                      or a report that lands in an inbox, and which one it is changes the cost, the
                      risk and who can use it. Settling that is the Deep Dive's job, so the record
                      holds the options open rather than quietly picking one. */}
                  <Lines label="The options" hint="one per line, the different ways this could be built"
                    value={f.options} onChange={set('options')} rows={3} />
                  <Lines label="What could go wrong" hint="one per line, problems it would bring with it"
                    value={f.problems} onChange={set('problems')} rows={3} />
                  <Lines label="What would stop it" hint="one per line, a blocker is a thing that has to be cleared before anything can start"
                    value={f.blockers} onChange={set('blockers')} rows={3} />
                </Grp>
                <Grp title="How it weighs against the rest" hint="What it returns, what it costs us, and what has to exist first.">
                  <label>What it is worth<textarea rows="2" value={f.roi} onChange={on('roi')}
                    placeholder="The return, in their terms: the night of report writing, the interviews lost to refusals, the client that went elsewhere." /></label>
                  <div className="rd-row">
                    <label style={{ flex: 1 }}>Effort <span style={{ fontWeight: 400 }}>(0 to 10)</span>
                      <input value={f.effort} onChange={on('effort')} inputMode="decimal" placeholder="unscored" /></label>
                    <label style={{ flex: 1 }}>Impact <span style={{ fontWeight: 400 }}>(0 to 10)</span>
                      <input value={f.impact} onChange={on('impact')} inputMode="decimal" placeholder="unscored" /></label>
                  </div>
                  <p className="rd-hintline">Unscored is left off the chart. A dot in the middle is a claim, and
                    &ldquo;nobody has weighed this yet&rdquo; is not that claim.</p>
                  {/* ⚠ FOUNDATIONAL IS A DEPENDENCY, NOT A PRIORITY. A client portal is
                      foundational because other things cannot exist without it, which is a
                      different claim from it being the most valuable, and the two get confused
                      the moment they share a word. */}
                  <label className="rd-check">
                    <input type="checkbox" checked={!!f.foundational}
                      onChange={(e) => setF((p2) => ({ ...p2, foundational: e.target.checked }))} />
                    <span>Other things get built on top of this one</span>
                  </label>
                  <ItemPicker label="What has to exist first" value={f.dependsOn} onToggle={togglePillar('dependsOn')}
                    items={(plan?.BUILDS || []).filter((b) => b.id !== seed.id)
                      .map((b) => ({ id: b.id, label: [b.ref, b.name].filter(Boolean).join(' · ') }))}
                    none="No other proposals in the record yet." />
                </Grp>
                <Grp title="What we can show" hint="A prototype, a still, or the running thing.">
                  <label>What there is
                    <select value={f.demoKind} onChange={on('demoKind')}>
                      {DEMO_KINDS.map((d) => <option key={d} value={d}>{DEMO_KIND_MEANS[d]}</option>)}
                    </select>
                  </label>
                  <label>Where it is<input value={f.demoLink} onChange={on('demoLink')}
                    placeholder="https://…  a prototype, a still, or the running thing" /></label>
                  <label>What it shows<textarea rows="2" value={f.demoNote} onChange={on('demoNote')} /></label>
                </Grp>
                <Grp title="What has been said about it" hint="The conversation as it happened, and anything else worth keeping.">
                  {/* ⚠ A STATE WITH NO HISTORY LOSES THE ARGUMENT. "Cancelled" records the outcome
                      and nothing about the reasoning. This is the conversation, kept as it happened. */}
                  {/* ⚠ Named for its SHAPE, not repeated from the group above it. This field used
                      to be labelled "What has been said about it", which is also the heading it
                      sits under and the name of the section on the build's page, so the form asked
                      the same question twice over and answered neither. The group keeps the page's
                      name; the field says what goes in it. */}
                  <Lines label="Who said what, and when"
                    hint={'one per line, written "2026-08-27 :: who said it :: what was said"'}
                    value={f.decisions} onChange={set('decisions')} rows={4} />
                  <label>Note<textarea rows="2" value={f.note} onChange={on('note')} /></label>
                </Grp>
              </>
            )}

            {kind === 'unit' && (
              <>
                <Grp title="Which box on the chart this is" hint="The reference is what the org itself calls it, like OPS.">
                  <div className="rd-row">
                    <label style={{ flex: '0 0 110px' }}>Reference<input value={f.ref} onChange={on('ref')} placeholder="OPS" /></label>
                    <label style={{ flex: 1 }}>Name<input value={f.name} onChange={on('name')} placeholder="What this part of the business is called" required /></label>
                  </div>
                  <label>What kind
                    <select value={f.unitType} onChange={on('unitType')}>
                      {UNIT_TYPES.map((t2) => <option key={t2} value={t2}>{t2}</option>)}
                    </select>
                  </label>
                </Grp>
                <Grp title="What it does and how many people do it" hint="A headcount here is what a target state later gets measured against.">
                  <label>What it does<textarea rows="3" value={f.does} onChange={on('does')} placeholder="What this part of the business is for." /></label>
                  <label>How many people
                    <input value={f.headcount} onChange={on('headcount')} inputMode="numeric" placeholder="12" /></label>
                </Grp>
                <Grp title="Where it sits" hint="The unit above is what makes this a chart rather than a list.">
                  {/* The one field that makes this a chart rather than a list. A unit cannot be put
                      under itself, and the schema refuses a chain that loops back round. */}
                  <UnitPicker plan={plan} value={f.parent} onChange={on('parent')}
                    label="It sits under" exclude={seed.id} />
                  <PersonPicker plan={plan} value={f.leadId} onChange={on('leadId')}
                    label="Who runs it" blank="Not recorded, or not in the record yet" />
                  <label>Or who runs it, by name <span style={{ fontWeight: 400 }}>(when they are not in the record)</span>
                    <input value={f.lead} onChange={on('lead')} placeholder="A name, or the role" /></label>
                </Grp>
                <Grp title="What the chart does not say" hint="Why it is shaped the way it is.">
                  <label>Note<textarea rows="2" value={f.note} onChange={on('note')} /></label>
                </Grp>
              </>
            )}

            {kind === 'offering' && (
              <>
                <Grp title="What it is called" hint="Without a reference a process can never be tied to it.">
                  <div className="rd-row">
                    {/* Required: the reference is how a process is tied to this offering, so one
                        saved without it can never appear on a board. */}
                    <label style={{ flex: '0 0 96px' }}>Reference<input value={f.ref} onChange={on('ref')} placeholder="01" required /></label>
                    <label style={{ flex: 1 }}>Name<input value={f.name} onChange={on('name')} placeholder="What this service line is called" required /></label>
                  </div>
                  <label>What the client calls it <span style={{ fontWeight: 400 }}>(only where it differs)</span>
                    <input value={f.alias} onChange={on('alias')} placeholder="Their own word for it" /></label>
                </Grp>
                <Grp title="What it is and who buys it" hint="In the client's terms, not ours.">
                  <label>What it is<textarea rows="3" value={f.what} onChange={on('what')} placeholder="What the client actually delivers." /></label>
                  <label>Who buys it<input value={f.who} onChange={on('who')} placeholder="The kind of buyer" /></label>
                </Grp>
                <Grp title="What it touches" hint="The processes that deliver it. This is what draws its workflow.">
                  <Lines label="Processes that deliver it" hint="process numbers, one per line"
                    value={f.processes} onChange={set('processes')} />
                </Grp>
                <Grp title="Where it stands and why" hint="A stopped offering that says nothing about why is the one that gets proposed again.">
                  <label>State
                    <select value={f.state} onChange={on('state')}>
                      {OFFERING_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </label>
                  <label>Note<textarea rows="3" value={f.note} onChange={on('note')} placeholder="Anything that explains the state, including why it was stopped." /></label>
                </Grp>
              </>
            )}
          </>
        )}

        {err && <p className="rd-err" role="alert">{err}</p>}

        </div>

        <div className="ca-drawer-foot rd-foot">
          {!isNew && !isDetails && !isNorthStar && (confirmRemove ? (
            <>
              <span className="rd-confirm">Remove for good?</span>
              <button type="button" className="gs-btn ghost sm rd-danger" disabled={busy}
                onClick={async () => { setBusy(true); try { await onRemove(seed.id); onClose(); } catch (e2) { setErr(e2.message); setBusy(false); } }}>
                Yes, remove
              </button>
              <button type="button" className="gs-btn ghost sm" onClick={() => setConfirmRemove(false)}>Keep</button>
            </>
          ) : (
            <button type="button" className="gs-btn ghost sm rd-danger" onClick={() => setConfirmRemove(true)}>Remove</button>
          ))}
          <span style={{ flex: 1 }} />
          <button type="button" className="gs-btn ghost sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="gs-btn primary sm" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </DrawerScrim>
  );
}
