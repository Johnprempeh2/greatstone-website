// Deep Dive Portal (#deepdive) — where a Deep Dive runs, per Operating Standard v2.3, 4.10.
//
// TWO SURFACES, ONE RECORD.
//
//   Greatstone staff get the workspace: the whole investigation, and the controls that move it —
//   what has been examined, what is blocked, and which items the client is shown. Greatstone works
//   the Deep Dive here.
//
//   The client gets what Greatstone has deliberately published: progress, and the items marked
//   shared. Internal is the default, so nothing reaches them by omission. Requesting information
//   from the client through the Portal is a later capability; today the register is Greatstone's
//   own working list of what it still needs.
//
// The Investigation Plan is canonical and says what the investigation IS; the state layer says where
// it has got to. Every number on screen is counted from those two at render time, so the Portal can
// never disagree with the document.
import React, { useState, useEffect, useMemo, useCallback, useRef, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { getStaffUser, isStaff } from './adminAuth.mjs';
import { getCustomerProfile, isCustomer, signOut, getSession, onAuth } from './customerAuth.mjs';
import { AuthGate } from './AccountDashboard.jsx';
import { loadPlan, listEngagements, clientNameFor } from './deepdive-source.mjs';
import { applyRecordOp, probeCanAuthor, createRecord } from './deepdive-ops.mjs';
import RecordDrawer from './RecordDrawer.jsx';
import BuildPage from './BuildPage.jsx';
import AddButton from './AddButton.jsx';
import EditLink from './EditLink.jsx';
import More from './More.jsx';
import { groupByLead } from './deepdive-lead.mjs';
import { filterRows, rowFacts, NEEDS_DECIDING, viewCounts } from './deepdive-qview.mjs';
import SessionTie from './SessionTie.jsx';
import Meter from './Meter.jsx';
import TabHead from './TabHead.jsx';
import InnovationBoard from './InnovationBoard.jsx';
import SessionPage from './SessionPage.jsx';
import QuestionPage from './QuestionPage.jsx';
import EvidencePage from './EvidencePage.jsx';
import ProcessPage from './ProcessPage.jsx';
import SourcePage from './SourcePage.jsx';
import PersonPage from './PersonPage.jsx';
import CompetitorPage, { CompMark } from './CompetitorPage.jsx';
import KpiPage from './KpiPage.jsx';
import HypothesisPage from './HypothesisPage.jsx';
import OutLink from './OutLink.jsx';
import RecordSearch from './RecordSearch.jsx';
import Attachments from './Attachments.jsx';
import OfferingBoard from './OfferingBoard.jsx';
import { processesForOffering, unnamedProcesses, defaultOffering } from './deepdive-board.mjs';
import { orgTree, unitHolds, orgCoverage, unplacedPeople, peopleTree, targetState, processCoverage, unlinkedNames } from './deepdive-org.mjs';
import { sessionHref, questionHref, evidenceHref, itemHref, ITEM_KINDS, DEEPDIVE_BASE } from '../lib/deepdive-route.mjs';
import { questionCoverage, KPI_SCOPES, findItem, allIds, safeLink, labelOf, ROUTES } from '../data/deepdive-schema.mjs';
import { CONFIDENCE, validationQueue, certaintyDriftRollup, canValidate } from '../data/deepdive-findings.mjs';
import { Icon, Labelled } from './DeepDiveIcons.jsx';
import { sayEntry, Who } from './ChangeLog.jsx';
import {
  loadState, saveItem, saveMany, replaceState, releaseItem, stateOf, isShared, progressOf,
  addFinding, removeFinding, judgeFinding, concludeFinding, findingsFor, answeredQuestionIds, attachFile, detachFile,
  STATUS, STATUS_ORDER, VISIBILITY, setActor, madeBy, whoDid, logOp, diffItem, sessionLeftovers, sessionNeedsRecord } from './deepdive-state.mjs';
import {
  PILLAR_GROUPS, groupOf, CERTAINTY, CERTAINTY_ORDER, EVIDENCE_STATE,
  REQUEST_KIND, requestKindOf, coverageOf, questionsFor, processesFor, sessionsFor,
} from '../data/deepdive.mjs';
import './store.css';
import './admin.css';
import './deepdive.css';

// Thirteen tabs became nine. Evidence, Sources, Hypotheses, To validate and What we need were five
// views of one question, so they are one tab with five bands inside it: same detail, one place to
// look. See the comment on BANDS.
// ⚠ EVERY TAB CARRIES ITS OWN GLYPH, and each one means the thing beside it. An icon borrowed from
// a neighbouring meaning is worse than none, because it is read and read wrong, so Organisation and
// Competitors got their own rather than the nearest match.
const TABS = [
  { id: 'overview',  label: 'Overview', icon: 'compare' },
  { id: 'processes', label: 'Processes', icon: 'process' },
  { id: 'org', label: 'Organisation', icon: 'people' },
  // What we proposed sits next to how it runs today, because the two are one argument: the record
  // establishes the chain, and this says what we would change about it.
  { id: 'innovation', label: 'Innovation', icon: 'link' },
  { id: 'evidence',  label: 'Enquiry', icon: 'evidence' },
  { id: 'sessions',  label: 'Sessions', icon: 'session' },
  { id: 'competitors', label: 'Competitors', icon: 'market' },
  { id: 'kpis',      label: 'KPIs', icon: 'kpi' },
  { id: 'history',   label: 'History', icon: 'history' },
];

// ── shared pieces ─────────────────────────────────────────────────────────────────────────────
const Chip = ({ tone, children, title }) => (
  <span className={`dd-chip dd-${tone}`} title={title}>{children}</span>
);

function Bar({ p, label }) {
  // ⚠ NOTHING TO PROGRESS THROUGH IS NOT ZERO PROGRESS. A record exists for every client from first
  // contact, so the empty state is the normal first impression, and it opened with a bar reading
  // "0%" and "0 examined of 0". Zero per cent of nothing is not a fact about the engagement, it is
  // a division the component happened to guard. The tiles above already say what is missing, in
  // words, and they say it better.
  if (!p?.total) return null;
  return (
    <div className="dd-bar" role="group" aria-label={label || 'Progress'}>
      <div className="dd-bar-track">
        <div className="dd-bar-done" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
        <div className="dd-bar-active" style={{ width: `${p.total ? (p.active / p.total) * 100 : 0}%` }} />
      </div>
      <div className="dd-bar-n">
        <b>{p.pct}%</b>
        <span>{p.done} examined{p.active ? `, ${p.active} under way` : ''}{p.blocked ? `, ${p.blocked} waiting` : ''} of {p.total}</span>
      </div>
    </div>
  );
}

function Tile({ value, label, hint, onClick, tab, icon = null, parts = null, empty }) {
  const inner = (<>
    {icon && (
      <span className="dd-chip-i" aria-hidden="true">{Icon[icon] ? Icon[icon]({ size: 15 }) : null}</span>
    )}
    <div className="org-stat-v">{value}</div><div className="org-stat-l">{label}</div>
    {hint && <div className="dd-tile-hint">{hint}</div>}
    {/* ⚠ The breakdown is counted from the record, never illustrative. A tile showing a plausible
        bar with nothing behind it would be the most damaging thing on this page, because a
        dashboard is read as fact at a glance and never checked. */}
    {parts && <Meter parts={parts} empty={empty || 'Nothing recorded yet'} />}</>);
  return onClick
    ? <button type="button" className="org-stat is-link dd-tile" onClick={() => onClick(tab)}>{inner}</button>
    : <div className="org-stat dd-tile">{inner}</div>;
}

/** The person record behind a name somebody typed. Sponsor and saidBy are free text ("a name, or
 *  their role"), so the join is by name, trimmed and case-blind, and a miss returns null so the
 *  caller renders the words as written rather than a link to nobody. Client side only: a
 *  Greatstone name in one of those fields is not a client record to open. */
function personNamed(plan, name) {
  const want = String(name || '').trim().toLowerCase();
  if (!want) return null;
  return (plan?.PEOPLE || []).find((p) => p.side === 'client' && String(p.name || '').trim().toLowerCase() === want) || null;
}

/** A sentence's worth of people, each name a way to their page. Capped, because an early record
 *  can hold twenty unplaced people and a banner is not the place for twenty links; the "and N
 *  more" is a control that names the rest rather than a count that stops. join() cannot interleave
 *  JSX, so the separators are rendered by hand. Renders nothing without a slug: the client view
 *  has no person pages to open. */
function NameLinks({ people, slug, max = 4 }) {
  const [all, setAll] = useState(false);
  const shown = all ? people : people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <>
      {shown.map((p, i) => (
        <React.Fragment key={p.id}>
          {i > 0 && ', '}
          {slug ? <a className="dd-either-a" href={itemHref(slug, 'person', p.id)}>{p.name}</a> : p.name}
        </React.Fragment>
      ))}
      {rest > 0 && (
        <>, <button type="button" className="dd-tie-go" onClick={() => setAll(true)}>and {rest} more</button></>
      )}
    </>
  );
}

// The affordance that was missing everywhere: a plain way to put something in. Disabled rather
// than hidden where the environment cannot store a change, with the reason on it, so an admin is
// never left wondering whether they clicked the wrong thing.

// A row's own edit affordance. Small and quiet: the row is for reading, this is for changing it.
/** The portal's own top bar.
 *
 *  ⚠ THIS IS AN APPLICATION, NOT A PAGE OF THE WEBSITE. The site header used to sit above it, so
 *  somebody working a client record all afternoon had the marketing navigation above them and the
 *  record's own tabs a scroll down the page. The site chrome comes off on these routes (App.jsx)
 *  and this replaces it.
 *
 *  ⚠ THE WAY OUT IS NOT OPTIONAL. Removing the site header removes every link back to the website,
 *  so a portal without an exit would be a trap. There are two: the mark returns to the list of
 *  records, and "Leave the portal" returns to the website.
 */
/** Where the record's tabs are rendered. The bar is outside every screen so the way out cannot go
 *  missing; the tabs belong to one screen, so they travel up into it through here. */
const BarSlot = createContext(null);
/** ⚠ THE BAR TOOK A `client` PROP AND NOTHING EVER PASSED ONE. It is rendered by the wrapper, which
 *  is outside the screen that knows which engagement is open, so the name and the mark were dead
 *  code from the day the bar was built: every harness passed them by hand and the real app never
 *  did. The screen reports what it is showing, through here. */
const BarInfo = createContext(() => {});
/** ⚠ PREVIEW MODE WAS A ONE-WAY DOOR, and for the same reason the exit bar exists at all. The
 *  "Preview as the client sees it" checkbox lives on the record screen; the state lived in that
 *  screen's component, which also holds ten early returns for the item pages. So a practitioner
 *  ticked the box, clicked into a question, and arrived on a page with every edit control gone, no
 *  checkbox to untick and nothing saying why. Indistinguishable from a permissions problem or a
 *  bug. The flag now lives above every branch, where the way out can be rendered once. */
const Preview = createContext({ on: false, set: () => {} });

/** The person, and the two ways out of the application.
 *
 *  ⚠ A MENU, DONE PROPERLY OR NOT AT ALL. An incomplete popover, one that traps focus or cannot be
 *  closed from the keyboard, is worse than two plain links: it announces behaviour it does not have.
 *  Escape closes it, a click outside closes it, and focus goes back to the button that opened it. */
/** Light and dark, owned by the portal.
 *
 *  The attribute lives on <html>, NOT on .dd-wrap, for the same reason the tokens do: the record
 *  panel portals to <body>, and a theme scoped to the wrap would leave every portalled surface in
 *  the other mode. Owned means owned: set on mount from the saved choice, REMOVED on unmount, so
 *  the store and the site never inherit it.
 *
 *  localStorage can throw (private windows, storage disabled), and a portal that cannot remember
 *  a preference must still render, so every touch is wrapped and the default is the brand dark. */
const THEME_KEY = 'dd-theme';
function readTheme() {
  try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}
function useTheme() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    if (theme === 'light') document.documentElement.setAttribute('data-dd-theme', 'light');
    else document.documentElement.removeAttribute('data-dd-theme');
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* a preference, not a record */ }
  }, [theme]);
  useEffect(() => () => document.documentElement.removeAttribute('data-dd-theme'), []);
  return [theme, setTheme];
}

function ThemeButton() {
  const [theme, setTheme] = useTheme();
  const dark = theme !== 'light';
  return (
    <button type="button" className="dd-user-b" aria-pressed={!dark}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}>
      {dark ? (
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false"
          fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false"
          fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.4 14.2A8.4 8.4 0 0 1 9.8 3.6a8.4 8.4 0 1 0 10.6 10.6z" />
        </svg>
      )}
    </button>
  );
}

function UserMenu() {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    const onDown = (e) => {
      if (box.current?.contains(e.target) || btn.current?.contains(e.target)) return;
      setOpen(false);
    };
    addEventListener('keydown', onKey); addEventListener('pointerdown', onDown);
    return () => { removeEventListener('keydown', onKey); removeEventListener('pointerdown', onDown); };
  }, [open]);
  return (
    <div className="dd-user">
      <button type="button" ref={btn} className="dd-user-b" aria-haspopup="menu"
        aria-expanded={open} aria-label="Your account and how to leave the portal"
        onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false">
          <circle cx="12" cy="8.5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.9" />
          <path d="M4.8 20c.9-3.7 3.7-5.6 7.2-5.6s6.3 1.9 7.2 5.6" fill="none"
            stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="dd-user-m" role="menu" ref={box}>
          <a role="menuitem" href="#account" onClick={() => setOpen(false)}>Your account</a>
          <a role="menuitem" href="#" onClick={() => setOpen(false)}>Leave the portal</a>
        </div>
      )}
    </div>
  );
}

/** ⚠ THE NAVIGATION WAS BEING CUT OFF IN SILENCE. The tab slot scrolls sideways when the tabs do
 *  not fit, which is the right behaviour, and it hides its scrollbar, which is what made it a bug:
 *  measured on a 1280px laptop the nine tabs need 1128px and the slot gets 858, so Competitors,
 *  KPIs and History were off the end with nothing on screen saying they existed. It is the only
 *  scrolling container in the portal with its scrollbar suppressed, and it is the one carrying the
 *  way around the record.
 *
 *  So the slot reports which edge it has content past, and the stylesheet fades that edge. It is
 *  measured rather than assumed: no fade when everything fits, which is the whole point of an
 *  affordance. A ResizeObserver alone is not enough, because the tabs are portalled in by another
 *  component and arrive as a child mutation, not a resize of the slot. */
function useScrollEdges(el) {
  const [edges, setEdges] = useState('');
  useEffect(() => {
    if (!el) return undefined;
    const read = () => {
      const slack = el.scrollWidth - el.clientWidth;
      // 2px, because a fractional layout leaves sub-pixel slack on a strip that fits perfectly.
      if (slack <= 2) return setEdges('');
      const start = el.scrollLeft > 2;
      const end = el.scrollLeft < slack - 2;
      setEdges(`${start ? ' is-from' : ''}${end ? ' is-more' : ''}`);
    };
    read();
    el.addEventListener('scroll', read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    const mo = new MutationObserver(read);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => { el.removeEventListener('scroll', read); ro.disconnect(); mo.disconnect(); };
  }, [el]);
  return edges;
}

function PortalBar({ slug = null, client = null, logo = null, slotRef = null, asClient = false, onExit = null }) {
  // The slot has to be in state for the same reason the portal target is: a ref would be null on
  // the render that decides whether to fade.
  const [slotEl, setSlotEl] = useState(null);
  const edges = useScrollEdges(slotEl);
  // ⚠ THE CALLBACK REF MUST NOT CHANGE IDENTITY. React detaches and reattaches a callback ref
  // whenever the function itself changes, so composing it with `useCallback([slotRef])` means any
  // parent passing an inline function gets a detach on every render: setSlotEl re-renders, which
  // makes a new ref, which detaches again. The real app passes a stable state setter and never
  // saw it; the harness passes inline functions and spun until it timed out, then reported one
  // screen's tab strip as another's. The prop is read through a ref so this one stays stable.
  const latest = useRef(slotRef);
  latest.current = slotRef;
  const attach = useCallback((el) => {
    setSlotEl(el);
    if (typeof latest.current === 'function') latest.current(el);
  }, []);
  return (
    <div className="dd-top">
      <div className="dd-top-in">
        <a className="dd-top-mark" href={`#${DEEPDIVE_BASE}`} aria-label="Greatstone Deep Dive Portal">
          {/* The site's own mark. ⚠ It hides itself if the file is missing rather than leaving a
              broken-image glyph in the chrome of an application somebody works in all day. */}
          <picture>
            <source type="image/webp" srcSet="/assets/greatstone-logo-web.webp" />
            <img className="dd-top-logo" src="/assets/greatstone-logo-web.png" alt="Greatstone"
              width="800" height="160" decoding="async"
              onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          </picture>
          <span className="dd-top-t">Deep Dive</span>
        </a>
        {client && (
          <a className="dd-top-client" href={slug ? `#${DEEPDIVE_BASE}/${slug}` : `#${DEEPDIVE_BASE}`}>
            {/* ⚠ THE MARK IS NOT HERE. It was, and it looked wrong for a measurable reason: most
                client logos are JPEGs on pure white, so on dark chrome they render as a white
                rectangle floating in the bar. Indago's is exactly that: white ground, an
                indigo-violet mark. A logo needs a plate to sit on, and a 62px bar is not the place
                for one. It leads the Overview instead, where there is room to give it a surface. */}
            <span>{client}</span>
          </a>
        )}
        {/* The record's tabs land here. */}
        <div className={`dd-top-slot${edges}`} ref={attach} />
        {/* Only a staff member can turn preview on, so the flag being true is itself the proof
            that there is somebody here allowed to turn it off. A client never sees this. */}
        {asClient && (
          <p className="dd-prevbar">
            <span className="dd-prevbar-dot" aria-hidden="true" />
            <span className="dd-prevbar-t">Client&rsquo;s view</span>
            <button type="button" className="dd-prevbar-x" onClick={onExit}>Exit</button>
          </p>
        )}
        <ThemeButton />
        <UserMenu />
      </div>
    </div>
  );
}


// Moving a whole pillar's questions at once. An admin who has just spent an afternoon on Data does
// not want to click sixteen selects, and against a versioned store sixteen sequential saves would
// fail on the second one anyway. Visibility is deliberately absent here: publishing to the client is
// a per-item decision and a bulk "share everything" button is exactly how that stops being one.
function BulkBar({ ids, what, ctx }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState('done');
  if (!ctx.staff) return null;
  return (
    <div className="dd-bulk">
      {!open ? (
        <button type="button" className="dd-bulkbtn" disabled={ctx.busy} onClick={() => setOpen(true)}>
          Set all {what}
        </button>
      ) : (
        <>
          <label className="dd-bulk-l">
            <span className="gs-sr-only">Status to apply to {what}</span>
            <select value={pick} disabled={ctx.busy} onChange={(e) => setPick(e.target.value)}
              className={`dd-sel dd-sel-${STATUS[pick].tone}`}>
              {STATUS_ORDER.map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
            </select>
          </label>
          <button type="button" className="gs-btn primary sm" disabled={ctx.busy}
            onClick={async () => { await ctx.setMany(ids, { status: pick }); setOpen(false); }}>
            Apply to {ids.length}
          </button>
          <button type="button" className="gs-btn ghost sm" disabled={ctx.busy} onClick={() => setOpen(false)}>Cancel</button>
        </>
      )}
    </div>
  );
}

// ⚠ The icon LABELS the section, it does not decorate it: each one is the glyph already used for
// that kind everywhere else in the portal, so a reader who has learned it once has learned it.
// A section with no meaningful glyph gets none rather than a filler.
function Section({ title, sub, children, id, icon = null, fold = false }) {
  return (
    <section className="org-sec dd-sec" id={id}>
      <h2>{icon ? <Labelled icon={icon}>{title}</Labelled> : title}</h2>
      {sub && (fold
        ? <More lines={2} className="org-sec-sub"><p style={{ margin: 0 }}>{sub}</p></More>
        : <p className="org-sec-sub">{sub}</p>)}
      {children}
    </section>
  );
}

// The one control that moves an item: where it has got to, and whether the client sees it.
// Staff-only — it is never rendered into the client view, not merely hidden there.
// The working note: what WE know about our progress on this item, as distinct from the item's own
// note in the plan (which is part of the question or the evidence and is edited in the drawer).
// The data model, the save path and the MCP have all carried this from the start and nothing has
// ever shown it, so a note written by a Claude session was invisible to the person at the keyboard.
// It is Greatstone-side only and never renders in the client view.
function ItemControls({ id, label, state, onChange, busy }) {
  const s = state.status, v = state.visibility;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(state.note || '');
  const has = !!(state.note || '').trim();

  const open = () => { setDraft(state.note || ''); setEditing(true); };
  const save = () => { onChange(id, { note: draft.trim() }, label); setEditing(false); };

  return (
    <>
    {has && !editing && (
      <p className="dd-note" title="Working note, Greatstone only">
        <span className="gs-sr-only">Working note for {label}: </span>{state.note}
      </p>
    )}
    {editing && (
      <div className="dd-note-edit">
        <label>
          <span className="gs-sr-only">Working note for {label}</span>
          <textarea rows="2" value={draft} autoFocus disabled={busy}
            placeholder="Where we have got to on this. Greatstone only."
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); }
              // Cmd/Ctrl+Enter saves, because a note is short and reaching for the mouse is friction
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
            }} />
        </label>
        <div className="dd-note-foot">
          <button type="button" className="gs-btn ghost sm" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
          <button type="button" className="gs-btn primary sm" disabled={busy} onClick={save}>Save note</button>
        </div>
      </div>
    )}
    <div className="dd-ctl">
      <label className="dd-ctl-status">
        <span className="gs-sr-only">Status for {label}</span>
        <select value={s} disabled={busy} onChange={(e) => onChange(id, { status: e.target.value }, label)}
          className={`dd-sel dd-sel-${STATUS[s].tone}`}>
          {STATUS_ORDER.map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
        </select>
      </label>
      <button type="button" disabled={busy}
        className={`dd-vis${v === 'shared' ? ' is-shared' : ''}`}
        aria-pressed={v === 'shared'} title={VISIBILITY[v].blurb}
        onClick={() => onChange(id, { visibility: v === 'shared' ? 'internal' : 'shared' }, label)}>
        {/* The visible word has to lead the accessible name, or "click Internal" matches nothing
            for someone driving this by voice (WCAG 2.5.3 Label in Name). */}
        <span className="gs-sr-only">{VISIBILITY[v].label}. {VISIBILITY[v].blurb} Toggle for {label}.</span>
        <span aria-hidden="true">{v === 'shared' ? 'Shared' : 'Internal'}</span>
      </button>
      <button type="button" className={`dd-notebtn${has ? ' has-note' : ''}`} disabled={busy}
        aria-expanded={editing} onClick={() => (editing ? setEditing(false) : open())}>
        {has ? 'Edit note' : 'Note'}<span className="gs-sr-only"> for {label}</span>
      </button>
    </div>
    </>
  );
}

// ── tabs ──────────────────────────────────────────────────────────────────────────────────────
// ── where they are on the journey ─────────────────────────────────────────────────────────────
//
// Ben, 6 September: "when they log into their portal it must also show the initial transformation
// assessment... it takes them on a whole journey: the executive discovery, the findings, then the
// initial assessment, they click down into the deep dive, then they see the playbook."
// John, same day: "a view of the GITA, the executive discovery, and then the deep dive, and then
// eventually the build plan... the Greatstone customer journey and where they are."
//
// ⚠ THESE STAGE NAMES CAME FROM JOHN AND BEN, NOT FROM ME. The canonical journey is Method
// doctrine and Ben owns it, so this renders the four they named and nothing more: no invented
// stage, no invented content behind one. `STAGES` is the single place to correct them.
const STAGES = [
  { id: 'discovery', label: 'Executive discovery', what: 'The first conversations, and what they told us.' },
  { id: 'gita', label: 'GITA', what: 'The transformation assessment, and what it found.' },
  // ⚠ "You are here." WAS HARDCODED INTO THIS ONE. The badge beside the heading is derived from the
  // record's own stage and lands correctly; this sentence did not move, so a record at Executive
  // discovery, GITA or Build plan showed the badge on its real stage AND this card still claiming
  // to be where you are. Three of the four stages contradicted themselves. The badge says where you
  // are; a stage description says what the stage IS.
  { id: 'deepdive', label: 'Deep Dive', what: 'The forensic pass through the business.' },
  { id: 'build', label: 'Build plan', what: 'What gets built, in what order, and what it is worth.' },
];

/** Which stage this record sits at, read from the engagement rather than assumed. A record only
 *  claims to be at the Deep Dive because its own `stage` says so. */
function stageIndex(eng) {
  const stage = String(eng?.stage || '').toLowerCase();
  if (stage.includes('build') || stage.includes('playbook')) return 3;
  if (stage.includes('deep dive')) return 2;
  if (stage.includes('gita') || stage.includes('assessment')) return 1;
  return 0;
}

function Journey({ eng, ctx }) {
  const at = stageIndex(eng);
  return (
    <section className="dd-journey">
      <h2 className="dd-sub">Where you are with Greatstone</h2>
      <ol className="dd-journey-l">
        {STAGES.map((st, i) => (
          <li key={st.id} className={`dd-jstage${i < at ? ' is-done' : i === at ? ' is-now' : ''}`}>
            <span className="dd-jstage-m" aria-hidden="true" />
            <div>
              <h3>{st.label}{i === at && <span className="dd-jstage-here">you are here</span>}</h3>
              <p>{st.what}</p>
            </div>
          </li>
        ))}
      </ol>
      {eng.follows && <p className="dd-journey-f">Follows {eng.follows}.</p>}
      {/* ⚠ A note explaining how the control works is not what somebody opens this page for. It is
          worth keeping and worth folding: one line by default, the rest on request. */}
      {ctx?.staff && (
        <More lines={1} className="ca-note" label="How this works" less="Hide">
          <p style={{ margin: 0 }}>
            The stage is read from the record&rsquo;s own <b>Stage</b> field, so change it there and
            this moves. Nothing behind the other three is built yet: they are the journey, not links.
          </p>
        </More>
      )}
    </section>
  );
}

// THE NORTH STAR, and it opens the record because Ben asked for exactly that: "for each deep dive
// engagement, start with the CEO's North Star vision".
//
// It is built to hold a judgement, not a quote. Their words sit at the top untouched; underneath,
// how clear it actually is, what is still not clear, and the target we intend to beat it with.
// "If anything is not clear, that means it's not thought through properly" is only usable if the
// record can say the vision is unclear, so an unclear one reads as a finding, not as a blank.
function NorthStar({ plan, eng, ctx }) {
  const ns = plan.NORTH_STAR;
  const said = ns?.saidBy || eng.sponsor || 'the chief executive';
  const open = ctx.staff && ctx.canAuthor?.can;
  // The person who said it, if the record knows them. ⚠ GUARDED ON ctx.slug: the client view
  // mounts this with ctx={{ staff: false }}, and without a slug itemHref would mint
  // #deepdive/person/<id>, which the router reads with "person" as the slug. A client is also not
  // handed a deep link into a person record the sharing model may not expose.
  const sayer = ctx.slug ? personNamed(plan, said) : null;

  if (!ns || !ns.words) {
    return (
      <section className="dd-ns dd-ns-empty">
        <div className="dd-ns-mark" aria-hidden="true" />
        <div className="dd-ns-body">
          <h2><Labelled icon="target">The North Star</Labelled></h2>
          <p className="dd-ns-none">
            Not captured yet. Every Deep Dive starts from where {said} says the business is going, in
            their own words, because that is the minimum the target state has to beat. Without it,
            everything below is work with nothing to measure itself against.
          </p>
          {ctx.staff && (
            <button type="button" className="gs-btn primary sm" disabled={!open}
              title={open ? undefined : ctx.canAuthor?.why}
              onClick={() => ctx.openDrawer({ mode: 'northstar' })}>Record what they said</button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className={`dd-ns dd-ns-${ns.clarity.replace(/ /g, '-')}`}>
      <div className="dd-ns-mark" aria-hidden="true" />
      <div className="dd-ns-body">
        <h2><Labelled icon="target">The North Star</Labelled></h2>
        {/* Their words, not ours. The quotation marks are the point. */}
        {/* ⚠ FOLDED, NOT SHORTENED. These are the client's own words and the record never edits
            them; the clamp hides lines, and every one of them is still there on request. Four,
            because the point of the quote is the voice, and one line of it carries none. */}
        <More lines={4} label="Read the whole thing" less="Fold it back">
          <blockquote className="dd-ns-words">{ns.words}</blockquote>
        </More>
        <p className="dd-ns-said">
          {/* The North Star opens every record, and the person who said it was the one mention on
              it with no way in. Their page holds the role, the reports and the sessions. */}
          {sayer ? <a className="dd-either-a" href={itemHref(ctx.slug, 'person', sayer.id)}>{said}</a> : said}
          {ns.saidOn ? `, ${ns.saidOn}` : ''}
          <span className="dd-ns-verbatim">their own words, unedited</span>
        </p>

        <div className="dd-ns-read">
          <div>
            <h3 className="dd-sub">How clear it is</h3>
            <Chip tone={ns.clarity === 'unequivocal' ? 'ev-held' : ns.clarity === 'partly clear' ? 'cert-indicated' : 'cert-unknown'}>
              {ns.clarity}
            </Chip>
            {ns.gap
              ? <p className="dd-ns-gap">{ns.gap}</p>
              : ns.clarity !== 'unequivocal'
                ? <p className="dd-ns-gap">Marked as {ns.clarity}, but nothing says what is unclear. That is the thing to put to them.</p>
                : null}
          </div>
          <div>
            <h3 className="dd-sub">Does the ambition match the business</h3>
            <Chip tone={ns.ambition === 'matches' ? 'ev-held' : ns.ambition === 'not yet tested' ? 'cert-unknown' : 'st-blocked'}>
              {ns.ambition}
            </Chip>
            {ns.ambition === 'not yet tested' && (
              <p className="dd-ns-gap">Nobody has had that conversation with them yet.</p>
            )}
          </div>
        </div>

        <div className="dd-ns-target">
          <h3 className="dd-sub">What we intend to leave them with</h3>
          {ns.target
            ? <p>{ns.target}</p>
            : <p className="dd-ns-gap">
                Not stated. The target state has to <b>exceed</b> what they asked for, and until it is
                written down there is nothing to hold this engagement to.
              </p>}
        </div>
        {ns.note && <p className="dd-ns-note">{ns.note}</p>}

        {ctx.staff && (
          <button type="button" className="gs-btn ghost sm" disabled={!open}
            title={open ? undefined : ctx.canAuthor?.why}
            onClick={() => ctx.openDrawer({ mode: 'northstar' })}>Edit the North Star</button>
        )}
      </div>
    </section>
  );
}

function Overview({ eng, plan, cover, go, ctx, onDetails, onAdd, asClient, findings , goQuestions = null}) {
  const { map, staff, canAuthor } = ctx;
  // Each id carries its kind and a label, because the bar below counts blocked items and a count
  // with no way through to the things it counts is a dead end: the kind is what makes a link.
  const allItems = useMemo(() => [
    ...plan.PROCESSES.map((p) => ({ id: p.id, kind: 'process', label: `${p.num} ${p.name}`.trim() })),
    ...plan.QUESTIONS.flatMap((q) => q.items.map((i) => ({ id: i.id, kind: 'question', label: i.q }))),
    ...plan.EVIDENCE.map((e) => ({ id: e.id, kind: 'evidence', label: e.item })),
    ...plan.SESSIONS.map((s) => ({ id: s.id, kind: 'session', label: s.name || s.person })),
  ], [plan]);
  const allIds = useMemo(() => allItems.map((x) => x.id), [allItems]);
  const overall = progressOf(map, allIds);
  const sharedCount = allIds.filter((id) => isShared(map, id)).length;
  // What the bar calls "waiting". The working note is the nearest thing the state layer holds to
  // a reason, so it rides along where somebody wrote one.
  const blocked = useMemo(() => allItems
    .map((x) => ({ ...x, note: stateOf(map, x.id).note }))
    .filter((x) => stateOf(map, x.id).status === 'blocked'), [allItems, map]);
  // The sponsor is free text on the engagement; when the record holds them as a person, the name
  // is the way to their page rather than a word to carry over to the Organisation tab.
  const sponsor = eng.sponsor ? personNamed(plan, eng.sponsor) : null;

  // ⚠ EVERY SEGMENT IS A COUNT OF SOMETHING THE RECORD HOLDS. Nothing here is illustrative: a tile
  // showing a plausible bar with nothing behind it would be the most damaging thing on this page,
  // because a dashboard is read as fact at a glance and never checked.
  const dash = useMemo(() => {
    const procs = plan.PROCESSES || [];
    const qs = (plan.QUESTIONS || []).flatMap((g) => g.items || []);
    const ev = plan.EVIDENCE || [];
    const ss = plan.SESSIONS || [];
    const bs = plan.BUILDS || [];
    const ppl = (plan.PEOPLE || []).filter((n) => n.side === 'client');
    const covered = new Set(ss.flatMap((x) => x.covers || []));
    const opps = plan.OPPORTUNITIES || [];
    const served = new Set(bs.map((b) => b.opportunityId).filter(Boolean));
    const STOPPED = ['considering', 'deferred', 'tabled', 'cancelled'];
    return {
      // ⚠ NO "named only" SEGMENT. The first version had one and it could never be anything but
      // zero: buildItem refuses a process without `howToday`, so every process in the record has
      // been walked by definition. A segment the record cannot produce is a claim that it
      // distinguishes something it does not.
      processes: { n: procs.length, parts: [
        { n: procs.filter((x) => (x.steps || []).length).length, tone: 'done', label: 'mapped inside' },
        { n: procs.filter((x) => !(x.steps || []).length).length, tone: 'open', label: 'inside not mapped' },
      ] },
      questions: { n: qs.length, parts: [
        { n: qs.filter((q) => q.certainty === 'known').length, tone: 'done', label: 'known' },
        { n: qs.filter((q) => q.certainty === 'indicated').length, tone: 'warn', label: 'to validate' },
        { n: qs.filter((q) => q.certainty === 'unknown').length, tone: 'open', label: 'to investigate' },
      ] },
      // ⚠ THE PARTS HAVE TO ACCOUNT FOR EVERY ITEM. `accepted` was added to the acquisition states
      // and had no segment, so an accepted limitation counted toward the total and appeared in none
      // of the bands: the bar silently stopped summing to the number above it.
      evidence: { n: ev.length, parts: [
        { n: ev.filter((x) => x.state === 'held' || x.state === 'ours').length, tone: 'done', label: 'held' },
        { n: ev.filter((x) => x.state === 'partial').length, tone: 'warn', label: 'partial' },
        { n: ev.filter((x) => x.state === 'missing').length, tone: 'open', label: 'missing' },
        { n: ev.filter((x) => x.state === 'accepted').length, tone: 'idle', label: 'accepted limitation' },
      ] },
      sessions: { n: ss.length, parts: [
        { n: qs.filter((q) => covered.has(q.id)).length, tone: 'done', label: 'questions covered' },
        { n: qs.filter((q) => !covered.has(q.id)).length, tone: 'open', label: 'nobody set to answer' },
      ] },
      builds: { n: bs.length, parts: [
        { n: bs.filter((b) => b.state === 'live' || b.state === 'building').length, tone: 'done', label: 'under way' },
        { n: bs.filter((b) => b.state === 'agreed' || b.state === 'proposed').length, tone: 'open', label: 'on the table' },
        { n: bs.filter((b) => STOPPED.includes(b.state)).length, tone: 'idle', label: 'stopped' },
      ] },
      // The middle of the chain. Without a tile here the Overview counted what we PROPOSED and what
      // we ASKED and nothing about what either was FOR.
      opportunities: { n: opps.length, parts: [
        { n: opps.filter((o) => served.has(o.id)).length, tone: 'done', label: 'with something proposed' },
        { n: opps.filter((o) => !served.has(o.id)).length, tone: 'open', label: 'nothing proposed yet' },
      ] },
      people: { n: ppl.length, parts: [
        { n: ppl.filter((x) => x.unitId).length, tone: 'done', label: 'placed in a team' },
        { n: ppl.filter((x) => !x.unitId).length, tone: 'open', label: 'unplaced' },
      ] },
    };
  }, [plan]);

  // Where the record currently says more than what stands behind it. Counted, never scored.
  const rigour = useMemo(() => {
    const ev = plan.EVIDENCE || [];
    const bs = plan.BUILDS || [];
    const opps = plan.OPPORTUNITIES || [];
    const assessed = new Set((plan.COMPLEXITY || []).map((x) => x.buildId));
    const served = new Set(bs.map((b) => b.opportunityId).filter(Boolean));
    const live = (findings || []).filter((f) => f.state !== 'superseded' && f.state !== 'rejected');
    // Three of these keep the ITEMS, not just their count: a number with no way through to the
    // things it counts is a dead end, so those bullets link each one. Drifted questions stay a
    // count because their list, with every question linked, already lives on the Pillars tab and
    // the bullet goes there; opportunities have no page of their own, so that count goes to the
    // board that holds them.
    const r = {
      unassessed: ev.filter((x) => x.vstate === 'captured'),
      unsupported: live.filter((f) => !canValidate(f).ok),
      drifted: certaintyDriftRollup(plan, findings || []).length,
      unassessedBuilds: bs.filter((b) => !assessed.has(b.id)),
      orphanOpps: opps.filter((o) => !served.has(o.id)).length,
    };
    r.total = r.unassessed.length + r.unsupported.length + r.drifted + r.unassessedBuilds.length + r.orphanOpps;
    return r;
  }, [plan, findings]);

  return (
    <>
      {/* ⚠ THE ENGAGEMENT HEADER BELONGS HERE AND ONLY HERE. Who the client is, who sponsors it,
          what stage it is at and what access we have: that is what the Overview is for, and it was
          repeated over nine other tabs where none of it was the question being asked. */}
      {/* The client's name above their own title, so the mark and the name reinforce each other
          rather than the mark standing alone beside a heading about us. No icon on that eyebrow:
          the mark IS the identity, and a glyph beside their own name is noise. */}
      <TabHead
        logo={eng.logo} logoAlt={eng.client}
        eyebrow={eng.client}
        title={eng.title}
        lead={eng.lead}
        stats={[
          { l: 'Client', v: eng.client },
          ...(eng.sponsor ? [{ l: 'Sponsor', v: sponsor && ctx.slug
            ? <a className="dd-either-a" href={itemHref(ctx.slug, 'person', sponsor.id)}>{eng.sponsor}</a>
            : eng.sponsor }] : []),
          { l: 'Stage', v: eng.stage },
          { l: 'Access', v: eng.access },
        ]}
        actions={staff && !asClient ? (
          <>
            <button type="button" className="gs-btn ghost sm" disabled={!canAuthor?.can}
              title={canAuthor?.can ? undefined : canAuthor?.why} onClick={onDetails}>Edit details</button>
            <button type="button" className="gs-btn primary sm" disabled={!canAuthor?.can}
              title={canAuthor?.can ? undefined : canAuthor?.why} onClick={onAdd}>+ Add to the record</button>
          </>
        ) : null}
      />
      {/* ⚠ THE NUMBERS WERE SIXTH ON THE PAGE, under the journey, the north star, the access
          statement and a progress bar, so an overview opened on four blocks of prose and you had
          to scroll to learn anything about the state of the work. A dashboard answers "where is
          this" before it explains anything. */}
      <div className="org-stats dd-stats dd-dash">
        <Tile icon="process" value={dash.processes.n} label="Processes" hint="walked end to end"
          onClick={go} tab="processes" parts={dash.processes.parts} empty="No process recorded" />
        <Tile icon="target" value={dash.questions.n} label="Questions" hint="and how certain we are"
          onClick={goQuestions || go} tab="evidence" parts={dash.questions.parts} empty="No question set" />
        <Tile icon="evidence" value={dash.evidence.n} label="Evidence" hint="what we hold, and do not"
          onClick={go} tab="evidence" parts={dash.evidence.parts} empty="Nothing listed" />
        <Tile icon="session" value={dash.sessions.n} label="Sessions" hint="and the questions they answer"
          onClick={go} tab="sessions" parts={dash.sessions.parts} empty="None arranged" />
        <Tile icon="link" value={dash.builds.n} label="Proposed" hint="from the assessment"
          onClick={go} tab="innovation" parts={dash.builds.parts} empty="Nothing from the assessment yet" />
        <Tile icon="target" value={dash.opportunities.n} label="Opportunities" hint="where change could pay"
          onClick={go} tab="innovation" parts={dash.opportunities.parts} empty="None identified yet" />
        <Tile icon="people" value={dash.people.n} label="People" hint="and where they sit"
          onClick={go} tab="org" parts={dash.people.parts} empty="Nobody recorded" />
      </div>
      <Bar p={overall} label="Overall progress" />
      {/* ⚠ "N WAITING" WAS A NUMBER WITH NO WAY TO THE WORK. The bar counted blocked items and the
          practitioner had to scan four tabs to find them. They are named here, each opening its
          own page, with the working note beside it where somebody wrote why. Staff only: the
          client's view has its own bar and the note is Greatstone's. */}
      {staff && blocked.length > 0 && (
        <div className="dd-waiting" role="status">
          <b>Waiting on something: </b>
          <More lines={2} className="dd-rigour-links" label="Name them all" less="Fold them back">
            {blocked.map((x) => (
              <span key={x.id} className="dd-waiting-i">
                <a className="dd-either-a" href={itemHref(ctx.slug, x.kind, x.id)}>{x.label}</a>
                {x.note && <span className="dd-waiting-why">{x.note}</span>}
              </span>
            ))}
          </More>
        </div>
      )}

      {/* ⚠ PROGRESS AND RIGOUR ARE NOT THE SAME NUMBER, and only one of them was on this page. The
          bar above says how much has been DONE; none of it says whether what has been done holds up.
          A record can be 90% complete and resting on unweighed documents, stale certainty ratings
          and conclusions nothing stands behind, and the Overview would have shown a healthy bar.
          These are counted, never scored: there is no rigour percentage, because a single
          contradicted finding matters more than ten tidy ones and an average would bury it. */}
      {ctx.staff && rigour.total > 0 && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="warn">What would not survive being asked about</Labelled></h2>
          <p className="org-sec-sub dd-lead">
            Counted, not scored. Each is a place the record says more than the evidence behind it
            currently supports.
          </p>
          <ul className="dd-list dd-list-open">
            {rigour.unassessed.length > 0 && (
              <li>
                <strong>{rigour.unassessed.length}</strong> evidence item{rigour.unassessed.length === 1 ? '' : 's'} held
                but never weighed. Holding a document and having assessed it are different facts.
                {/* The count alone was a dead end: it named a number and left the reader to open
                    every evidence page hunting for which items it meant. The items ARE the finding,
                    and each opens the page where the weighing happens. */}
                <More lines={2} className="dd-rigour-links">
                  {rigour.unassessed.map((e) => (
                    <a key={e.id} className="dd-either-a" href={evidenceHref(ctx.slug, e.id)}>{e.item}</a>
                  ))}
                </More>
              </li>
            )}
            {rigour.unsupported.length > 0 && (() => {
              // A finding lives on its question's page, which is where a source can be given, so
              // the way through is the QUESTION, deduplicated: three unsupported findings on one
              // question are one place to go. A finding attached to no question has no page to
              // open, so it is said in words rather than linked to nothing.
              const qids = [...new Set(rigour.unsupported.map((f) => f.questionId).filter(Boolean))];
              const linked = qids.map((id) => findItem(plan, id)).filter((x) => x && x.kind === 'question');
              const loose = rigour.unsupported.filter((f) => !f.questionId).length;
              return (
                <li>
                  <strong>{rigour.unsupported.length}</strong> finding{rigour.unsupported.length === 1 ? '' : 's'} with
                  nothing identifiable behind {rigour.unsupported.length === 1 ? 'it' : 'them'}, so
                  {rigour.unsupported.length === 1 ? ' it cannot' : ' they cannot'} be validated as
                  {rigour.unsupported.length === 1 ? ' it stands' : ' they stand'}.
                  {loose > 0 && (
                    <> {loose === 1 ? 'One is' : `${loose} are`} attached to no question, so {loose === 1 ? 'it has' : 'they have'} no page to open.</>
                  )}
                  {linked.length > 0 && (
                    <More lines={2} className="dd-rigour-links">
                      {linked.map((x) => (
                        <a key={x.item.id} className="dd-either-a" href={itemHref(ctx.slug, 'question', x.item.id)}>{x.item.q}</a>
                      ))}
                    </More>
                  )}
                </li>
              );
            })()}
            {rigour.drifted > 0 && (
              <li>
                {/* The list of WHICH questions, each linked, is the "Ratings that no longer match
                    the answers" section on the Pillars tab; the count is the way there rather
                    than a second copy of that list. */}
                <button type="button" className="dd-tie-go" onClick={() => go('evidence')}>
                  <strong>{rigour.drifted}</strong> question{rigour.drifted === 1 ? '' : 's'}
                </button>{' '}
                whose certainty no longer matches what the findings show.
              </li>
            )}
            {rigour.unassessedBuilds.length > 0 && (
              <li>
                <strong>{rigour.unassessedBuilds.length}</strong> initiative{rigour.unassessedBuilds.length === 1 ? '' : 's'} with
                no delivery complexity assessed, so effort and impact are the only things between
                a proposal and a commitment.
                {/* Each one opens its own page, where the assessment is recorded; the count alone
                    sent the reader to Innovation to work out by eye which of eleven it meant. */}
                <More lines={2} className="dd-rigour-links">
                  {rigour.unassessedBuilds.map((b) => (
                    <a key={b.id} className="dd-either-a" href={itemHref(ctx.slug, 'build', b.id)}>{b.name}</a>
                  ))}
                </More>
              </li>
            )}
            {rigour.orphanOpps > 0 && (
              <li>
                {/* An opportunity has no page of its own; the board is the surface that holds
                    them, and it marks the ones nothing serves. */}
                <button type="button" className="dd-tie-go" onClick={() => go('innovation')}>
                  <strong>{rigour.orphanOpps}</strong> opportunit{rigour.orphanOpps === 1 ? 'y' : 'ies'}
                </button>{' '}
                {rigour.orphanOpps === 1 ? 'has' : 'have'} nothing proposed to realise {rigour.orphanOpps === 1 ? 'it' : 'them'}.
              </li>
            )}
          </ul>
        </section>
      )}

      <Journey eng={eng} ctx={ctx} />
      <NorthStar plan={plan} eng={eng} ctx={ctx} />
      <section className="dd-access">
        <div className="dd-access-mark" aria-hidden="true" />
        <div>
          <h2>{eng.access}</h2>
          {/* Same rule as the client view below: a note that is not there is not a paragraph. */}
          {eng.accessNote ? <p>{eng.accessNote}</p> : null}
        </div>
      </section>



      {staff && (
        <p className="dd-sharenote" role="note">
          {sharedCount === 0
            ? 'Nothing is shared with the client yet. Mark an item Shared and it appears in their view.'
            : `${sharedCount} of ${allIds.length} item${allIds.length === 1 ? '' : 's'} ${allIds.length === 1 ? 'is' : 'are'} shared with the client.`}
        </p>
      )}

      {plan.OUTCOMES?.length > 0 && (
        <Section icon="target" fold title="What this has to deliver" sub="The investigation is built backwards from these. Anything that does not serve one of them is not in the plan.">
          {/* The record's own uppercase lead-ins ("THE WORK ITSELF.") are subheadings somebody
              typed into the text; rendered inline they blend into the prose at the same weight.
              Lifted out, a contiguous run gets its heading once and the cards keep their global
              numbers. A string with no confident lead renders exactly as written. */}
          {groupByLead(plan.OUTCOMES).map((g, gi) => (
            <section key={gi} className="dd-outgrp">
              {g.lead && <h3 className="dd-outgrp-h">{g.lead}</h3>}
              <ol className="dd-outcomes" start={g.start}>
                {g.items.map((x) => (
                  <li key={x.n}><span className="dd-outcome-n">{String(x.n).padStart(2, '0')}</span><span>{x.text}</span></li>
                ))}
              </ol>
            </section>
          ))}
        </Section>
      )}

      {plan.GATHERING?.length > 0 && (
        <Section icon="source" fold title="How the evidence is gathered" sub="Ordered by how little of the client's time it costs. Anything obtainable without a person is never asked of one.">
          <ol className="dd-gather">
            {plan.GATHERING.map((g, i) => (
              <li key={i}>
                <div className="dd-gather-n">{i + 1}</div>
                {/* The titles are the list; a 1,300-character body under each one made the section
                    a wall. Folded to two lines, opened by the reader who wants that route. */}
                <div><h3>{g.title}</h3><More lines={2}><p>{g.body}</p></More></div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <Section icon="validated" fold title="What certainty means here" sub="Every item in the plan carries its current certainty, and effort follows it.">
        <div className="dd-certkey">
          {CERTAINTY_ORDER.map((k) => (
            <div key={k} className={`dd-certcard dd-cert-${k}`}>
              <div className="dd-certcard-h"><Chip tone={`cert-${k}`}>{CERTAINTY[k].label}</Chip><b>{CERTAINTY[k].verb}</b></div>
              <p>{CERTAINTY[k].blurb}</p>
              <div className="dd-certcard-f">Effort: {CERTAINTY[k].effort}</div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

/** What to call an item of any kind in a log line. The log is read by a person, so "q:1908dcbf"
 *  is not an answer. */
function labelOfItem(found) {
  const it = found?.item; if (!it) return null;
  return it.name || it.q || it.item || it.person || it.claim || it.ref || it.id || null;
}


// What the record has NOT tied to a process. John: "everything needs to revolve around the process";
// Ben: "every task, every goal within a business is made up of processes." So an item floating free
// of one is the finding, and it is counted rather than left to be noticed.
function ProcessTies({ plan, ctx, staff, onLoose = null }) {
  const c = useMemo(() => processCoverage(plan), [plan]);
  const nums = useMemo(() => new Set((plan.PROCESSES || []).map((p) => p.num)), [plan]);
  if (!staff) return null;
  const rows = [
    ['questions', c.questions], ['evidence items', c.evidence],
    ['sessions', c.sessions], ['tasks', c.tasks],
    ['proposed builds', c.builds],
  ].filter(([, v]) => v.total > 0);
  if (!rows.length) return null;
  const loose = rows.filter(([, v]) => v.loose > 0);
  const broken = rows.filter(([, v]) => v.dangling > 0);
  if (!loose.length && !broken.length) {
    return <p className="dd-ties is-tied">Everything in this record is tied to a process.</p>;
  }
  // ⚠ EACH COUNT IS A WAY THROUGH, NOT A FACT TO MEMORISE. "12 of 90 questions" with no way to
  // WHICH twelve left the reader to reconstruct the list by hand, and no other surface could
  // enumerate it. Questions land on the flat questions view already filtered; evidence lands on
  // the Knowledge tab filtered across its bands; sessions land on their own tab filtered the same
  // way; builds scroll to their own summary below on this tab. Tasks have no tab at all, so the
  // ones this counts are NAMED here, each opening the page of the person who does them.
  const kindOf = { questions: 'questions', 'evidence items': 'evidence', sessions: 'sessions' };
  const looseTasks = (plan.TASKS || []).filter((t) => !(t.processes || []).length);
  const danglingTasks = (plan.TASKS || []).filter((t) => (t.processes || []).some((n) => !nums.has(n)));
  const taskList = (list) => (
    <More lines={2} className="dd-rigour-links">
      <b>The tasks: </b>
      {list.map((t) => {
        const who = t.personId ? (plan.PEOPLE || []).find((n) => n.id === t.personId) : null;
        return who
          ? <a key={t.id} className="dd-either-a" href={itemHref(ctx.slug, 'person', who.id)}>{t.what}</a>
          : <span key={t.id} className="dd-tie-plain">{t.what}</span>;
      })}
    </More>
  );
  const count = (label, text, mode) => {
    if (label === 'proposed builds') {
      // The builds live further down this same tab, so the count scrolls to their summary line.
      return (
        <button type="button" className="dd-tie-go"
          onClick={() => document.getElementById('dd-buildsum')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
          {text}
        </button>
      );
    }
    if (!kindOf[label] || !onLoose) return text;
    return (
      <button type="button" className="dd-tie-go" onClick={() => onLoose(kindOf[label], mode)}>{text}</button>
    );
  };
  return (
    <>
      {loose.length > 0 && (
        <div className="dd-ties" role="status">
          <b>Not yet tied to a process:</b>{' '}
          {loose.map(([label, v], i) => (
            <span key={label}>{i > 0 ? ', ' : ''}{count(label, `${v.loose} of ${v.total} ${label}`, 'loose')}</span>
          ))}. Until they are, they are about the business in general rather than about any part of it.
          {looseTasks.length > 0 && taskList(looseTasks)}
        </div>
      )}
      {/* A DIFFERENT problem, and worse: these WERE tied, to something that is no longer here. */}
      {broken.length > 0 && (
        <div className="dd-ties is-broken" role="status">
          <b>Pointing at a process that is not in this record:</b>{' '}
          {broken.map(([label, v], i) => (
            <span key={label}>{i > 0 ? ', ' : ''}{count(label, `${v.dangling} ${label}`, 'dangling')}</span>
          ))}. A process was removed and these kept its number, so they read as being about nothing.
          {danglingTasks.length > 0 && taskList(danglingTasks)}
        </div>
      )}
    </>
  );
}

// ── what the GITA proposed ────────────────────────────────────────────────────────────────────
//
// The engagement is working TOWARDS these. Understanding the processes as they run today is half the
// job; the other half is knowing what a proposed thing would actually do inside THIS business, and
// what has to be true before anyone can say so.
//
// It sits in the Processes tab because a build is about a chain: it changes one, or it is a proposal
// about nothing. The per-build detail stays on the process page, beside how that chain runs today.
//
// ⚠ THIS COMMENT USED TO SAY "rather than a tab of its own", AND THAT STOPPED BEING TRUE. The
// Innovation tab now renders the same unfiltered `plan.BUILDS` as its own board, so the list is on
// two tabs at once and the rationale here explained a decision the portal had already reversed.
// Whether both surfaces should exist is John's call and is flagged to him; what is NOT in question
// is that the two must agree on what the list is called, which is why the heading below matches the
// Innovation tab, the drawer group and the build page crumb.
function Builds({ plan, ctx }) {
  const builds = plan.BUILDS || [];
  const byNum = useMemo(() => new Map((plan.PROCESSES || []).map((p) => [p.num, p])), [plan]);
  // A proposal naming no process cannot be placed against anything, and the record should say so
  // rather than quietly listing it with the rest.
  const unplaced = builds.filter((b) => !(b.processes || []).length);
  const openUnknowns = builds.reduce((n, b) => n + (b.unknowns || []).length, 0);

  return (
    <section className="org-sec dd-sec dd-builds">
      <div className="dd-leadrow">
        <div>
          {/* ⚠ ONE LIST, ONE NAME. This read "What the GITA proposed" while the drawer group, the
              build page crumb and the Innovation tab all said "What we proposed", so opening a
              build from here changed the name of the thing you were looking at mid click. */}
          <h2><Labelled icon="link">What we proposed</Labelled></h2>
          <p className="org-sec-sub dd-lead">
            What this engagement is working towards. The Deep Dive is how we find out what it would
            take to get there, so each one carries what it needs and what we still cannot answer.
          </p>
        </div>
        <AddButton kind="build" label="Add a proposed build" ctx={ctx} />
      </div>

      {builds.length === 0 ? (
        <div className="dd-empty">
          <h2>Nothing from the assessment is in the record yet</h2>
          <p>
            The assessment proposed things we would build for them. Until they are here, the
            investigation can establish how the business runs today and nothing about whether what we
            proposed would work inside it.
          </p>
          <div className="dd-empty-act"><AddButton kind="build" label="Add the first one" ctx={ctx} /></div>
        </div>
      ) : (
        <>
          {/* The id is the anchor the ties banner scrolls to: "N proposed builds tied to no
              process" up there and "N tied to no process" here are the same finding. */}
          <div className="dd-buildsum" id="dd-buildsum">
            <span>{builds.length} proposed</span>
            {/* Lime: an unknown is the open work this whole section exists to surface. */}
            {openUnknowns > 0 && <span className="dd-buildsum-open">{openUnknowns} still to find out</span>}
            {unplaced.length > 0 && <span className="dd-buildsum-warn">{unplaced.length} tied to no process</span>}
          </div>
          <ul className="dd-buildl">
            {builds.map((b) => {
              const touches = (b.processes || []).map((n) => byNum.get(n)).filter(Boolean);
              return (
                <li key={b.id} className={`dd-build dd-bs-${b.state}`}>
                  <div className="dd-build-h">
                    {b.ref && <span className="dd-build-ref">{b.ref}</span>}
                    {/* The name opens the proposal's own page, the only surface with its demo,
                        opportunity and complexity; EditLink stays the separate edit affordance. */}
                    <h3><a className="dd-q-link" href={itemHref(ctx.slug, 'build', b.id)}>{b.name}</a></h3>
                    <span className={`dd-chip dd-bstate dd-bstate-${b.state}`}>{b.state}</span>
                    <EditLink kind="build" item={b} ctx={ctx} />
                  </div>
                  {b.what && <p className="dd-build-what">{b.what}</p>}
                  <div className="dd-build-l">
                    <h4 className="dd-sub">What it changes</h4>
                    {touches.length ? (
                      <div className="dd-buildp">
                        {touches.map((p) => (
                          <a key={p.id} className="dd-either-a" href={itemHref(ctx.slug, 'process', p.id)}>
                            {p.num} {p.name}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="dd-nogap">
                        No process named, so this cannot be placed against how the business actually
                        runs. That is the first thing to establish about it.
                      </p>
                    )}
                  </div>
                  <div className="dd-build-l dd-build-unknown">
                    <h4 className="dd-sub">What we still have to find out</h4>
                    {(b.unknowns || []).length
                      ? <ul>{b.unknowns.map((x, i) => <li key={i}>{x}</li>)}</ul>
                      : <p className="dd-prov-none">Nothing recorded. Either it is understood, or nobody has asked.</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function Processes({ plan, ctx, onLoose = null }) {
  const { map, staff, set, busy } = ctx;
  // What this tab is actually about: how far the walk has got. A process with no "how it works
  // today" has been named and not walked, which is the distinction that matters here.
  const pcount = useMemo(() => {
    const rows = plan.PROCESSES || [];
    return {
      all: rows.length,
      walked: rows.filter((x) => String(x.howToday || '').trim()).length,
      inside: rows.filter((x) => (x.steps || []).length).length,
      owned: rows.filter((x) => x.unitId).length,
    };
  }, [plan]);
  // Which offering's workflow is on the stage, so the detail cards below can follow the board
  // rather than repeating all nine processes underneath a picture of three.
  const [picked, setPicked] = useState(null);
  const offering = useMemo(
    () => (plan.OFFERINGS || []).find((x) => x.id === picked) || defaultOffering(plan),
    [plan, picked],
  );
  const detail = useMemo(
    () => (offering ? processesForOffering(plan, offering) : plan.PROCESSES),
    [plan, offering],
  );

  return (
    <>
      <TabHead title="How the business runs"
        lead="Every part of the business, walked end to end: how it works today, who runs it, and what happens inside it. A process nobody has walked is a name, not an understanding."
        stats={[
          { l: 'Processes', v: pcount.all },
          { l: 'Walked end to end', v: `${pcount.walked} of ${pcount.all}`, gap: pcount.walked < pcount.all },
          { l: 'Mapped inside', v: `${pcount.inside} of ${pcount.all}`, gap: pcount.inside < pcount.all },
          { l: 'Tied to a team', v: `${pcount.owned} of ${pcount.all}`, gap: pcount.owned < pcount.all },
        ]}
        actions={<>
          {/* ⚠ There was NO WAY TO CREATE AN OFFERING from the portal at all. One could only exist if
              the MCP or the seed data made it — and an offering is what turns a set of processes
              into a workflow on the board, so the board could never gain a new lane. */}
          <AddButton kind="offering" label="Add an offering" ctx={ctx} />
          <AddButton kind="process" label="Add a process" ctx={ctx} />
        </>} />

      <ProcessTies plan={plan} ctx={ctx} staff={staff} onLoose={onLoose} />

      <OfferingBoard plan={plan} slug={ctx.slug} staff={staff} canAuthor={ctx.canAuthor} busy={busy}
        map={map} selectedId={offering?.id} onSelect={setPicked}
        onEdit={(pr) => ctx.canAuthor?.can && ctx.openDrawer({ mode: 'edit', kind: 'process', item: pr })}
        onEditOffering={(o) => ctx.canAuthor?.can && ctx.openDrawer({ mode: 'edit', kind: 'offering', item: o })}
        onAddProcess={(o) => ctx.openDrawer({ mode: 'add', kind: 'process', item: { offerings: [o.ref] } })}
        onConnect={(from, to) => ctx.runOpLoud({
          type: 'edit', id: from.id, label: from.name,
          fields: { feeds: [...new Set([...(from.feeds || []), to.num])] },
        }, `That handoff could not be recorded.`)}
        onMove={(num, at) => {
          const p = (plan.PROCESSES || []).find((x) => x.num === num);
          if (p) ctx.runOpLoud({ type: 'edit', id: p.id, label: p.name, fields: { x: at.x, y: at.y } },
            `${p.name} could not be moved.`);
        }}
        onTidy={async () => {
          // Back to the automatic layout: one write per positioned process, so "tidy up" is undoable
          // by dragging rather than by restoring a backup.
          // ⚠ ONE AT A TIME, AND AWAITED. Fired as a loop of un-awaited calls, every write carried
          // the SAME row_version, so the first one won and every other was refused as a conflict:
          // three dragged boxes, one reset, a "Saved" toast, and the rejections unhandled because
          // the promises were discarded. Each write has to see the version the one before it made.
          const boxes = (offering ? processesForOffering(plan, offering) : []).filter((p) => p.x != null);
          let done = 0;
          for (const p of boxes) {
            try {
              await ctx.runOp({ type: 'edit', id: p.id, label: p.name, fields: { x: null, y: null } });
              done += 1;
            } catch (e) {
              // ⚠ THIS SAID "runOp has already surfaced it" AND STOPPED. It has not: runOp reports a
              // failure by throwing. So a tidy-up that hit a stale version left a half-reset diagram,
              // "Saved" toasts from the boxes that had worked, and NOTHING said anywhere. Stopping is
              // still right, because every remaining box would be refused against the same stale
              // version; saying so is the part that was missing.
              ctx.setWarn(`Tidied ${done} of ${boxes.length} box${boxes.length === 1 ? '' : 'es'}, then stopped: ${e.message}`);
              break;
            }
          }
        }} />

      <Builds plan={plan} ctx={ctx} />

      {detail.length > 0 && (
        <>
          <p className="dd-proc-filter">
            {offering ? `${offering.name}, in full` : `All ${detail.length} process${detail.length === 1 ? '' : 'es'}, in full`}
          </p>
          {detail.map((p) => {
            const st = stateOf(map, p.id);
            return (
              <article key={p.id} className={`dd-proc dd-proc-st-${st.status}`}>
                <header className="dd-proc-h">
                  <div className="dd-proc-ht">
                    <h3><a className="dd-q-link" href={itemHref(ctx.slug, 'process', p.id)}>{p.name}</a></h3>
                    <div className="dd-proc-pills">
                      <Chip tone={`st-${st.status}`}>{staff ? STATUS[st.status].label : STATUS[st.status].client}</Chip>
                      {(p.steps || []).length > 0 && <Chip tone="ev-held">{p.steps.length} steps inside</Chip>}
                      {p.pillars.map((pl) => <Chip key={pl} tone="pillar" title={groupOf(pl)?.name}>{pl}</Chip>)}
                    </div>
                  </div>
                  {staff && (
                    <div className="dd-rowtools">
                      <EditLink item={p} kind="process" ctx={ctx} />
                      <ItemControls id={p.id} label={p.name} state={st} onChange={set} busy={busy} />
                    </div>
                  )}
                </header>
                <div className="dd-proc-body">
                  <div className="dd-proc-today">
                    <h4>How it works today</h4>
                    <p>{p.howToday}</p>
                    <p className="dd-proc-who"><b>Who runs it.</b> {p.whoRuns}</p>
                  </div>
                  <div className="dd-proc-cols">
                    <div>
                      <h4>Already named</h4>
                      <ul className="dd-list dd-list-named">{p.pains.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    </div>
                    <div>
                      <h4>What we establish</h4>
                      <ul className="dd-list dd-list-open">{p.opens.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    </div>
                  </div>
                  <div className="dd-proc-speak">
                    <h4>Who we speak to</h4>
                    <ul className="dd-list dd-list-speak">{p.speakTo.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </div>
                </div>
              </article>
            );
          })}
        </>
      )}
    </>
  );
}

// The organisation, so a number can belong to somebody.
//
// A KPI scoped to "team" tells you the size of the claim, not whose number it is. Once the chart is
// mapped, a number hangs off a box, and the questions a record could not previously answer become
// arithmetic: which team is measured on nothing, which number belongs to nobody, where the people
// actually are.
// One person. The account marker is a FACT, not a permission: it says whether this person could
// sign in at all, and access itself still flows from the company's own account, not from here.
function PersonChip({ p, slug, staff }) {
  return (
    <a className={`dd-person dd-side-${p.side.replace(/ /g, '-')}`} href={itemHref(slug, 'person', p.id)}>
      <span className="dd-person-n">{p.name}</span>
      {p.role && <span className="dd-person-r">{p.role}</span>}
      {staff && p.accountEmail && (
        <span className="dd-person-acc" title={`Signs in as ${p.accountEmail}`}>
          {Icon.validated({ size: 12 })}account
        </span>
      )}
    </a>
  );
}

function OrgUnit({ node, plan, ctx, depth = 0 }) {
  const { unit: u } = node;
  const holds = useMemo(() => unitHolds(plan, u.id), [plan, u.id]);
  const lead = u.leadId ? (plan.PEOPLE || []).find((n) => n.id === u.leadId) : null;
  const total = holds.people.length + holds.kpis.length + holds.processes.length + holds.sessions.length;
  return (
    <li className="dd-org-li">
      <div className={`dd-org-card dd-org-${u.unitType}`}>
        <div className="dd-org-head">
          <div className="dd-org-name">
            {u.ref && <span className="dd-org-ref">{u.ref}</span>}
            <h3>{u.name}</h3>
            <Chip tone="pillar">{u.unitType}</Chip>
          </div>
          {ctx.staff && <EditLink item={u} kind="unit" ctx={ctx} />}
        </div>
        <p className="dd-org-lead">
          {lead ? <>Run by <a className="ca-link" href={itemHref(ctx.slug, 'person', lead.id)}>{lead.name}</a></>
            : u.lead ? <>Run by {u.lead}</>
            : <span className="dd-org-gap">Nobody recorded as running it</span>}
          {u.headcount ? <> · {u.headcount} on paper</> : null}
          {holds.people.length ? <> · {holds.people.length} named</> : null}
        </p>
        {u.does && <p className="dd-org-does">{u.does}</p>}
        {holds.people.length > 0 && (
          <div className="dd-org-people">
            {holds.people.map((n) => <PersonChip key={n.id} p={n} slug={ctx.slug} staff={ctx.staff} />)}
          </div>
        )}
        <div className="dd-org-holds">
          {/* Each number opens its own page, the way the lead and the people on this card already
              do: the card shows what the team is measured on, the page holds its definition,
              owner and cadence. */}
          {holds.kpis.length > 0 ? holds.kpis.map((k) => (
            <a key={k.id} className="dd-org-kpi" href={itemHref(ctx.slug, 'kpi', k.id)} title={k.definition || undefined}>
              {Icon.kpi({ size: 13 })}{k.name}
              {k.current != null && k.target != null && <b>{k.current} of {k.target}</b>}
            </a>
          )) : <span className="dd-org-gap">No number of its own</span>}
        </div>
        {(holds.processes.length > 0 || holds.sessions.length > 0) && (
          <p className="dd-org-runs">
            {/* Each process the unit runs opens its own page, the way the lead and the people
                chips already do: the portal's central entity was plain text on the org chart.
                join() cannot interleave JSX, so the separators are rendered by hand. */}
            {holds.processes.length > 0 && <>Runs {holds.processes.map((x, i) => (
              <React.Fragment key={x.id}>{i > 0 && ', '}<a className="ca-link" href={itemHref(ctx.slug, 'process', x.id)}>{x.name}</a></React.Fragment>
            ))}. </>}
            {holds.sessions.length > 0 && <>We sit with {holds.sessions.map((x) => x.person).join(', ')}.</>}
          </p>
        )}
        {total === 0 && !u.does && <p className="dd-org-gap">Nothing hangs off this yet.</p>}
      </div>
      {node.children.length > 0 && (
        <ul className="dd-org-kids">
          {node.children.map((c) => <OrgUnit key={c.unit.id} node={c} plan={plan} ctx={ctx} depth={depth + 1} />)}
        </ul>
      )}
    </li>
  );
}

// THE TARGET STATE. Ben, 6 September: "in the future state, are there going to be less processes
// attached to this individual?... now I've gone from a headcount of 23 to 16."
//
// This is the slide that sells the engagement, so it is built to survive the question "where does
// that number come from". Every figure traces to tasks a practitioner recorded and a fate they
// chose; the working is shown next to the claim, and where the evidence is thin the panel says so
// instead of rounding up. A headcount claim that cannot be defended costs more than it wins.
function TargetState({ plan, ctx }) {
  const ts = useMemo(() => targetState(plan), [plan]);
  if (!ts.tasks) {
    return (
      <section className="dd-target dd-target-empty">
        <h2><Labelled icon="up">The target state</Labelled></h2>
        <p>
          Nothing to show yet. Record what people actually do, task by task, and judge each one in
          order: eliminated, simplified, digitised, automated, augmented, agentic. Elimination is
          asked first, because removing work recovers its whole cost while automating preserves that
          cost in another form. That order is what turns this chart into a before and after rather
          than a list of things to buy.
        </p>
      </section>
    );
  }
  const thin = ts.restsOn.peopleMapped < ts.restsOn.ofPeople || ts.undecided > 0 || ts.hoursUnknown > 0;
  return (
    <section className="dd-target">
      <h2><Labelled icon="up">The target state</Labelled></h2>
      <div className="dd-target-row">
        <div className="dd-target-fig">
          <span className="dd-target-n">{ts.headcountNow}</span>
          <span className="dd-target-l">people today</span>
        </div>
        <span className="dd-target-arrow" aria-hidden="true">{Icon.arrow({ size: 26 })}</span>
        <div className="dd-target-fig is-after">
          <span className="dd-target-n">{ts.headcountAfter}</span>
          <span className="dd-target-l">once the work comes off them</span>
        </div>
        <div className="dd-target-hours">
          <span className="dd-target-n">{ts.hoursFreed}</span>
          <span className="dd-target-l">hours a week freed, of {ts.hoursNow} recorded</span>
        </div>
      </div>
      {/* ⚠ WHAT DID NOT GO ANYWHERE, BESIDE WHAT DID. Work handed to a colleague used to count as
          freed, so the figure above quietly included savings the business never makes. It is
          reported here rather than folded in, because the difference is exactly what the claim
          would fail on when somebody asks where the number came from. */}
      {(ts.hoursMoved > 0 || ts.hoursLightened > 0) && (
        <p className="dd-target-working">
          {ts.hoursMoved > 0 && (
            <>A further {ts.hoursMoved} hours across {ts.tasksMoved} task{ts.tasksMoved === 1 ? '' : 's'}{' '}
            move to somebody else. That is not counted above: the business still does that work. </>
          )}
          {ts.hoursLightened > 0 && (
            <>{ts.hoursLightened} hours are simplified, digitised or assisted rather than removed,
            so they get lighter without coming off anybody. Also not counted above.</>
          )}
        </p>
      )}

      {/* The working, beside the claim rather than behind it. */}
      <p className="dd-target-working">
        {ts.peopleFreed > 0
          ? <>That is {ts.hoursFreed} hours against a {ts.restsOn.hoursPerWeek} hour week, rounded down to {ts.peopleFreed} whole {ts.peopleFreed === 1 ? 'person' : 'people'}. </>
          : <>The freed hours do not yet add up to a whole person at {ts.restsOn.hoursPerWeek} hours a week, so the headcount is unchanged. </>}
        Built from {ts.tasks} task{ts.tasks === 1 ? '' : 's'} across {ts.restsOn.peopleMapped} of {ts.restsOn.ofPeople} people.
      </p>
      {thin && ctx.staff && (
        <p className="dd-target-thin" role="status">
          Not yet safe to put in front of a chief executive:
          {/* WHO has no tasks, not just how many: defending the headcount claim means finding
              them, and the count alone left that to diffing the org chart by eye. */}
          {ts.restsOn.peopleMapped < ts.restsOn.ofPeople && <> {ts.restsOn.ofPeople - ts.restsOn.peopleMapped} {ts.restsOn.ofPeople - ts.restsOn.peopleMapped === 1 ? 'person has' : 'people have'} no tasks recorded{ts.peopleWithNoTasks?.length ? <>: <NameLinks people={ts.peopleWithNoTasks} slug={ctx.slug} /></> : null}.</>}
          {ts.undecided > 0 && <> {ts.undecided} task{ts.undecided === 1 ? '' : 's'} still have no decision on what becomes of them.</>}
          {ts.hoursUnknown > 0 && <> {ts.hoursUnknown} are not timed, so the hours are a floor rather than a total.</>}
        </p>
      )}
    </section>
  );
}

function Organisation({ plan, ctx, slug }) {
  const tree = useMemo(() => orgTree(plan), [plan]);
  const ocount = useMemo(() => {
    const people = (plan.PEOPLE || []).filter((n) => n.side === 'client');
    return {
      units: (plan.UNITS || []).length,
      people: people.length,
      placed: people.filter((n) => n.unitId).length,
    };
  }, [plan]);
  const cover = useMemo(() => orgCoverage(plan), [plan]);
  // ⚠ THE HONEST HALF OF LINKING NAMES. Adding a picker beside every name does nothing on its own:
  // what makes the sweep finishable is the record being able to say which names it still cannot
  // follow. A name here is not an error, it may be somebody outside the business, but it is a thing
  // somebody has to decide about rather than a gap that stays invisible.
  const loose = useMemo(() => unlinkedNames(plan), [plan]);
  return (
    <>
      <TabHead title="Who does what"
        lead="The teams, the people in them, and what each person is on the hook for. A name the record cannot follow reaches nobody's page, which is why the sweep below matters."
        stats={[
          { l: 'Teams', v: ocount.units },
          { l: 'People', v: ocount.people },
          { l: 'Placed in a team', v: `${ocount.placed} of ${ocount.people}`, gap: ocount.placed < ocount.people },
          { l: 'Names not followed', v: loose.length, gap: loose.length > 0 },
        ]}
        actions={<><AddButton kind="unit" label="Add a unit" ctx={ctx} /><AddButton kind="person" label="Add a person" ctx={ctx} /><AddButton kind="task" label="Add a task" ctx={ctx} /></>} />
      {ctx.staff && loose.length > 0 && (
        <section className="org-sec dd-sec dd-loose">
          <h2><Labelled icon="warn">Names the record cannot follow</Labelled></h2>
          <p className="org-sec-sub dd-lead">
            {loose.length} {loose.length === 1 ? 'name is' : 'names are'} written on a record as words
            and tied to nobody, so whatever they are responsible for does not reach their page. Some
            will be people outside the business, which is a fine answer, it just has to be an answer.
          </p>
          <ul className="dd-loose-l">
            {loose.slice(0, 24).map((x, i) => (
              <li key={`${x.id}-${x.field}-${i}`}>
                <span className="dd-loose-n">{x.said}</span>
                <span className="dd-loose-w">
                  {x.field} on{' '}
                  {ITEM_KINDS.includes(x.kind)
                    ? <a href={itemHref(slug, x.kind, x.id)}>{x.label}</a>
                    : <span>{x.label}</span>}
                </span>
              </li>
            ))}
          </ul>
          {loose.length > 24 && <p className="ca-note">and {loose.length - 24} more.</p>}
        </section>
      )}

      {/* Keyed on BOTH, because people can be named long before anybody draws the boxes: that is the
          normal order, since the names come out of the sessions. Keying the empty state on units
          alone hid ten real people behind "not mapped yet". */}
      {tree.length === 0 && cover.named === 0 ? (
        <div className="dd-empty">
          <h2>The organisation is not mapped yet</h2>
          <p>
            Until it is, every number in this record belongs to the business in general rather than
            to anybody in particular, two teams doing the same job cannot be compared, and nothing
            says who we still have to speak to.
          </p>
        </div>
      ) : (
        <>
          <TargetState plan={plan} ctx={ctx} />
          <div className="dd-org-stats">
            <div><dt>Units mapped</dt><dd>{cover.units}</dd></div>
            <div><dt>People named</dt><dd>{cover.named}{cover.headcount ? <span className="dd-org-of"> of {cover.headcount}</span> : null}</dd></div>
            <div><dt>Can sign in</dt><dd>{cover.withAccount}</dd></div>
            <div><dt>Numbers assigned</dt><dd>{cover.kpis - cover.unassignedKpis} of {cover.kpis}</dd></div>
            <div><dt>Nobody is meeting</dt><dd>{cover.notBeingMet.length}</dd></div>
          </div>
          {tree.length > 0 && (
            <ul className="dd-org">
              {tree.map((n) => <OrgUnit key={n.unit.id} node={n} plan={plan} ctx={ctx} />)}
            </ul>
          )}
          {tree.length === 0 && (
            <div className="dd-empty">
              <h2>No boxes drawn yet</h2>
              <p>
                The people below are named but nothing says where they sit. Add the units and they
                can be placed, which is what lets a number belong to a team rather than to the
                business in general.
              </p>
            </div>
          )}
          {cover.unplaced.length > 0 && (
            <section className="dd-around">
              <div className="dd-board-head">
                <h2><Labelled icon="session">{tree.length ? 'Not placed in a unit' : 'The people we know about'}</Labelled></h2>
                <p className="dd-board-lead">
                  {tree.length
                    ? 'Named, but nobody has said where they sit. An unplaced person is a question rather than a tidy-up: it usually means the chart is not finished, or that they genuinely sit outside it.'
                    : 'Everybody the record names, in the words the plan uses. Nobody has been placed in a unit yet, because no units have been drawn.'}
                </p>
              </div>
              <div className="dd-org-people">
                {cover.unplaced.map((n) => <PersonChip key={n.id} p={n} slug={ctx.slug} staff={ctx.staff} />)}
              </div>
            </section>
          )}

          {(cover.unassignedKpis > 0 || cover.unitsWithNoNumber.length > 0 || cover.notBeingMet.length > 0) && ctx.staff && (
            <p className="dd-drift" role="status">
              {cover.unassignedKpis > 0 && <>{cover.unassignedKpis} number{cover.unassignedKpis === 1 ? '' : 's'} belong{cover.unassignedKpis === 1 ? 's' : ''} to nobody in particular. </>}
              {cover.unitsWithNoNumber.length > 0 && <>{cover.unitsWithNoNumber.length} unit{cover.unitsWithNoNumber.length === 1 ? ' is' : 's are'} measured on nothing: {cover.unitsWithNoNumber.slice(0, 4).map((u) => u.name).join(', ')}{cover.unitsWithNoNumber.length > 4 ? ', and more' : ''}. </>}
              {/* The point of mapping people is to notice the ones nobody is scheduled to meet. */}
              {/* This line IS the to-do list for booking sessions, so every name opens the person
                  to arrange one, and the tail is named on request rather than left as a count. */}
              {cover.notBeingMet.length > 0 && <>No session is arranged with <NameLinks people={cover.notBeingMet} slug={slug} />.</>}
            </p>
          )}
        </>
      )}
    </>
  );
}

/** One flat list of every question, filterable, with the deciding controls IN the row: the route
 *  (how it gets answered) and the sessions that will ask it. A question here can be resolved
 *  without opening anything. */
function QuestionsFlat({ plan, ctx, cov, f, setF }) {
  // The dangling test needs to know which process numbers still exist, and a row alone cannot;
  // the set rides in the filter object only at filter time, so the stored state stays plain.
  const procNums = useMemo(() => new Set((plan.PROCESSES || []).map((p) => p.num)), [plan]);
  const rows = filterRows(cov.rows, f.proc === 'dangling' ? { ...f, procNums } : f);
  const chip = (key, val, label, n = null) => (
    <button type="button" className={`dd-filter${f[key] === val ? ' is-on' : ''}`}
      aria-pressed={f[key] === val}
      onClick={() => setF((prev) => ({ ...prev, [key]: prev[key] === val ? null : val }))}>
      {label}{n != null && <span className="dd-filter-n">{n}</span>}
    </button>
  );
  const facts = cov.rows.map(rowFacts);
  const n = (pred) => facts.filter(pred).length;
  const save = (sess, fields) => ctx.runOp({ type: 'edit', id: sess.id, kind: 'session', label: sess.person, fields });
  const can = ctx.staff ? ctx.canAuthor : { can: false };
  return (
    <section className="dd-qflat">
      <div className="dd-qfilters">
        <div className="dd-filters" role="group" aria-label="Certainty">
          {chip('cert', 'unknown', 'To investigate', n((x) => x.certainty === 'unknown'))}
          {chip('cert', 'indicated', 'To validate', n((x) => x.certainty === 'indicated'))}
          {chip('cert', 'known', 'Known', n((x) => x.certainty === 'known'))}
        </div>
        <div className="dd-filters" role="group" aria-label="How it gets answered">
          {chip('routeState', 'undecided', 'Route undecided', n((x) => x.routeState === 'undecided'))}
          {chip('routeState', 'person', 'Needs a person', n((x) => x.routeState === 'person'))}
          {chip('routeState', 'gathered', 'Without a diary', n((x) => x.routeState === 'gathered'))}
        </div>
        <div className="dd-filters" role="group" aria-label="Session ties">
          {chip('tie', 'untied', 'Not tied', n((x) => !x.tied))}
          {chip('tie', 'tied', 'Tied to a session', n((x) => x.tied))}
        </div>
        {/* The process tie, which is not the session tie: this is where the Processes tab's
            "not yet tied to a process" count lands, so the filter it applies has to be one a
            reader can see lit and turn off. The dangling chip only exists while the problem does. */}
        <div className="dd-filters" role="group" aria-label="Process ties">
          {chip('proc', 'loose', 'No process', n((x) => !x.procs.length))}
          {n((x) => x.procs.some((nn) => !procNums.has(nn))) > 0
            && chip('proc', 'dangling', 'Tied to a removed process', n((x) => x.procs.some((nn) => !procNums.has(nn))))}
        </div>
        <div className="dd-filters" role="group" aria-label="Pillar">
          <label className="gs-sr-only" htmlFor="dd-qf-pillar">Pillar</label>
          <select id="dd-qf-pillar" className="dd-sel" value={f.pillar || ''}
            onChange={(e) => setF((prev) => ({ ...prev, pillar: e.target.value || null }))}>
            <option value="">Every pillar</option>
            {(plan.PILLAR_ORDER || []).map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
      </div>
      <p className="dd-qcount" role="status">
        Showing {rows.length} of {cov.rows.length}
        {Object.values(f).some(Boolean) ? '. Click a lit filter to turn it off.' : '.'}
      </p>
      {rows.length === 0 ? (
        f.open && f.routeState === 'undecided'
          ? <div className="dd-empty"><h2><Labelled icon="validated">Nothing left to decide</Labelled></h2>
              <p>Every open question has a route or a session. That is the state this view exists to reach.</p></div>
          : <div className="dd-empty"><h2>Nothing matches</h2><p>These filters rule everything out.</p></div>
      ) : (
        <ul className="dd-qs dd-qs-flat">
          {rows.map((r) => {
            const q = r.question; const x = rowFacts(r);
            return (
              <li key={q.id} className={`dd-q dd-q-${q.certainty}`}>
                <div className="dd-q-t">
                  <a className="dd-q-link" href={questionHref(ctx.slug, q.id)}>{q.q}</a>
                </div>
                <div className="dd-q-s">
                  <Chip tone="pillar">{r.pillar}</Chip>
                  <Chip tone={`cert-${q.certainty}`}>{CERTAINTY[q.certainty].label}</Chip>
                  {x.routeState === 'undecided' && q.certainty !== 'known'
                    && <Chip tone="ev-missing">Route undecided</Chip>}
                </div>
                {/* Deciding happens HERE. The route select writes the question; the tie control
                    writes the session it lands in. Nobody goes anywhere. */}
                {ctx.staff && (
                  <div className="dd-q-decide">
                    <label className="dd-q-route">
                      <span>How it gets answered</span>
                      <select className="dd-sel" value={q.route || ''} disabled={ctx.busy || !can.can}
                        onChange={(e) => ctx.runOp({ type: 'edit', id: q.id, kind: 'question', label: q.q,
                          fields: { route: e.target.value } })}>
                        <option value="">Not decided</option>
                        {ROUTES.map((rt) => <option key={rt} value={rt}>{rt}</option>)}
                      </select>
                    </label>
                    <SessionTie plan={plan} q={q} slug={ctx.slug} can={can} save={save} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Pillars({ plan, ctx, findings, preset = null, onPresetUsed = null, embedded = false }) {
  const { map, staff, set, busy } = ctx;
  const [open, setOpen] = useState(null);
  // Two ways to read the same questions: grouped under their pillars, or one flat list that can
  // be filtered. The accordion answers "how does Data look?"; the flat view answers "show me the
  // 33 nobody has decided how to answer", which cuts across every pillar (John, 10 Sep).
  const [view, setView] = useState('pillars');
  const [f, setF] = useState({});
  const cov = useMemo(() => questionCoverage(plan), [plan]);
  const counts = useMemo(() => viewCounts(cov.rows), [cov]);
  // A preset arrives from another tab, one gap stat made actionable: the Sessions tab sends
  // 'undecided', the Processes tab's ties banner sends its two process-tie filters. Apply once,
  // then hand back.
  useEffect(() => {
    if (preset === 'undecided') { setView('all'); setF(NEEDS_DECIDING); }
    else if (preset === 'proc-loose') { setView('all'); setF({ proc: 'loose' }); }
    else if (preset === 'proc-dangling') { setView('all'); setF({ proc: 'dangling' }); }
    else return;
    onPresetUsed && onPresetUsed();
  }, [preset, onPresetUsed]);
  const qcount = useMemo(() => {
    const qs = (plan.QUESTIONS || []).flatMap((g) => g.items || []);
    return {
      all: qs.length,
      unknown: qs.filter((q) => q.certainty === 'unknown').length,
      indicated: qs.filter((q) => q.certainty === 'indicated').length,
      pillars: new Set((plan.QUESTIONS || []).filter((g) => (g.items || []).length).map((g) => g.pillar)).size,
    };
  }, [plan]);
  // Where the stated certainty and the recorded answers have come apart.
  const drifted = useMemo(() => certaintyDriftRollup(plan, findings), [plan, findings]);
  return (
    <>
      {!embedded && <TabHead title="What we have to establish"
        lead="Every question the investigation has to answer, under the pillar it belongs to. Certainty decides the effort: known is stated, indicated is validated, unknown is investigated."
        stats={[
          { l: 'Questions', v: qcount.all },
          { l: 'To investigate', v: qcount.unknown, derived: true },
          { l: 'To validate', v: qcount.indicated, derived: true },
          { l: 'Pillars with questions', v: `${qcount.pillars} of ${(plan.PILLAR_ORDER || []).length}`, gap: qcount.pillars < (plan.PILLAR_ORDER || []).length, derived: true },
          ...(ctx.staff ? [{ l: 'Ratings to revisit', v: drifted.length, gap: drifted.length > 0, derived: true }] : []),
        ]}
        actions={<AddButton kind="question" label="Add a question" ctx={ctx} />} />}

      <div className="dd-qbar">
        <div className="dd-filters" role="group" aria-label="How to read the questions">
          <button type="button" className={`dd-filter${view === 'pillars' ? ' is-on' : ''}`}
            aria-pressed={view === 'pillars'} onClick={() => setView('pillars')}>By pillar</button>
          <button type="button" className={`dd-filter${view === 'all' ? ' is-on' : ''}`}
            aria-pressed={view === 'all'} onClick={() => setView('all')}>
            All questions<span className="dd-filter-n">{counts.all}</span></button>
        </div>
        {/* The one-click case this whole view exists for. */}
        <button type="button" className={`dd-filter dd-qpreset${view === 'all' && f.routeState === 'undecided' ? ' is-on' : ''}`}
          aria-pressed={view === 'all' && f.routeState === 'undecided'}
          onClick={() => { setView('all'); setF(NEEDS_DECIDING); }}>
          {Icon.warn({ size: 13 })} Needs deciding<span className="dd-filter-n">{counts.undecided}</span>
        </button>
      </div>

      {view === 'all' && <QuestionsFlat plan={plan} ctx={ctx} cov={cov} f={f} setF={setF} />}

      {/* ⚠ THE PLAN QUIETLY STOPS DESCRIBING THE INVESTIGATION. Certainty is what we SAY about a
          question; the findings are what the record can SHOW. Both are counted on this page and
          neither was ever set against the other, so a question marked "still to investigate" with
          three validated answers on it kept counting as outstanding work, and the numbers above
          slowly became fiction. This suggests and changes nothing: the rating is a judgement. */}
      {/* ⚠ INTERNAL. This is us marking our own homework: where what we SAID about a question no
          longer matches what our own findings show. A client reading "five ratings no longer match
          the answers" learns nothing about their business and something unflattering about how we
          keep our records. Same mistake as the complexity rail, caught in the same sweep. */}
      {ctx.staff && drifted.length > 0 && (
        <section className="org-sec dd-sec">
          <h2><Labelled icon="warn">Ratings that no longer match the answers</Labelled></h2>
          <p className="org-sec-sub dd-lead">
            {drifted.length} question{drifted.length === 1 ? '' : 's'} where what we said about the
            certainty and what the findings show have come apart. Nothing here has been changed for
            you.
          </p>
          <ul className="dd-list">
            {drifted.map((d) => (
              <li key={d.question.id}>
                <a className="dd-either-a" href={questionHref(ctx.slug, d.question.id)}>{d.question.q}</a>
                <br />
                <span className="dd-prov-none">{d.pillar} · {d.why} {d.suggest}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {view === 'pillars' && PILLAR_GROUPS.map((g) => (
        <div key={g.key} className="dd-pgrp">
          <div className="dd-pgrp-h"><h2>{g.name}</h2><p>{g.asks}</p></div>
          <div className="dd-pgrp-cols">
            {g.pillars.map((pillar) => {
              const qs = questionsFor(plan, pillar).items;
              const prog = progressOf(map, qs.map((q) => q.id));
              const isOpen = open === pillar;
              // ⚠ dd-pillar-BOX, not dd-pillar. This collapsible panel and the quiet tag chip
              // (`<Chip tone="pillar">`, which renders .dd-chip.dd-pillar) both claimed the bare
              // class. The panel rule sits later in the stylesheet, so it won, and every pillar chip
              // in the portal was silently restyled: 14px corners on a --dd-s-1 ground, sitting
              // beside 100px pills. One class name, one meaning.
              return (
                <div key={pillar} className={`dd-pillar-box${isOpen ? ' is-open' : ''}`}>
                  <button type="button" className="dd-pillar-h" aria-expanded={isOpen}
                    aria-controls={`dd-p-${pillar}`} onClick={() => setOpen(isOpen ? null : pillar)}>
                    <span className="dd-pillar-name">{pillar}</span>
                    <span className="dd-pillar-counts">
                      {CERTAINTY_ORDER.map((c) => {
                        const n = qs.filter((q) => q.certainty === c).length;
                        return n > 0 ? <Chip key={c} tone={`cert-${c}`} title={`${n} ${CERTAINTY[c].label}`}>{n}</Chip> : null;
                      })}
                      {/* ⚠ A PERCENTAGE OF NO QUESTIONS IS NOT 0%, IT IS UNDEFINED. Every pillar
                          rendered one, so a new engagement opened this tab on eight boxes reading
                          "0%", and on a live record an untouched pillar claimed no progress rather
                          than nothing asked. The certainty chips beside it are already conditional
                          on having something to count; this is the same rule, and the same one the
                          stat strip applies when it drops a ratio of an empty set. Opening the box
                          still says "Nothing asked here yet", which is the accurate sentence. */}
                      {qs.length > 0 && <span className="dd-pillar-pct">{prog.pct}%</span>}
                    </span>
                    <span className="dd-pillar-caret" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                  </button>
                  <div id={`dd-p-${pillar}`} className="dd-pillar-body" hidden={!isOpen}>
                    <ul className="dd-qs">
                      {qs.map((q) => {
                        const st = stateOf(map, q.id);
                        return (
                          <li key={q.id} className={`dd-q dd-q-${q.certainty}`}>
                            <div className="dd-q-t">
                              <a className="dd-q-link" href={questionHref(ctx.slug, q.id)}>{q.q}</a>
                            </div>
                            <div className="dd-q-s">
                              <Chip tone={`cert-${q.certainty}`}>{CERTAINTY[q.certainty].label}</Chip>
                              <Chip tone={`st-${st.status}`}>{staff ? STATUS[st.status].label : STATUS[st.status].client}</Chip>
                              {q.note && <span className="dd-q-note">{q.note.replace(/^(Known|Indicated|Partly)\.\s*/i, '')}</span>}
                            </div>
                            {staff && (
                              <div className="dd-rowtools">
                                <EditLink item={{ ...q, pillar }} kind="question" ctx={ctx} />
                                <ItemControls id={q.id} label={q.q} state={st} onChange={set} busy={busy} />
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {staff && qs.length > 0 && (
                      <BulkBar ids={qs.map((q) => q.id)} what={`${qs.length} question${qs.length === 1 ? '' : 's'} in ${pillar}`} ctx={ctx} />
                    )}
                    {qs.length === 0 && (
                      <p className="dd-nogap">
                        Nothing asked here yet. Every pillar is examined, so this is a gap rather than a choice.
                      </p>
                    )}
                    {/* Both lines used to join names as plain text. A process and a session each
                        have a page, and processesFor/sessionsFor hand back the records with ids,
                        so the names are the way in. join() cannot interleave JSX, so the
                        separators are rendered by hand. */}
                    <div className="dd-pillar-foot">
                      <div><b>Surfaces in.</b> {(() => {
                        const ps = processesFor(plan, pillar);
                        return ps.length ? ps.map((p, i) => (
                          <React.Fragment key={p.id}>{i > 0 && ' · '}<a className="dd-either-a" href={itemHref(ctx.slug, 'process', p.id)}>{p.name}</a></React.Fragment>
                        )) : 'No process names it.';
                      })()}</div>
                      <div><b>Answered by.</b> {(() => {
                        const ss = sessionsFor(plan, pillar);
                        return ss.length ? ss.map((s, i) => (
                          <React.Fragment key={s.id}>{i > 0 && ' · '}<a className="dd-either-a" href={sessionHref(ctx.slug, s.id)}>{s.name || s.person}</a></React.Fragment>
                        )) : 'Nobody yet. This is a gap.';
                      })()}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

// ── one spine, five stages ────────────────────────────────────────────────────────────────────
//
// John, 6 September: "Evidence is just supporting facts that we have. Sources is just the sources
// of that evidence. Hypothesis is our prediction BEFORE we gain the evidence. What we need is also
// what we need to find out... it can be simplified while having the same amount of detail."
//
// He is right, and the five tabs were five views of ONE question: what do we believe, how far has
// it travelled, and what does it rest on? So they become one destination ordered by exactly that
// journey, and nothing is dropped: every band is the screen that used to be its own tab.
//
// Nothing is HIDDEN either. The counts for all five sit above the chips at all times, so choosing a
// band narrows what you are reading rather than concealing what exists.
const BANDS = [
  // Questions lead the spine now: the Pillars tab folded in here (John, 12 Sep: pillars are a
  // filter on the questions, not a world of their own), so what we have to establish sits beside
  // what we predicted, what is outstanding and what is held.
  { id: 'questions', label: 'Questions', icon: 'question',
    blurb: 'Every question the investigation has to answer. Read them by pillar, or flat with filters; a question can belong under more than one pillar.' },
  { id: 'predictions', label: 'Predictions', icon: 'compare',
    blurb: 'What we think before we know it. Each one says what would kill it, because a claim that cannot be disproved is an opinion.' },
  { id: 'outstanding', label: 'Outstanding', icon: 'warn',
    blurb: 'What we still have to find out, and who could answer it. Generated from the plan, so it never asks for something already established.' },
  { id: 'proposed', label: 'Proposed', icon: 'proposed',
    blurb: 'Put forward by Claude and waiting on a practitioner. Nothing here counts as established until somebody says so.' },
  { id: 'established', label: 'Established', icon: 'validated',
    blurb: 'What we actually hold, and what each piece of it rests on.' },
  { id: 'sources', label: 'Sources', icon: 'source',
    blurb: 'The people, systems and documents everything above points back to. Kept apart from the sessions: a system is never in a session, and a person can be in several.' },
];

// ONE predicate per band, used by the chip AND by the band itself, so a count can never disagree
// with what you find when you open it. The first version counted `held` only while the band showed
// every evidence row, and a chip that lies about its own contents is worse than no chip.
// A `partial` item appears under BOTH established and outstanding on purpose: part of it is held
// and part of it is not, and saying so is more honest than picking one.
export const HELD = (e) => e.state === 'held' || e.state === 'ours' || e.state === 'partial';
export const WANTED = (e) => e.state !== 'held' && e.state !== 'ours';

function Knowledge({ plan, ctx, preset = null, onPresetUsed = null, findings = [], qPreset = null, onQPresetUsed = null }) {
  const counts = useMemo(() => {
    const ev = plan.EVIDENCE || [];
    return {
      questions: (plan.QUESTIONS || []).reduce((n, g) => n + (g.items || []).length, 0),
      predictions: (plan.HYPOTHESES || []).filter((h) => h.verdict === 'open').length,
      outstanding: ev.filter(WANTED).length + (plan.SESSIONS || []).length,
      proposed: ctx.staff ? validationQueue(plan, ctx.findings).total : 0,
      established: ev.filter(HELD).length,
      sources: (plan.SOURCES || []).length,
    };
  }, [plan, ctx.findings, ctx.staff]);

  // Open on whatever needs a person. Something waiting on a practitioner outranks something waiting
  // on the client, and both outrank reading back what is already settled.
  const [band, setBand] = useState(null);
  // A question preset from another tab (undecided, process ties) lands on the questions band.
  useEffect(() => {
    if (!qPreset) return;
    setBand('questions');
    if (qPreset === 'questions') onQPresetUsed && onQPresetUsed();   // band-only: nothing for Pillars to apply
  }, [qPreset, onQPresetUsed]);
  // ⚠ THE LAST ARM WAS UNCONDITIONAL, SO THE TAB OPENED ON AN EMPTY VIEW WHILE HOLDING CONTENT.
  // With nothing proposed and nothing outstanding it fell to `established` whether or not anything
  // WAS established: a record with 24 questions, none of them yet answered, opened this tab on a
  // blank Established list with the 24 one click away and nothing on screen saying so. The
  // priority above is unchanged, because it is the right one; each arm now just has to have
  // something in it. Questions are the last resort before giving up, since they are the raw
  // material every other band is made from, and `established` stays the final fallback for a record
  // where genuinely nothing exists yet.
  const shown = band
    || (counts.proposed ? 'proposed'
      : counts.outstanding ? 'outstanding'
      : counts.established ? 'established'
      : counts.questions ? 'questions'
      : 'established');
  const meta = BANDS.find((b) => b.id === shown);
  // The Processes tab's ties banner lands here narrowed to the evidence it counted. It cannot be
  // a band: loose runs over ALL evidence, and a wanted item sits under Outstanding while a held
  // one sits under Established, so the filter spans the bands rather than picking one. Applied
  // once, then handed back; choosing a band takes the filter off.
  const [procFilter, setProcFilter] = useState(null);   // 'loose' | 'dangling' | null
  useEffect(() => {
    if (preset !== 'proc-loose' && preset !== 'proc-dangling') return;
    setProcFilter(preset === 'proc-loose' ? 'loose' : 'dangling');
    onPresetUsed && onPresetUsed();
  }, [preset, onPresetUsed]);
  const nums = useMemo(() => new Set((plan.PROCESSES || []).map((p) => p.num)), [plan]);
  const procPred = procFilter === 'loose' ? (e) => !(e.processes || []).length
    : procFilter === 'dangling' ? (e) => (e.processes || []).some((n) => !nums.has(n))
    : null;
  const procCount = procPred ? (plan.EVIDENCE || []).filter(procPred).length : 0;

  return (
    <>
      {/* ⚠ THE STATS ROW WAS THE SPINE, COUNTED TWICE. It read from the same `counts` object as the
          buttons 30px below it, so every number was identical by construction, and two of them were
          renamed on the way: "Open predictions" for Predictions and "Awaiting validation" for
          Proposed. One screen, two names for the same thing, and a whole row of numbers you could
          only read sitting above the same numbers you can click.
          The spine is the better half: it carries a sixth count (Sources) the row never had, and
          each number is a control. The one thing the row did that the spine did not was flag
          Outstanding and Proposed as GAPS, so that flag moved onto the spine rather than being
          dropped with the row. */}
      <TabHead title="What we know, and how we know it"
        lead="One spine, read left to right: what we predicted, what is still outstanding, what has been proposed, what is established, and the source each of them came from." />

      <div className="dd-spine" role="group" aria-label="Which part of the evidence">
        {BANDS.filter((b) => b.id !== 'proposed' || ctx.staff).map((b) => (
          <button key={b.id} type="button" aria-pressed={!procFilter && shown === b.id}
            className={`dd-spine-b${!procFilter && shown === b.id ? ' is-on' : ''}`}
            onClick={() => { setBand(b.id); setProcFilter(null); }}>
            {Icon[b.icon]({ size: 15 })}
            <span className="dd-spine-l">{b.label}</span>
            {/* Outstanding and Proposed are the two that mean somebody still has work to do, which
                is the flag the removed stats row carried. */}
            <span className={`dd-spine-n${(b.id === 'outstanding' || b.id === 'proposed') && counts[b.id] > 0 ? ' is-gap' : ''}`}>{counts[b.id]}</span>
          </button>
        ))}
      </div>
      {/* The band's blurb and its add control share one row: the blurb already introduces the
          band, so the panels below carry no second introduction. Two bands have nothing to add
          by hand (outstanding is generated; proposed comes from Claude) and get no button. */}
      <div className="dd-leadrow">
        <p className="dd-spine-blurb">{procFilter
          ? 'One filter across every band: evidence the record has not tied to a process is about the business in general rather than any part of it.'
          : meta.blurb}</p>
        {!procFilter && shown === 'questions' && <AddButton kind="question" label="Add a question" ctx={ctx} />}
        {!procFilter && shown === 'predictions' && <AddButton kind="hypothesis" label="Add a hypothesis" ctx={ctx} />}
        {!procFilter && shown === 'established' && <AddButton kind="evidence" label="Add evidence" ctx={ctx} />}
        {!procFilter && shown === 'sources' && <AddButton kind="source" label="Add a source" ctx={ctx} />}
      </div>

      {procFilter ? (
        <div className="dd-band" key={`proc-${procFilter}`}>
          <p className="dd-qcount" role="status">
            Showing {procCount} evidence item{procCount === 1 ? '' : 's'} {procFilter === 'loose'
              ? 'not tied to a process'
              : 'tied to a process no longer in the record'}, across every band.{' '}
            <button type="button" className="dd-tie-go" onClick={() => setProcFilter(null)}>Back to the bands</button>
          </p>
          <Evidence plan={plan} ctx={ctx} only={procPred} />
        </div>
      ) : (
        <div className="dd-band" key={shown}>
          {shown === 'questions' && <Pillars plan={plan} ctx={ctx} findings={findings} preset={qPreset} onPresetUsed={onQPresetUsed} embedded />}
        {shown === 'predictions' && <Hypotheses plan={plan} ctx={ctx} />}
          {shown === 'outstanding' && <Needs plan={plan} ctx={ctx} />}
          {shown === 'proposed' && <Validate plan={plan} ctx={ctx} />}
          {shown === 'established' && <Evidence plan={plan} ctx={ctx} only={HELD} />}
          {shown === 'sources' && <Sources plan={plan} ctx={ctx} />}
        </div>
      )}
    </>
  );
}

function Evidence({ plan, ctx, only }) {
  const { map, staff, set, busy } = ctx;
  const rows = only ? plan.EVIDENCE.filter(only) : plan.EVIDENCE;
  return (
    <>
      <div className="dd-evkey">
        {Object.entries(EVIDENCE_STATE).map(([k, v]) => (
          <span key={k} className="dd-evkey-i"><Chip tone={`ev-${k}`}>{v.label}</Chip>{rows.filter((r) => r.state === k).length}</span>
        ))}
      </div>
      <ul className="dd-ev">
        {rows.map((r) => {
          const st = stateOf(map, r.id);
          return (
            <li key={r.id} className={`dd-ev-row dd-ev-${r.state}`}>
              <div className="dd-ev-mark" aria-hidden="true" />
              <div className="dd-ev-main">
                <div className="dd-ev-h">
                  <h3><a className="dd-q-link" href={evidenceHref(ctx.slug, r.id)}>{r.item}</a></h3>
                  <Chip tone={`ev-${r.state}`}>{EVIDENCE_STATE[r.state].label}</Chip>
                  <Chip tone={`st-${st.status}`}>{staff ? STATUS[st.status].label : STATUS[st.status].client}</Chip>
                </div>
                {/* Two lines here; the held/missing/provenance split lives on the item's own page,
                    which is what the title opens. The row is a register, not the record. */}
                <p className="dd-clamp2">{r.note}</p>
                {r.processes.length > 0 && (
                  <div className="dd-ev-procs">
                    Bears on{' '}
                    {/* A resolved process is a way to its page, as it already is on the item's own
                        page; a number pointing at a process no longer in the record stays a pill,
                        because there is nothing to open. */}
                    {r.processes.map((n) => {
                      const p = plan.PROCESSES.find((x) => x.num === n);
                      return p
                        ? <a key={n} className="dd-ev-proc" href={itemHref(ctx.slug, 'process', p.id)}>{n} {p.name}</a>
                        : <span key={n} className="dd-ev-proc">{n}</span>;
                    })}
                  </div>
                )}
              </div>
              {staff && (
                <div className="dd-rowtools">
                  <EditLink item={r} kind="evidence" ctx={ctx} />
                  <ItemControls id={r.id} label={r.item} state={st} onChange={set} busy={busy} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

// KPIs. The point is not the number, it is what the number is WIRED TO: a KPI names the processes
// and questions that move it, so the record stops being a list of findings and starts being a model
// of how the business actually works. Scope matters as much as value, because a team's own number
// and a company number are different conversations and flattening them loses that.
function Kpis({ plan, ctx }) {
  const rows = plan.KPIS || [];
  const kcount = {
    all: rows.length,
    targeted: rows.filter((k) => k.target != null).length,
    owned: rows.filter((k) => k.ownerId).length,
    placed: rows.filter((k) => k.unitId).length,
  };
  // ⚠ THE GAP STATS ARE THE WAY TO THE NUMBERS THEY COUNT. Owner and unit moved off the cards onto
  // the pages on purpose, which left "N with no owner" with no way through except opening every
  // page in turn. Stat and grid share this tab, so the stat is a filter control rather than a
  // cross-tab preset; the filtered cards already open their pages.
  const [gap, setGap] = useState(null);   // 'target' | 'unit' | 'owner' | null
  const GAPS = {
    target: { pred: (k) => k.target == null, say: 'with no target' },
    unit: { pred: (k) => !k.unitId, say: 'tied to no team' },
    owner: { pred: (k) => !k.ownerId, say: 'with no owner' },
  };
  const shown = gap ? rows.filter(GAPS[gap].pred) : rows;
  const byScope = KPI_SCOPES.map((sc) => ({ scope: sc, items: shown.filter((k) => k.scope === sc) }))
    .filter((g) => g.items.length);
  // A stat with a gap behind it presses; a complete one is a fact and stays text.
  const gapStat = (key, n) => (n < kcount.all
    ? <button type="button" className="dd-tie-go" aria-pressed={gap === key}
        onClick={() => setGap((g) => (g === key ? null : key))}>{n} of {kcount.all}</button>
    : `${n} of ${kcount.all}`);

  const label = (id) => {
    const f = findItem(plan, id);
    if (!f) return id;
    return f.kind === 'process' ? `${f.item.num} ${f.item.name}`
      : f.kind === 'question' ? f.item.q
      : f.kind === 'kpi' ? f.item.name
      : f.kind === 'evidence' ? f.item.item : f.item.person;
  };

  return (
    <>
      <TabHead title="How the business measures itself"
        lead="A number the business runs on, and what moves it. Scope matters: a team's own number and a company number are different conversations."
        stats={[
          { l: 'Numbers', v: kcount.all },
          { l: 'With a target', v: gapStat('target', kcount.targeted), gap: kcount.targeted < kcount.all },
          { l: 'Tied to a team', v: gapStat('unit', kcount.placed), gap: kcount.placed < kcount.all },
          { l: 'With an owner', v: gapStat('owner', kcount.owned), gap: kcount.owned < kcount.all },
        ]}
        actions={<AddButton kind="kpi" label="Add a number" ctx={ctx} />} />

      {/* The filter stays visible as a status line with its own way off, the shape the Sessions
          and Knowledge tabs already use for theirs. */}
      {gap && (
        <p className="dd-qcount" role="status">
          Showing {shown.length} of {rows.length} number{rows.length === 1 ? '' : 's'} {GAPS[gap].say}.{' '}
          <button type="button" className="dd-tie-go" onClick={() => setGap(null)}>Show all</button>
        </p>
      )}

      {rows.length === 0 ? (
        <div className="dd-empty">
          <h2>No KPIs yet</h2>
          <p>Ask each stakeholder what they are measured by. Company numbers and a team&rsquo;s own
            numbers both belong here, and the difference between them is usually informative.</p>
        </div>
      ) : byScope.map((g) => (
        <div key={g.scope} className="dd-pgroup">
          {/* ⚠ "TEAM" ALONE MEANT TWO THINGS ON ONE SCREEN. The scope is a LEVEL (company, division,
              department, team, individual), but the stat bar above reads "Tied to a team", which is
              about the unit that owns the number, so a group headed TEAM sat beside a count saying
              nothing was tied to a team. The portal already has the unambiguous wording in its own
              empty state ("Company numbers and a team's own numbers") and on the KPI page kicker
              ("team number"), so the heading uses it too. */}
          <h2 className="dd-pgroup-h">{g.scope} numbers<span className="dd-pgroup-n">{g.items.length}</span></h2>
          <div className="dd-kpis">
            {g.items.map((k) => {
              const gap = k.current != null && k.target != null ? k.current - k.target : null;
              const good = gap == null ? null
                : k.direction === 'up' ? gap >= 0
                : k.direction === 'down' ? gap <= 0 : Math.abs(gap) < 1e-9;
              return (
                <article key={k.id} className="dd-kpi">
                  {/* The card says the number; the page is where it gets worked. What moved OFF
                      this card (owner, cadence, the affected-by list) lives there now, which is
                      what let thirteen of these stop being a wall. */}
                  <a className="dd-comp-open" href={itemHref(ctx.slug, 'kpi', k.id)}>
                    <header className="dd-kpi-h"><h3>{k.name}</h3></header>
                    {k.current != null && (
                      <div className={`dd-kpi-n${good === true ? ' is-good' : good === false ? ' is-off' : ''}`}>
                        <span className="dd-kpi-v">{k.current}</span>
                        {k.unit && <span className="dd-kpi-u">{k.unit}</span>}
                        {k.target != null && <span className="dd-kpi-sep" aria-hidden="true" />}
                        {k.target != null && (
                          <span className="dd-kpi-t">
                            {Icon[k.direction === 'down' ? 'down' : 'up']({ size: 14 })} target {k.target}
                          </span>
                        )}
                      </div>
                    )}
                    {k.definition && <p className="dd-kpi-d dd-clamp2">{k.definition}</p>}
                    <footer className="dd-comp-f">
                      <span className="dd-comp-src">{Icon.kpi({ size: 13 })} Work on this number</span>
                    </footer>
                  </a>
                  {ctx.staff && <EditLink item={k} kind="kpi" ctx={ctx} />}
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

// Everything Claude has proposed, waiting on a person. Without this, validating means hunting
// through questions one at a time, and a practitioner who has to hunt will stop — which turns
// "proposed" into "accepted by default", the exact failure practitioner validation exists to prevent.
function Validate({ plan, ctx }) {
  const q = useMemo(() => validationQueue(plan, ctx.findings), [plan, ctx.findings]);
  if (!ctx.staff) return null;

  if (q.total === 0) return (
    <>
      <div className="dd-empty">
        <h2><Labelled icon="validated">Nothing waiting</Labelled></h2>
        <p>Every proposed finding has been judged.</p>
      </div>
    </>
  );

  return (
    <>
      <div className="dd-leadrow">
        {q.replacingWork > 0 && (
          <p className="org-sec-sub dd-lead">
            {q.replacingWork} would replace something you recorded yourself, shown first.
          </p>
        )}
      </div>

      {q.byPillar.map((g) => (
        <div key={g.pillar} className="dd-pgroup">
          <h2 className="dd-pgroup-h">{g.pillar}<span className="dd-pgroup-n">{g.items.length}</span></h2>
          <div className="dd-finds">
            {g.items.map(({ finding: f, question, session, replacesValidated }) => (
              <article key={f.id} className={`dd-find dd-find-proposed${replacesValidated ? ' is-replacing' : ''}`}>
                {question && (
                  <a className="dd-vq-q" href={questionHref(ctx.slug, question.id)}>{question.q}</a>
                )}
                {replacesValidated && (
                  <p className="dd-vq-warn"><Labelled icon="warn">This replaces an answer you validated yourself.</Labelled></p>
                )}
                <p className="dd-find-t">{f.text}</p>
                <div className="dd-find-meta">
                  <Chip tone={`conf-${f.confidence}`}>{CONFIDENCE[f.confidence].label}</Chip>
                  <span className="dd-find-by">
                    {/* Before pressing Validate, the session it came from is the thing to check;
                        the name opens it. The source suffix is free text and stays outside. */}
                    {session
                      ? <a className="dd-either-a" href={sessionHref(ctx.slug, session.id)}>{session.person}</a>
                      : 'Not from a session'}{f.source ? ` · ${f.source}` : ''}
                  </span>
                </div>
                <div className="dd-find-act">
                  <button type="button" className="gs-btn primary sm" disabled={ctx.busy}
                    onClick={() => ctx.onJudge(f.id, 'validated')}>Validate</button>
                  <button type="button" className="gs-btn ghost sm" disabled={ctx.busy}
                    onClick={() => ctx.onJudge(f.id, 'rejected', '')}>Reject</button>
                  {question && <a className="dd-edit" href={questionHref(ctx.slug, question.id)}>Open the question</a>}
                </div>
              </article>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

// The hypothesis register. This is the part of the plan that keeps it honest: each claim names what
// would CONFIRM it, what would KILL it, how it is tested, and what changes if it turns out wrong.
// A confirmed one is kept rather than retired, because it is still the reason a later decision holds.
function Hypotheses({ plan, ctx }) {
  const rows = plan.HYPOTHESES || [];
  const counts = { open: rows.filter((h) => h.verdict === 'open').length,
                   confirmed: rows.filter((h) => h.verdict === 'confirmed').length,
                   killed: rows.filter((h) => h.verdict === 'killed').length };
  // ⚠ 'open' WAS THE DEFAULT WHETHER OR NOT ANY WERE OPEN. Opening on the untested claims is right
  // while there are any, but a deep dive ends with them resolved: a register of six confirmed and
  // none open opened on "Nothing here", with everything it holds behind a filter chip. Same fault
  // as the Enquiry tab's band, which fell to `established` whether or not anything was established.
  // The preference is unchanged; it just has to have something in it.
  const [only, setOnly] = useState(null);
  const pick = only || (counts.open ? 'open' : 'all');
  const shown = pick === 'all' ? rows : rows.filter((h) => h.verdict === pick);

  return (
    <>

      <div className="dd-filters" role="group" aria-label="Filter by verdict">
        {/* `pick`, the RESOLVED choice, not the raw state: with nothing chosen yet the pressed chip
            has to be the one actually filtering the list, or the register shows everything while
            "Open" claims to be on. */}
        {['open', 'confirmed', 'killed', 'all'].map((k) => (
          <button key={k} type="button" className={`dd-filter${pick === k ? ' is-on' : ''}`}
            aria-pressed={pick === k} onClick={() => setOnly(k)}>
            {k === 'all' ? 'All' : k[0].toUpperCase() + k.slice(1)}
            {k !== 'all' && <span className="dd-filter-n">{counts[k]}</span>}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="dd-empty"><h2>Nothing here</h2><p>No hypothesis with that verdict.</p></div>
      ) : (
        <div className="dd-hyps">
          {shown.map((h) => (
            <article key={h.id} className={`dd-hyp dd-hyp-${h.verdict}`}>
              {/* The claim and its falsifier ARE the hypothesis; the grounds, the test, and what
                  changes if it is wrong are the working, and the working lives on its page. */}
              <a className="dd-comp-open" href={itemHref(ctx.slug, 'hypothesis', h.id)}>
                <header className="dd-hyp-h">
                  <span className="dd-hyp-ref">{h.ref}</span>
                  <div className="dd-hyp-ht">
                    {/* The claim IS the card's title, and every other kind of card titles itself with
                        an h3. As a <p> it left a hypothesis unreachable by heading navigation and
                        jumped the level from 2 to 4. */}
                    <h3 className="dd-hyp-claim">{h.claim}</h3>
                    <div className="dd-proc-pills">
                      {h.group && <Chip tone="pillar">{h.group}</Chip>}
                      <Chip tone={`hv-${h.verdict}`}>{h.verdict === 'open' ? 'To test' : h.verdict === 'confirmed' ? 'Confirmed' : 'Killed'}</Chip>
                    </div>
                  </div>
                </header>
                {h.kills
                  ? <div className="dd-hyp-row is-kill"><h4><Labelled icon="warn">Killed by</Labelled></h4><p className="dd-clamp2">{h.kills}</p></div>
                  : <div className="dd-hyp-row is-kill"><h4><Labelled icon="warn">Killed by</Labelled></h4><p className="dd-clamp2 is-thin">No falsifier recorded, so this is an opinion so far.</p></div>}
                <footer className="dd-comp-f">
                  <span className="dd-comp-src">{Icon.question({ size: 13 })} Work on this claim</span>
                </footer>
              </a>
              {ctx.staff && <EditLink item={h} kind="hypothesis" ctx={ctx} />}
            </article>
          ))}
        </div>
      )}
    </>
  );
}

// The competitive picture. Ours to build, not the client's to supply, so every row carries where we
// found it: a competitor claim with no source is a rumour.
function Competitors({ plan, ctx }) {
  const rows = plan.COMPETITORS || [];
  const withEvidence = rows.filter((c) => String(c.evidence || '').trim()).length;
  const withLogo = rows.filter((c) => String(c.logo || '').trim()).length;
  return (
    <>
      <TabHead title="Who else is in this market"
        lead="Ours to research and bring back for correction, never something to ask the client to compile. Open one to read the finding in full."
        stats={[
          { l: 'Competitors', v: rows.length },
          { l: 'With evidence recorded', v: `${withEvidence} of ${rows.length}`, gap: withEvidence < rows.length },
          { l: 'With their mark', v: `${withLogo} of ${rows.length}`, gap: withLogo < rows.length },
        ]}
        actions={<AddButton kind="competitor" label="Add a competitor" ctx={ctx} />} />
      {/* The market itself: an Accra street, because that is the ground every organisation on this
          tab is contesting. Hotlinked from Unsplash per their terms (attribution + UTM, no local
          copy), with the emerald treatment so a photograph sits inside the portal's own light. A
          photo that fails to load takes its whole band with it rather than leaving a broken frame. */}
      <figure className="dd-tabfig">
        <img src="https://images.unsplash.com/photo-1775215595284-8eb97d44e761?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=80&w=1600"
          alt="A street market in Accra" loading="lazy" decoding="async"
          onError={(e) => { e.currentTarget.closest('figure').style.display = 'none'; }} />
        <figcaption>
          Accra. Photo by <a href="https://unsplash.com/@jiljosh?utm_source=greatstone&utm_medium=referral"
            target="_blank" rel="noopener noreferrer">Ayotunde Agbede</a> on <a
            href="https://unsplash.com/?utm_source=greatstone&utm_medium=referral"
            target="_blank" rel="noopener noreferrer">Unsplash</a>
        </figcaption>
      </figure>
      {rows.length === 0 ? (
        <div className="dd-empty"><h2>Nothing yet</h2><p>Desk research has not been brought in.</p></div>
      ) : (
        <div className="dd-comps">
          {rows.map((c) => (
            <article key={c.id} className={`dd-comp${c.evidence ? '' : ' is-nameonly'}`}>
              {/* The whole card is a way IN. The prose lives on the page: a card that carries
                  1,100 characters of finding is a wall, and thirteen of them is the tab John
                  called unreadable. */}
              <a className="dd-comp-open" href={itemHref(ctx.slug, 'competitor', c.id)}>
                <header className="dd-comp-h">
                  <CompMark name={c.name} logo={c.logo} />
                  <h3>{c.name}</h3>
                </header>
                {c.overlaps
                  ? <p className="dd-comp-o">{c.overlaps}</p>
                  : <p className="dd-comp-o is-thin">Where they meet the client is not established.</p>}
                <footer className="dd-comp-f">
                  <span className={`dd-comp-src${c.evidence ? '' : ' is-thin'}`}>
                    {c.evidence ? Icon.evidence({ size: 13 }) : Icon.warn({ size: 13 })}
                    {c.evidence ? 'Read the finding' : 'A name, not yet a finding'}
                  </span>
                </footer>
              </a>
              {ctx.staff && <EditLink item={c} kind="competitor" ctx={ctx} />}
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function Sources({ plan, ctx }) {
  const rows = plan.SOURCES || [];
  return (
    <>
      {rows.length === 0 ? (
        <div className="dd-empty"><h2>No sources recorded yet</h2>
          <p>Add the people, systems and documents this investigation will draw on.</p></div>
      ) : (
        <ul className="dd-sess">
          {rows.map((r) => (
            <li key={r.id} className="dd-sess-row">
              <div className="dd-sess-main">
                <h3>
                  <a className="dd-q-link" href={itemHref(ctx.slug, 'source', r.id)}>{r.name}</a>
                  {' '}<Chip tone="pillar">{r.sourceType}</Chip>
                  {r.link
                    ? <Chip tone="ev-held" title="This source can be opened">Reachable</Chip>
                    : !r.located && <Chip tone="ev-missing" title="Nobody has said where this is">No location</Chip>}
                </h3>
                {r.gives && <p className="dd-clamp2">{r.gives}</p>}
                {/* The gatekeeper's name opens their page when the record ties the source to a
                    person; a free-text owner stays as written. */}
                {r.access && (
                  <p className="dd-src-access">
                    Access: {r.access}
                    {r.owner && <> · via {r.ownerId
                      ? <a className="dd-either-a" href={itemHref(ctx.slug, 'person', r.ownerId)}>{r.owner}</a>
                      : r.owner}</>}
                  </p>
                )}
                {r.link && <OutLink href={r.link} />}
              </div>
              <div className="dd-sess-side">
                <div className="dd-sess-pills">{(r.pillars || []).map((x) => <Chip key={x} tone="pillar">{x}</Chip>)}</div>
                {ctx.staff && <EditLink item={r} kind="source" ctx={ctx} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Sessions({ plan, ctx, slug, onDecide = null, preset = null, onPresetUsed = null }) {
  // The coverage matrix is the one genuinely wide thing in the record; it says when it has more.
  const [mxEl, setMxEl] = useState(null);
  const mxEdges = useScrollEdges(mxEl);
  const { map, staff, set, busy } = ctx;
  const leftBySession = new Map((plan.SESSIONS || [])
    .map((x) => [x.id, sessionLeftovers(plan, map, x).length]));
  const endedWithGaps = [...leftBySession.values()].filter((n) => n > 0).length;
  const noRecord = (plan.SESSIONS || []).filter((x) => sessionNeedsRecord(map, x)).length;
  const pillars = plan.PILLAR_ORDER;
  const cov = questionCoverage(plan);
  // The Processes tab's ties banner lands here already narrowed to the sessions it counted.
  // Applied once, then handed back, the same shape as the Pillars preset; the filter itself stays
  // visible as the status line below, with its own way off.
  const [procFilter, setProcFilter] = useState(null);   // 'loose' | 'dangling' | null
  useEffect(() => {
    if (preset !== 'proc-loose' && preset !== 'proc-dangling') return;
    setProcFilter(preset === 'proc-loose' ? 'loose' : 'dangling');
    onPresetUsed && onPresetUsed();
  }, [preset, onPresetUsed]);
  const nums = useMemo(() => new Set((plan.PROCESSES || []).map((p) => p.num)), [plan]);
  const sessRows = (plan.SESSIONS || []).filter((s) => (
    procFilter === 'loose' ? !(s.processes || []).length
      : procFilter === 'dangling' ? (s.processes || []).some((n) => !nums.has(n))
      : true));
  return (
    <>
      <TabHead title="Where the Deep Dive is run"
        lead="A practitioner opens a session and works from it. Each one carries the questions it has to answer, what is already established, how long it should take and what to bring."
        stats={[
          { l: 'Sessions', v: (plan.SESSIONS || []).length },
          /* The denominator is the questions that NEED a person: known answers are stated, and a
             document-routed question is answered without a diary (Standard 4.2, 4.3). */
          { l: 'Needing a person, tied', v: `${cov.answered} of ${cov.total}`, gap: cov.answered < cov.total },
          { l: 'Nobody set to answer', v: cov.unanswerable.length, gap: cov.unanswerable.length > 0 },
          { l: 'Answered without a diary', v: cov.gathered },
          ...(endedWithGaps ? [{ l: 'Ended with questions open', v: endedWithGaps, gap: true }] : []),
          ...(noRecord ? [{ l: 'Examined, no record to open', v: noRecord, gap: true }] : []),
        ]}
        actions={<AddButton kind="session" label="Add a session" ctx={ctx} />} />
      {/* The gap stat, made actionable: the questions view opens already filtered to the ones
          needing a decision, instead of leaving the reader to reconstruct the filter by hand. */}
      {ctx.staff && onDecide && cov.unanswerable.length > 0 && (
        <div className="dd-decide-row">
          <p>{cov.unanswerable.length} question{cov.unanswerable.length === 1 ? '' : 's'} still
            {' '}need{cov.unanswerable.length === 1 ? 's' : ''} a route or a session.</p>
          <button type="button" className="gs-btn ghost sm" onClick={onDecide}>Decide them</button>
        </div>
      )}
      {procFilter && (
        <p className="dd-qcount" role="status">
          Showing {sessRows.length} session{sessRows.length === 1 ? '' : 's'} {procFilter === 'loose'
            ? 'not tied to a process'
            : 'tied to a process no longer in the record'}.{' '}
          <button type="button" className="dd-tie-go" onClick={() => setProcFilter(null)}>Show all</button>
        </p>
      )}
      <ul className="dd-sess">
        {sessRows.map((s) => {
          const st = stateOf(map, s.id);
          return (
            <li key={s.id} className="dd-sess-row">
              <div className="dd-sess-main">
                <h3>
                  {/* The purpose names the session; the people in the room stand under it (John,
                      10 Sep, from Ben's persona plan). An unnamed session falls back to its
                      person, so nothing already recorded renders blank. */}
                  <a className="dd-sess-link" href={sessionHref(slug, s.id)}>{s.name || s.person}</a>
                </h3>
                {/* Who is in the room opens their page when the session is tied to a person
                    record, the same wrap the session's own page uses for its lead. */}
                {s.name && (
                  <p className="dd-sess-who"><Labelled icon="session">
                    {s.personId
                      ? <a className="dd-q-link" href={itemHref(slug, 'person', s.personId)}>{s.person}</a>
                      : s.person}
                  </Labelled></p>
                )}
                <p className="dd-clamp2">{s.only}</p>
                <p className="dd-sess-tie">
                  {s.covers?.length
                    ? <><b>{s.covers.length}</b> question{s.covers.length === 1 ? '' : 's'} tied</>
                    : <span className="dd-sess-untied">No questions tied yet</span>}
                  {/* The process tie, on the row: the ties banner counts sessions floating free
                      of any process, and this is the only surface where one can be spotted. */}
                  {(s.processes || []).length
                    ? <> · {s.processes.length} process{s.processes.length === 1 ? '' : 'es'}</>
                    : <> · <span className="dd-sess-untied">no process tied</span></>}
                  {s.minutes ? <> · {s.minutes} min</> : null}
                  {s.objectives?.length ? <> · {s.objectives.length} objective{s.objectives.length === 1 ? '' : 's'}</> : null}
                  {leftBySession.get(s.id) > 0 && (
                    <> · <span className="dd-covgap">ended with {leftBySession.get(s.id)} open</span></>
                  )}
                  {sessionNeedsRecord(map, s) && (
                    <> · <span className="dd-covgap">no record to open</span></>
                  )}
                </p>
              </div>
              <div className="dd-sess-side">
                <div className="dd-sess-pills">
                  <Chip tone={`st-${st.status}`}>{staff ? STATUS[st.status].label : STATUS[st.status].client}</Chip>
                  {s.priority && <Chip tone={s.priority === 'critical' ? 'ev-missing' : 'pillar'}>{s.priority}</Chip>}
                  {s.method && <Chip tone="pillar">{s.method}</Chip>}
                  {s.pillars.map((p) => <Chip key={p} tone="pillar" title={groupOf(p)?.name}>{p}</Chip>)}
                  <span className="dd-sess-n">{s.pillars.length} of {pillars.length}</span>
                </div>
                {staff && (
                  <div className="dd-rowtools">
                    <EditLink item={s} kind="session" ctx={ctx} />
                    <ItemControls id={s.id} label={s.name || s.person} state={st} onChange={set} busy={busy} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Section icon="target" title="Coverage" sub="Which pillars each session carries. A pillar with no marked session is a gap, not an omission.">
        {/* Row headers are fixed-width and sticky; column headers are rotated with real padding. A
            matrix that lets these collide reads as one smear of letters while still passing every
            overflow and contrast check, because nothing compares text against text. */}
        {/* ⚠ HIDDEN COLUMNS ON A COVERAGE MATRIX ARE HIDDEN PILLARS. At 420px this table needs
            660px and gets 370, so it scrolls, which is right. It keeps its native scrollbar, which
            is more honest than the tab strip was, but on a platform with overlay scrollbars nothing
            is drawn until you already know to scroll. On a grid whose whole point is showing which
            pillars nobody covers, a column you cannot see is the exact thing you came to find. The
            same measured fade the bar uses: no fade when it all fits. */}
        <div className={`dd-mx-wrap${mxEdges}`} ref={setMxEl}>
          <table className="dd-mx">
            <caption className="gs-sr-only">Sessions by pillar. A filled dot marks a pillar the session covers.</caption>
            <thead>
              <tr>
                <th scope="col" className="dd-mx-rowh dd-mx-corner">Session</th>
                {pillars.map((p) => <th key={p} scope="col" className="dd-mx-vert"><span>{p}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {plan.SESSIONS.map((s) => (
                <tr key={s.id}>
                  {/* The header keeps dd-mx-rowh (the sticky fixed width) and nests the link,
                      named the way the list above names it, so a session spotted here for a thin
                      pillar can be opened here rather than re-found under a different label. */}
                  <th scope="row" className="dd-mx-rowh">
                    <a className="dd-sess-link" href={sessionHref(slug, s.id)}>{s.name || s.person}</a>
                  </th>
                  {pillars.map((p) => {
                    const on = s.pillars.includes(p);
                    const who = s.name || s.person;
                    return (
                      <td key={p} className={on ? 'is-on' : ''}>
                        <span className="gs-sr-only">{on ? `${who} covers ${p}` : `${who} does not cover ${p}`}</span>
                        <span aria-hidden="true">{on ? '●' : '·'}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="dd-mx-total">
                <th scope="row" className="dd-mx-rowh">Sessions covering</th>
                {pillars.map((p) => (
                  <td key={p} className={sessionsFor(plan, p).length === 0 ? 'is-gap' : ''}>{sessionsFor(plan, p).length}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

// Greatstone's own working list of what the investigation still needs. Derived from the plan, never
// kept beside it: an evidence item not yet held IS the information or access need, and a session IS
// the participation need. A separate list would drift out of step with the plan within a week.
// Turning these into requests the client answers inside the Portal is a later capability.
function Needs({ plan, ctx }) {
  const { map, staff } = ctx;
  const needs = useMemo(() => {
    const out = [];
    plan.EVIDENCE.forEach((e) => {
      if (e.state === 'ours' || e.state === 'held') return;
      out.push({ id: e.id, page: 'evidence', kind: requestKindOf(e), what: e.item, why: e.note, ev: e.state });
    });
    plan.SESSIONS.forEach((s) => {
      out.push({ id: s.id, page: 'session', kind: 'participation', what: s.person, why: s.only, pillars: s.pillars });
    });
    return out;
  }, [plan]);

  const ours = plan.EVIDENCE.filter((e) => e.state === 'ours');

  return (
    <>
      <p className="org-sec-sub dd-lead">
        {staff
          ? 'What the investigation still needs, generated from the plan so it can never ask for something already established. Asking for it through the Portal comes later; for now this is the list to work from.'
          : 'What the investigation still needs from your side.'}
      </p>
      {Object.keys(REQUEST_KIND).map((k) => {
        const rows = needs.filter((a) => a.kind === k);
        if (!rows.length) return null;
        return (
          <Section key={k} icon={{ information: 'evidence', participation: 'session' }[k]} title={REQUEST_KIND[k].label} sub={REQUEST_KIND[k].blurb}>
            <ul className="dd-req">
              {rows.map((r) => {
                const st = stateOf(map, r.id);
                return (
                  <li key={r.id} className="dd-req-row">
                    <div className="dd-req-main">
                      {/* An outstanding ask that cannot be OPENED is a dead end: the row now leads
                          to the evidence item or the session it is generated from. */}
                      <h3><a className="dd-q-link" href={itemHref(ctx.slug, r.page, r.id)}>{r.what}</a></h3>
                      <p className="dd-clamp2">{r.why}</p>
                      {r.pillars && (
                        <div className="dd-req-pills">{r.pillars.map((p) => <Chip key={p} tone="pillar">{p}</Chip>)}</div>
                      )}
                    </div>
                    <Chip tone={`st-${st.status}`}>{staff ? STATUS[st.status].label : STATUS[st.status].client}</Chip>
                  </li>
                );
              })}
            </ul>
          </Section>
        );
      })}
      {ours.length > 0 && (
        <Section title="Not asked of the client" sub="Greatstone builds these. They appear here so it is clear they are covered, not forgotten.">
          <ul className="dd-req">
            {ours.map((e) => (
              <li key={e.id} className="dd-req-row is-ours">
                {/* The one row in this band that did not open: it is an evidence record like the
                    rest, and recording progress on it happens on its page. */}
                <div className="dd-req-main">
                  <h3><a className="dd-q-link" href={evidenceHref(ctx.slug, e.id)}>{e.item}</a></h3>
                  <p className="dd-clamp2">{e.note}</p>
                </div>
                <Chip tone="ev-ours">Ours</Chip>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

// The status log. Section 4.10 asks that both sides can see what has been examined and what remains
// open; a status field answers where an item is now, not when it got there. Newest first, because the
// question a log is opened to answer is almost always "what changed since I last looked".
// The audit trail, by hand rather than by machine.
//
// "Portal" was not an answer to who changed something. A record worked by several people and by
// Claude needs the trail to name the hand, and it needs to hold the change to the PLAN as well as
// the change of status: adding a process is a bigger event than moving one to Under way, and until
// now only the second was written down anywhere a person could read.
function History({ log, plan = null, slug = null }) {
  // ⚠ The head has to be able to say when the record last moved. A change log with no sense of
  // recency reads as a list of edits rather than as the state of the work.
  const last = (log || []).length ? (log || [])[(log || []).length - 1] : null;
  // Every row names the thing that changed, and none of them opened it. The kind comes from the
  // entry where it was recorded, else from the plan; the plan lookup is the existence check either
  // way, so a removed item, a re-minted id and the engagement row ('engagement') stay plain text,
  // as does any kind without a page (task, offering, unit, opportunity, complexity).
  const hrefFor = (r) => {
    if (!plan || !slug || !r.id || r.op === 'remove') return null;
    const found = findItem(plan, r.id);
    if (!found) return null;
    const kind = r.kind || found.kind;
    return ITEM_KINDS.includes(kind) && kind === found.kind ? itemHref(slug, kind, r.id) : null;
  };
  const [who, setWho] = useState('everyone');
  const rows = useMemo(() => [...(log || [])].reverse(), [log]);

  // Who has actually touched this record, with a count each, built from the log itself rather than
  // from whoever happens to have an account.
  const people = useMemo(() => {
    const by = new Map();
    for (const r of log || []) {
      const name = whoDid(r);
      const cur = by.get(name) || { name, n: 0, mcp: r.by === 'mcp' };
      cur.n += 1;
      by.set(name, cur);
    }
    return [...by.values()].sort((a, b) => b.n - a.n);
  }, [log]);

  const shown = useMemo(
    () => (who === 'everyone' ? rows : rows.filter((r) => whoDid(r) === who)),
    [rows, who],
  );

  const day = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? 'Undated'
      : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };
  const time = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '\u2014' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  // Grouped by day, because "what happened on Tuesday" is the question a person actually asks.
  const days = useMemo(() => {
    const out = [];
    for (const r of shown) {
      const d = day(r.at);
      if (!out.length || out[out.length - 1].day !== d) out.push({ day: d, rows: [] });
      out[out.length - 1].rows.push(r);
    }
    return out;
  }, [shown]);

  if (!rows.length) return (
    <>
      <p className="org-sec-sub dd-lead">Every change to this record, and who made it.</p>
      <div className="dd-empty">
        <h2>Nothing logged yet</h2>
        <p>
          Every change is recorded here as the investigation runs: what was added, what was reworded,
          what moved, and the name of whoever did it.
        </p>
      </div>
    </>
  );

  return (
    <>
      <TabHead title="Everything that has changed"
        lead="Every change to this record, newest first, and the hand that made it. A practitioner, or a Claude session working alongside them."
        stats={[
          { l: 'Changes', v: (log || []).length },
          { l: 'Hands on it', v: new Set((log || []).map((e) => e.by || e.byName).filter(Boolean)).size },
          ...(last ? [{ l: 'Last change', v: last.label || 'the record' }] : []),
        ]} />
      <div className="dd-who" role="group" aria-label="Filter by who made the change">
        <button type="button" className={`dd-whochip${who === 'everyone' ? ' is-on' : ''}`}
          aria-pressed={who === 'everyone'} onClick={() => setWho('everyone')}>
          Everyone<span className="dd-whon">{rows.length}</span>
        </button>
        {people.map((p) => (
          <button key={p.name} type="button"
            className={`dd-whochip${who === p.name ? ' is-on' : ''}${p.mcp ? ' is-mcp' : ''}`}
            aria-pressed={who === p.name} onClick={() => setWho(p.name)}>
            {p.mcp ? Icon.proposed({ size: 14 }) : Icon.session({ size: 14 })}
            {p.name}<span className="dd-whon">{p.n}</span>
          </button>
        ))}
      </div>

      {days.map((d) => (
        <section key={d.day} className="dd-day">
          <h3 className="dd-day-h">{d.day}</h3>
          <ol className="dd-log">
            {d.rows.map((r, i) => (
              <li key={`${r.at}-${r.id}-${i}`} className="dd-log-row">
                <time className="dd-log-when" dateTime={r.at}>{time(r.at)}</time>
                <div className="dd-log-main">
                  <h4>{(() => {
                    const href = hrefFor(r);
                    return href ? <a className="dd-q-link" href={href}>{r.label || r.id}</a> : (r.label || r.id);
                  })()}</h4>
                  <p>{sayEntry(r)}</p>
                </div>
                <Who entry={r} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}

// ── the client's view: only what Greatstone has published ─────────────────────────────────────
function ClientView({ eng, plan, map }) {
  const shared = useMemo(() => {
    const pick = (rows) => rows.filter((r) => isShared(map, r.id));
    return {
      processes: pick(plan.PROCESSES),
      questions: plan.QUESTIONS.map((q) => ({ ...q, items: pick(q.items) })).filter((q) => q.items.length),
      evidence: pick(plan.EVIDENCE),
      sessions: pick(plan.SESSIONS),
    };
  }, [plan, map]);

  const ids = [
    ...shared.processes.map((p) => p.id),
    ...shared.questions.flatMap((q) => q.items.map((i) => i.id)),
    ...shared.evidence.map((e) => e.id),
    ...shared.sessions.map((s) => s.id),
  ];
  const prog = progressOf(map, ids);

  return (
    <>
      {/* ⚠ THIS SCREEN HAD NO h1 AT ALL. Every internal tab gets one from TabHead and the empty
          state renders one itself, but the client view opened straight onto the journey strip's
          h2, so the ONE SCREEN A CLIENT EVER SEES was the only screen in the portal with no
          top-level heading: nothing naming the document, and nothing for somebody navigating by
          headings to land on. Same shape as the empty state above, which already does this. */}
      <header className="dd-head">
        <div className="dd-kicker">Greatstone</div>
        <h1>{eng.client || eng.title || 'This record'}</h1>
      </header>
      <Journey eng={eng} />
      {plan.NORTH_STAR?.words && <NorthStar plan={plan} eng={eng} ctx={{ staff: false }} />}
      <section className="dd-access">
        <div className="dd-access-mark" aria-hidden="true" />
        {/* ⚠ NO EMPTY PARAGRAPH. With no note recorded this rendered <p></p>, which is chrome with
            nothing inside it, the same shape the History sections were fixed for. It costs no
            layout (0px, no margin) but it is a node in the accessibility tree that announces
            nothing, on the one screen a client ever sees. */}
        <div><h2>{eng.access}</h2>{eng.accessNote ? <p>{eng.accessNote}</p> : null}</div>
      </section>

      {ids.length === 0 ? (
        <div className="dd-empty">
          <h2>The investigation is being set up</h2>
          <p>
            Nothing has been published to this view yet. As the Deep Dive runs, what has been examined
            and what remains open will appear here.
          </p>
        </div>
      ) : (
        <>
          <Section icon="kpi" title="Where we have got to" sub="Across everything currently published to you.">
            <Bar p={prog} label="Progress" />
          </Section>

          {shared.processes.length > 0 && (
            <Section icon="process" title="Processes" sub="The parts of the business being walked end to end.">
              <ul className="dd-cli">
                {shared.processes.map((p) => {
                  const st = stateOf(map, p.id);
                  return (
                    <li key={p.id} className="dd-cli-row">
                      <div className="dd-cli-main"><h3>{p.name}</h3><p>{p.howToday}</p></div>
                      <Chip tone={`st-${st.status}`}>{STATUS[st.status].client}</Chip>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {shared.questions.length > 0 && (
            <Section icon="question" title="What we are establishing" sub="The questions this investigation answers.">
              {shared.questions.map((q) => (
                <div key={q.pillar} className="dd-cli-grp">
                  <h3 className="dd-cli-grp-h">{q.pillar}</h3>
                  <ul className="dd-cli">
                    {q.items.map((i) => {
                      const st = stateOf(map, i.id);
                      return (
                        <li key={i.id} className={`dd-cli-row dd-st-${st.status}`}>
                          <div className="dd-cli-main"><h3>{i.q}</h3>{i.note && <p>{i.note}</p>}</div>
                          <Chip tone={`st-${st.status}`}>{STATUS[st.status].client}</Chip>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </Section>
          )}

          {shared.evidence.length > 0 && (
            <Section icon="evidence" title="Evidence" sub="What is in hand, and what is still outstanding.">
              <ul className="dd-cli">
                {shared.evidence.map((e) => {
                  const st = stateOf(map, e.id);
                  return (
                    <li key={e.id} className={`dd-cli-row dd-st-${st.status}`}>
                      <div className="dd-cli-main"><h3>{e.item}</h3><p>{e.note}</p></div>
                      <Chip tone={`st-${st.status}`}>{STATUS[st.status].client}</Chip>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {shared.sessions.length > 0 && (
            <Section icon="session" title="Conversations" sub="Who we need, and what only they can give.">
              <ul className="dd-cli">
                {shared.sessions.map((s) => {
                  const st = stateOf(map, s.id);
                  return (
                    <li key={s.id} className={`dd-cli-row dd-st-${st.status}`}>
                      <div className="dd-cli-main"><h3>{s.person}</h3><p>{s.only}</p></div>
                      <Chip tone={`st-${st.status}`}>{STATUS[st.status].client}</Chip>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}
        </>
      )}
    </>
  );
}

// ── the engagement ────────────────────────────────────────────────────────────────────────────
function Engagement({ slug, staff, itemKind = null, itemId = null }) {
  const barSlot = useContext(BarSlot);
  const setBarInfo = useContext(BarInfo);
  const [load, setLoad] = useState({ status: 'loading' });
  // A synchronous mirror of `load`, so a sequence of writes in one tick each sees the one before it.
  // React state does not update until the next render, which is exactly one render too late when
  // the version of the record is what the next write has to send.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  const [map, setMap] = useState({});
  const [log, setLog] = useState([]);
  // ⚠ Same reason as loadRef: a loop of writes in ONE tick holds one ctx and one closure, so every
  // iteration passed the log, map and state version from the render that made it. On the file
  // backend iterations 2..N sent a superseded version and 409'd into a swallowed catch; on every
  // backend `setLog(w.log)` then replaced React's log with `frozenLog + one row`, so tidying five
  // boxes left ONE history entry on screen while the database held all five.
  const stateRef = useRef({ map: {}, log: [], version: null });
  const [backend, setBackend] = useState('supabase');
  const [stateVersion, setStateVersion] = useState(null);
  // AFTER the state it mirrors. Placed above `map`, this effect's own dependency array referenced
  // three consts that had not been declared yet — a temporal dead zone, so the portal threw
  // `Cannot access 'map' before initialization` on EVERY render and the page was blank.
  useEffect(() => { stateRef.current = { map, log, version: stateVersion }; }, [map, log, stateVersion]);
  const [findings, setFindings] = useState([]);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState(null);
  // ⚠ A STANDING INSTRUCTION IS NOT A TRANSIENT ERROR. "…it is no longer shared with the client.
  // Set both again if it should be." tells somebody to go and do something, and it lived in `warn`,
  // which every subsequent operation opens by clearing: one more inline save, box drag or drawer
  // save and the only notice that an item had quietly stopped being shared was gone. This channel
  // is cleared by the person reading it, not by the next thing they happen to do.
  const [notice, setNotice] = useState(null);
  // runOpLoud is declared above runOp so it can sit beside the comment explaining it; the ref is
  // how it reaches the current one without a dependency cycle.
  const runOpRef = useRef(null);
  const [tab, setTab] = useState('overview');
  // A one-shot hand-off between tabs: the Sessions gap stat sends the reader to the questions
  // view already filtered to what needs deciding, and the Processes tab's ties banner sends its
  // process-tie counts to the tab that holds each loose kind. Applied once by the receiving tab,
  // then cleared.
  const [qPreset, setQPreset] = useState(null);
  const [kPreset, setKPreset] = useState(null);
  const [sessPreset, setSessPreset] = useState(null);
  // ⚠ NOT LOCAL STATE. See the Preview context: this component has ten early returns and the
  // checkbox is rendered by only one of them, so owning the flag here made every other screen a
  // room with the lights off and no switch.
  const { on: asClient, set: setAsClient } = useContext(Preview);
  const [drawer, setDrawer] = useState(null);          // {mode, kind, item} or null
  const [canAuthor, setCanAuthor] = useState({ can: false, why: 'Checking…' });
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let live = true;
    setLoad({ status: 'loading' });
    // ⚠ EVERYTHING ELSE HERE IS RESET AND THE NOTICE WAS NOT, and <Engagement> has no key, so the
    // instance survives a hash change to a different engagement. A standing instruction earned on
    // one client's question ("…no longer shared with the client") could still be on screen over a
    // DIFFERENT CLIENT'S RECORD, with nothing in the wording to say which item it was about.
    setNotice(null); setWarn(null);
    Promise.all([loadPlan(slug), loadState(slug)])
      .then(async ([p, st]) => {
        if (!live) return;
        setMap(st.map); setLog(st.log || []); setBackend(st.backend); setStateVersion(st.version || null);
        setFindings(st.findings || []); setFiles(st.files || []);
        if (p.plan) { setLoad({ status: 'ready', ...p }); return; }
        // no record yet is a normal state, not a failure: name the client if we can, so the page
        // reads as "nothing gathered" rather than "something is wrong"
        const client = await clientNameFor(slug).catch(() => null);
        if (live) setLoad({ status: 'empty', client });
      })
      .catch((e) => { if (live) setLoad({ status: 'error', message: e.message }); });
    probeCanAuthor().then((c) => { if (live) setCanAuthor(c); });
    return () => { live = false; };
  }, [slug]);

  const set = useCallback(async (id, patch, label = null) => {
    setBusy(true); setWarn(null);
    try {
      const r = await saveItem(slug, id, patch, map, log, label, stateVersion);
      setMap(r.map); setLog(r.log); setBackend(r.backend);
      if (typeof r.version === 'string') setStateVersion(r.version);
      if (r.warning) setWarn(r.warning);
      // ⚠ THE STORE'S VERDICT, NOT `true`. `saveItem` can return normally having written NOTHING:
      // no Supabase, no dev file, and localStorage refused. Returning true there made setOrThrow
      // resolve, which closed the inline editor and threw away the practitioner's text — the exact
      // outcome setOrThrow was added to prevent.
      return r.stored !== false;
    } catch (e) { setWarn(e.message); return false; }
    finally { setBusy(false); }
  }, [slug, map, log, stateVersion]);

  /** ⚠ InlineText's contract is that onSave THROWS to report a failure: that is what keeps the
   *  editor open with the practitioner's text in it. `set` catches into `warn` and resolves, so an
   *  inline field wired straight to it would close on failure and the typing would be gone, with
   *  only a page-level banner to explain. Every other InlineText goes through runOp, which throws.
   *  This is the same shape for state. */
  const setOrThrow = useCallback(async (id, patch, label) => {
    if (!(await set(id, patch, label))) throw new Error('That could not be saved.');
  }, [set]);

  // Adopt the plan the store returns rather than the one we hoped for, so a server-side refusal or
  // a normalisation is what ends up on screen.
  // ⚠ THE CANVAS CALL SITES DISCARDED THE PROMISE. runOp reports a failure by THROWING, which the
  // drawer and the inline editors catch and display; the diagram's handoff and drag handlers threw
  // it away, so a refused write was an unhandled rejection and the box simply sprang back with the
  // banner blank. The comment claiming "runOp has already surfaced it" was describing something
  // that never happened. Anything that cannot await a runOp goes through here.
  const runOpLoud = useCallback((op, what) => Promise.resolve()
    .then(() => runOpRef.current(op))
    .catch((e) => { setWarn(`${what} ${e.message}`); }), []);

  const runOp = useCallback(async (op) => {
    // ⚠ CLEAR THE BANNER FIRST. Every other handler opens with setWarn(null); this one did not, so
    // the warning left by an earlier operation survived — and since a failure here APPENDS, two
    // unrelated operations spliced into one sentence: "The wording changed, so this is a new item…
    // Its status could not be cleared. Failed to fetch". The first clause described a change that
    // had succeeded, on a different item, minutes earlier.
    setWarn(null);
    // ⚠ READ THE PLAN AND VERSION FROM THE REF, NOT THE CLOSURE.
    // Two writes in the same tick both captured the `load` from the render that made this callback,
    // so the second sent the version the FIRST had already superseded. "Tidy up" is exactly that:
    // a loop of edits, one per positioned box. Supabase hid it because viaSupabase re-reads
    // row_version itself; the file backend answered 409 and the diagram was left half tidied.
    // The ref is updated synchronously below, so the next call in the same tick sees this one.
    const cur = loadRef.current;
    // Captured BEFORE the write, because after it the old wording is gone and the log would have
    // nothing to say about what actually changed.
    const wasPlan = cur.status === 'ready' ? cur.plan : null;
    const wasItem = op.id && wasPlan ? findItem(wasPlan, op.id) : null;
    const r = await applyRecordOp(slug, op, wasPlan, cur.version);
    // Adopt the version the store returns too, so a second edit in the same sitting is based on what
    // is actually on disk rather than on what was there when the page loaded.
    loadRef.current = { ...loadRef.current, plan: r.plan, version: r.version ?? loadRef.current.version };
    setLoad((l) => ({ ...l, plan: r.plan, version: r.version ?? l.version }));

    // Ids are content hashes, so an item removed (or reworded) leaves its status behind under an id
    // that the SAME WORDING would mint again. Re-adding it later would silently inherit the old
    // item's status AND its Shared flag: an item nobody decided to publish, published. Release the
    // id this operation orphaned, and only that one, so an unrelated regeneration keeps its history.
    if (op.type === 'remove' || op.type === 'edit') {
      // allIds, not a hand written list. Every time a new kind was added, a list like this one was
      // the thing nobody remembered to extend, and the failure is silent: an edit to a KPI whose id
      // did not change reads as "gone", and its status is released.
      const stillThere = new Set(allIds(r.plan));
      // ⚠ THE GUARD AND THE WRITE MUST READ THE SAME MAP. The write was moved to the ref and the
      // entry condition was left on the closure, so two release-triggering ops in one tick would
      // pass the guard on a row the first had already released: a second "released" entry, a
      // redundant awaited round trip, and `wasShared` undefined so the warning took the wrong
      // wording. Not reachable today; one bulk identity edit away, which is why this file exists.
      if (op.id && !stillThere.has(op.id) && stateRef.current.map[op.id]) {
        // ⚠ THE WORDING CHANGED, SO THE STATUS DOES NOT CARRY — AND THE RECORD SAYS SO.
        //
        // I built the opposite of this two ticks ago and it was the wrong call. The design is
        // stated twice in this codebase: status "detaches from an item whose wording has actually
        // changed", and the release exists so that re-adding the same wording later cannot inherit
        // an old Shared flag — "an item nobody decided to publish, published".
        //
        // Carrying the state across a rewording IS that hazard in a new shape. "What is the churn
        // rate?" reworded to "What is the churn rate by segment?" is a DIFFERENT question, and
        // carrying its Shared flag leaves a materially different question published to the client
        // with nobody having decided that. Detaching fails loudly and safely: you can see it and set
        // it again. Carrying fails quietly, and toward over-publishing.
        //
        // The real defect was never that it detached. It was that it detached IN SILENCE.
        const reminted = op.type === 'edit' && r.newId && r.newId !== op.id ? r.newId : null;
        const at = new Date().toISOString();
        // ⚠ FROM THE REF, NOT THE CLOSURE. Two release-triggering ops in one tick would otherwise
        // each build `freed` from the pre-first-op map, resurrecting the row the first one released.
        // Not reachable today — the only such loop edits x/y, which are not identity fields — but it
        // is one bulk identity edit away, and this file exists because of exactly that shape.
        const live = stateRef.current.map;
        const freed = { ...live }; delete freed[op.id];
        const wasShared = live[op.id]?.visibility === 'shared';
        const entry = { at, id: op.id, label: op.label || op.id, ...madeBy(),
          changed: { released: ['held', reminted ? 'the wording changed, so this is a new item' : 'the item left the record'] } };
        setMap(freed); setLog((l) => [...l, entry]);
        stateRef.current = { ...stateRef.current, map: freed, log: [...stateRef.current.log, entry] };

        if (reminted) {
          setNotice(wasShared
            ? 'The wording changed, so this is a new item: its status did not carry, and it is no longer shared with the client. Set both again if it should be.'
            : 'The wording changed, so this is a new item and its status did not carry.');
        }
        // ⚠ AWAITED, AND BEFORE THE CHANGE-LOG WRITE BELOW.
        // Un-awaited, this raced the logOp forty lines down: both carried the SAME version, and on
        // the file backend (one document, one ETag) the loser got a 409. The loser was usually this
        // one, so the practitioner saw "Its status could not be cleared. The status changed while
        // you were working" — which was FALSE, the log write had already cleared it — and that false
        // message REPLACED the one this whole revert exists to deliver, about the Shared flag.
        // One id, named: `replaceState(release: true)` would delete every row this browser has not
        // seen, which on a record a Claude session is also writing means deleting their work.
        try {
          const done = await releaseItem(slug, op.id, entry);
          const w = done ? null
            : await replaceState(slug, freed, stateRef.current.log, stateRef.current.version, [entry], true);
          if (typeof w?.version === 'string') { stateRef.current.version = w.version; setStateVersion(w.version); }
        } catch (e) {
          // ⚠ THE APPEND THAT EXISTED SO THIS COULD NOT ERASE THE SHARED NOTICE could still erase
          // it, because runOp does not set `busy` and two overlapping operations interleave: the
          // second one's setWarn(null) landing between this one's set and this one's append made
          // the append land on an empty banner. The Shared notice is on its own channel now, so
          // this is free to be an ordinary failure message.
          setWarn((prev) => `${prev ? `${prev} ` : ''}Its status could not be cleared. ${e.message}`);
        }
      }
    }
    // THE PLAN CHANGE ITSELF, in the same log as everything else. Adding a process, rewording a
    // question and deleting an item were the biggest changes anybody could make and none of them
    // was recorded anywhere a person could read: History showed status and visibility only.
    // ⚠ `r.newId` never existed — no store returns it — so this looked up the OLD id in the NEW plan
    // and got null for any edit that re-minted. The entry was then filed against an id nothing in
    // the record points at, so the renamed item's own history page never showed it, and diffItem
    // reported every field as blanked.
    // The store returns the id it minted, so a re-minted item is looked up directly instead of
    // being guessed from a diff against a plan this browser may be behind on.
    const after = op.type === 'remove' ? null
      : findItem(r.plan, r.newId || op.id) || findItem(r.plan, op.id);
    // Add has a minted id too, so nothing here guesses any more. lastAdded compared a server-fresh
    // plan against a browser-stale one, which on a record with a second writer returns THEIR item.
    const nowItem = after || (op.type === 'add' ? findItem(r.plan, r.newId) : null);
    const label = op.label
      || (nowItem ? labelOfItem(nowItem) : null)
      || (wasItem ? labelOfItem(wasItem) : null)
      || (op.type === 'set_engagement' ? (op.fields?.northStar ? 'The North Star' : 'Record details') : op.id);
    const changed =
      op.type === 'add' ? { added: [null, label] }
      : op.type === 'remove' ? { removed: [label, null] }
      : op.type === 'set_engagement' && op.fields?.northStar
        ? diffItem(wasPlan?.NORTH_STAR, r.plan?.NORTH_STAR)
      : op.type === 'set_engagement' ? diffItem(wasPlan?.engagement, r.plan?.engagement)
      : diffItem(wasItem?.item, nowItem?.item);
    // An edit that changed nothing is not history, it is a heartbeat.
    if (Object.keys(changed).length) {
      logOp(slug, {
        id: nowItem?.item?.id || op.id || 'engagement', label,
        op: op.type, kind: op.kind || wasItem?.kind || nowItem?.kind || null, changed,
      }, stateRef.current.log, stateRef.current.map, stateRef.current.version)
        .then((w) => {
          // FUNCTIONAL, and the ref moves with it. `setLog(w.log)` overwrote instead of appending.
          stateRef.current = { ...stateRef.current, log: w.log, version: w.version ?? stateRef.current.version };
          setLog((l) => (l.length >= w.log.length ? l : w.log));
          if (typeof w.version === 'string') setStateVersion(w.version);
        })
        .catch(() => { /* the change itself landed; a missing log line must not undo it */ });
    }

    setToast(op.type === 'remove' ? 'Removed' : op.type === 'set_engagement' ? 'Details saved' : 'Saved');
    setTimeout(() => setToast(null), 2600);
    return r;
  }, [slug, load, map, log, stateVersion]);
  // ⚠ ASSIGNED IN THE RENDER BODY, which is a rules-of-React violation: a render that is begun and
  // then discarded (an interrupted transition, a Suspense retry, StrictMode's double invoke) still
  // runs the assignment, so the ref could hold a callback from a render that never committed. It is
  // only harmless here by accident, because runOp reads everything load-bearing from refs. An
  // effect, so the ref holds a callback that actually committed; runOpLoud is reached from event
  // handlers after mount, so there is no first-render window to worry about.
  useEffect(() => { runOpRef.current = runOp; });

  // ⚠ In an effect, not during render: setting a parent's state while rendering a child is how a
  // render loop starts, and React warns about it in development and not in production.
  useEffect(() => {
    const e = load.status === 'ready' ? load.plan?.engagement : null;
    setBarInfo({ client: e?.client || null, logo: e?.logo || null, slug });
    return () => setBarInfo({ client: null, logo: null, slug: null });
  }, [load, slug, setBarInfo]);

  const removeItem = useCallback((id) => runOp({ type: 'remove', id }), [runOp]);

  /** Add somebody to the organisation from wherever you noticed they were missing.
   *
   *  ⚠ RETURNS THE NEW ID, and that is the whole point. The caller links the thing it was editing
   *  to the person it just created, so "who does this step" is answered in one motion instead of:
   *  leave the editor, go to the Organisation tab, add the person, come back, retype the step.
   *  runOp returns the minted id (newId), because the caller cannot compute a content hash. */
  const addPerson = useCallback(async ({ name, role }) => {
    const r = await runOp({ type: 'add', kind: 'person',
      fields: { name, role: role || '', side: 'client' } });
    return r?.newId || null;
  }, [runOp]);

  /** Save fields on ANY record, from anywhere, correctly labelled.
   *
   *  ⚠ ProcessPage's own saver builds its History label as `${item.num} ${item.name}`, which is
   *  process shaped. That is right for a process and wrong for everything else: hand it a build or
   *  a question and the trail records "undefined undefined". As in-place editing spreads, pages
   *  increasingly write to records that are NOT their own subject (a proposal shown on a process,
   *  a question shown on a session), so the label has to come from the record being written.
   *  `labelOf` is the same labeller setMany and the drawer already use for all thirteen kinds. */
  const saveRecord = useCallback((rec, kind, fields) => runOp({
    type: 'edit', id: rec.id, kind, label: labelOf(loadRef.current.plan || {}, rec.id), fields,
  }), [runOp]);

  // What a session established, recorded against the question it answers. This is the substance the
  // whole record exists to accumulate, so it is captured where the practitioner is: in the session.
  const recordFinding = useCallback(async (input) => {
    setBusy(true); setWarn(null);
    try {
      const r = await addFinding(slug, { ...input, by: 'portal' }, map, log, findings, stateVersion);
      setFindings(r.findings); setLog(r.log); if (r.backend) setBackend(r.backend);
      if (typeof r.version === 'string') setStateVersion(r.version);
      // ⚠ DO NOT SAY "Recorded" IF IT WAS NOT. The store can return normally having written the
      // status map and nothing else — no finding, no log — and this fired the green toast anyway.
      // The most valuable thing this record collects, confirmed as saved and gone on reload.
      if (r.warning) setWarn(r.warning);
      if (r.stored === false) setToast(null);
      else { setToast('Recorded'); setTimeout(() => setToast(null), 2400); }
    } catch (e) { setWarn(e.message); }
    setBusy(false);
  }, [slug, map, log, findings, stateVersion]);

  // The practitioner's verdict on something an agent proposed. Nothing Claude writes counts as
  // established until this happens.
  const judge = useCallback(async (findingId, verdict, note) => {
    setBusy(true); setWarn(null);
    try {
      const r = await judgeFinding(slug, findingId, verdict, note, map, log, findings, stateVersion);
      setFindings(r.findings); setLog(r.log);
      if (typeof r.version === 'string') setStateVersion(r.version);
      // Same verdict check as recordFinding: persist can succeed at writing the status map and
      // store no finding at all.
      if (r.warning) setWarn(r.warning);
      if (r.stored !== false) {
        setToast(verdict === 'validated' ? 'Validated' : 'Rejected');
        setTimeout(() => setToast(null), 2400);
      }
    } catch (e) { setWarn(e.message); }
    setBusy(false);
  }, [slug, map, log, findings, stateVersion]);

  const dropFinding = useCallback(async (findingId) => {
    setBusy(true); setWarn(null);
    try {
      const r = await removeFinding(slug, findingId, map, log, findings, stateVersion);
      setFindings(r.findings); setLog(r.log);
      if (typeof r.version === 'string') setStateVersion(r.version);
      if (r.warning) setWarn(r.warning);   // a removal that persisted nowhere comes back on reload
    } catch (e) { setWarn(e.message); }
    setBusy(false);
  }, [slug, map, log, findings, stateVersion]);

  /** Refine what we CONCLUDE from a finding. Never what was said: that is a supersede. */
  const conclude = useCallback(async (findingId, patch) => {
    setBusy(true); setWarn(null);
    try {
      const r = await concludeFinding(slug, findingId, patch, map, log, findings, stateVersion);
      setFindings(r.findings); setLog(r.log);
      if (typeof r.version === 'string') setStateVersion(r.version);
      if (r.warning) setWarn(r.warning);
      setToast('Conclusion saved');
      setTimeout(() => setToast(null), 2400);
    } catch (e) { setWarn(e.message); }
    setBusy(false);
  }, [slug, map, log, findings, stateVersion]);

  const setMany = useCallback(async (ids, patch) => {
    setBusy(true); setWarn(null);
    try {
      const label = (id) => {
        const p = (load.plan?.PROCESSES || []).find((x) => x.id === id);
        if (p) return `${p.num} ${p.name}`;
        for (const g of load.plan?.QUESTIONS || []) { const q = (g.items || []).find((x) => x.id === id); if (q) return q.q; }
        const e = (load.plan?.EVIDENCE || []).find((x) => x.id === id); if (e) return e.item;
        return (load.plan?.SESSIONS || []).find((x) => x.id === id)?.person || id;
      };
      const r = await saveMany(slug, ids, patch, map, log, label, stateVersion);
      if (r.changed === 0) { setToast('Nothing to change'); setTimeout(() => setToast(null), 2200); setBusy(false); return; }
      setMap(r.map); setLog(r.log); if (r.backend) setBackend(r.backend);
      if (typeof r.version === 'string') setStateVersion(r.version);
      if (r.warning) setWarn(r.warning);
      setToast(`${r.changed} updated`); setTimeout(() => setToast(null), 2600);
    } catch (e) { setWarn(e.message); }
    setBusy(false);
  }, [slug, map, log, stateVersion, load]);

  const attach = useCallback(async (entry) => {
    setBusy(true); setWarn(null);
    try {
      const r = await attachFile(slug, entry, map, log, findings, files, stateVersion);
      setFiles(r.files); setLog(r.log);
      if (typeof r.version === 'string') setStateVersion(r.version);
      setToast('Attached'); setTimeout(() => setToast(null), 2400);
    } catch (e) { setWarn(e.message); throw e; }
    finally { setBusy(false); }
  }, [slug, map, log, findings, files, stateVersion]);

  // itemId travels with it, so a detach removes THIS item's tie rather than the document. The
  // result says whether the bytes are now unused, which is the only time they may be destroyed.
  const detach = useCallback(async (fileId, itemId = null) => {
    setBusy(true); setWarn(null);
    try {
      const r = await detachFile(slug, fileId, map, log, findings, files, stateVersion, itemId);
      setFiles(r.files); setLog(r.log);
      if (typeof r.version === 'string') setStateVersion(r.version);
      return r;
    } catch (e) { setWarn(e.message); throw e; }
    finally { setBusy(false); }
  }, [slug, map, log, findings, files, stateVersion]);

  const onTabKey = useCallback((e, i) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const last = TABS.length - 1;
    const n = e.key === 'ArrowRight' ? (i === last ? 0 : i + 1)
      : e.key === 'ArrowLeft' ? (i === 0 ? last : i - 1)
      : e.key === 'Home' ? 0 : last;
    setTab(TABS[n].id);
    const el = document.getElementById('dd-tab-' + TABS[n].id); if (el) el.focus();
  }, []);

  if (load.status === 'loading') return <div className="ca-wrap dd-wrap"><div className="ca-center">Opening the investigation…</div></div>;
  if (load.status === 'error') return (
    <div className="ca-wrap dd-wrap"><div className="ca-center"><h2>The plan could not be read</h2><p>{load.message}</p></div></div>
  );
  if (load.status === 'empty') return (
    <div className="ca-wrap dd-wrap">
      <header className="dd-head">
        <div className="dd-kicker">Greatstone{staff ? ' workspace' : ''}</div>
        <h1>{load.client || 'This client'}</h1>
        <p className="dd-lead">Nothing has been gathered here yet.</p>
      </header>
      <div className="dd-empty">
        <h2>The record starts empty and fills as we go</h2>
        <p>
          {staff
            ? 'Evidence accumulates from the first conversation onward, so this page exists before any investigation is commissioned.'
            : 'As work progresses, what has been examined and what remains open will appear here.'}
        </p>
        {staff && (
          <div className="dd-empty-act">
            <button type="button" className="gs-btn primary" disabled={!canAuthor.can || busy}
              title={canAuthor.can ? undefined : canAuthor.why}
              onClick={async () => {
                setBusy(true); setWarn(null);
                try {
                  const r = await createRecord({ slug, client: load.client || slug });
                  setLoad({ status: 'ready', plan: r.plan, version: r.version, isAuthoritative: r.via === 'supabase' });
                } catch (e) { setWarn(e.message || String(e)); }
                setBusy(false);
              }}>
              {busy ? 'Starting…' : 'Start this record'}
            </button>
            {!canAuthor.can && <p className="dd-readonly" style={{ marginTop: 14 }}>{canAuthor.why}</p>}
          </div>
        )}
      </div>
      {warn && <p className="dd-warn" role="alert" style={{ marginTop: 14 }}>{warn}</p>}
      <Notice text={notice} onDismiss={() => setNotice(null)} />
    </div>
  );

  const { plan } = load;
  const eng = plan.engagement;
  const cover = coverageOf(plan);

  // A named session is its own page. The sessions are where the Deep Dive is actually run, so this
  // is a destination a practitioner opens and works from rather than a row that expands.
  // An item page. Sessions came first; a question now has one too, because a row cannot hold where
  // an answer came from, how far we stand behind it, or the history of who changed it.
  if (itemKind === 'question' && itemId) {
    let found = null, pillar = null;
    for (const g of plan.QUESTIONS || []) {
      const q = (g.items || []).find((x) => x.id === itemId);
      if (q) { found = q; pillar = g.pillar; break; }
    }
    if (!found) return (
      <div className="ca-wrap dd-wrap"><div className="ca-center">
        <h2>No such question</h2>
        <p>Nothing in this record with id &ldquo;{itemId}&rdquo;.</p>
        <p><a className="ca-link" href={`#deepdive/${slug}`}>Back to the record</a></p>
      </div></div>
    );
    return (
      <>
        {/* ⚠ THIS PAGE HAD NO WRITER OF ANY KIND. It could record a finding, judge one and set an
            agreement, and it could not change a single field of the question it is about: every
            edit went to the drawer. onStatus and onSaveField are the portal's existing writers,
            wired with the labels the rest of the record uses. */}
        <QuestionPage slug={slug} question={found} pillar={pillar} plan={plan} map={map} log={log}
          findings={findings} staff={staff && !asClient} canAuthor={canAuthor} busy={busy}
          onRecord={recordFinding} onJudge={judge} onDropFinding={dropFinding} onConclude={conclude}
          files={files} onAttach={attach} onDetach={detach}
          onAgreement={(id, verdict, label) => set(id, { agreement: verdict }, label)}
          onNote={(id, note, label) => setOrThrow(id, { note: String(note).trim() }, label)}
          onStatus={set}
          onSaveField={(q, fields) => runOp({ type: 'edit', id: q.id, kind: 'question', label: q.q, fields })}
          onSaveRecord={saveRecord}
          onEdit={(item) => setDrawer({ mode: 'edit', kind: 'question', item: { ...item, pillar } })} />
        {toast && <div className="dd-toast" role="status">{toast}</div>}
        {warn && <p className="dd-warn" role="alert">{warn}</p>}
        <Notice text={notice} onDismiss={() => setNotice(null)} />
        {drawer && (
          <RecordDrawer mode={drawer.mode} kind={drawer.kind} item={drawer.item} plan={plan} findings={findings}
            onSave={runOp} onRemove={removeItem} onClose={() => setDrawer(null)} />
        )}
      </>
    );
  }

  if (itemKind === 'evidence' && itemId) {
    const found = (plan.EVIDENCE || []).find((x) => x.id === itemId);
    if (!found) return (
      <div className="ca-wrap dd-wrap"><div className="ca-center">
        <h2>No such evidence item</h2>
        <p>Nothing in this record with id &ldquo;{itemId}&rdquo;.</p>
        <p><a className="ca-link" href={`#deepdive/${slug}`}>Back to the record</a></p>
      </div></div>
    );
    return (
      <>
        <EvidencePage slug={slug} item={found} plan={plan} map={map} log={log} findings={findings}
          staff={staff && !asClient} canAuthor={canAuthor} busy={busy} onStatus={set}
          files={files} onAttach={attach} onDetach={detach}
          onEdit={(x) => setDrawer({ mode: 'edit', kind: 'evidence', item: x })}
          onSaveField={(x, fields) => runOp({ type: 'edit', id: x.id, label: x.item, kind: 'evidence', fields })} 
          onSaveRecord={saveRecord} />
        {toast && <div className="dd-toast" role="status">{toast}</div>}
        {warn && <p className="dd-warn" role="alert">{warn}</p>}
        <Notice text={notice} onDismiss={() => setNotice(null)} />
        {drawer && (
          <RecordDrawer mode={drawer.mode} kind={drawer.kind} item={drawer.item} plan={plan} findings={findings}
            onSave={runOp} onRemove={removeItem} onClose={() => setDrawer(null)} />
        )}
      </>
    );
  }

  // A person is their own page. A name in a chart is a label; a page is a way in to everything the
  // record knows about them, including whether anybody is scheduled to speak to them at all.
  if (itemKind === 'person' && itemId) {
    const found = (plan.PEOPLE || []).find((x) => x.id === itemId);
    if (!found) return (
      <div className="ca-wrap dd-wrap"><div className="ca-center">
        <h2>No such person</h2>
        <p>Nothing in this record with id &ldquo;{itemId}&rdquo;.</p>
        <p><a className="ca-link" href={`#deepdive/${slug}`}>Back to the record</a></p>
      </div></div>
    );
    return (
      <>
        <PersonPage slug={slug} item={found} plan={plan} map={map} log={log}
          staff={staff && !asClient} canAuthor={canAuthor} busy={busy} onStatus={set}
          files={files} onAttach={attach} onDetach={detach}
          onEdit={(x) => setDrawer({ mode: 'edit', kind: 'person', item: x })}
          onEditTask={(t) => setDrawer({ mode: 'edit', kind: 'task', item: t })} 
          onSaveRecord={saveRecord} 
          onSaveField={(x, fields) => runOp({ type: 'edit', id: x.id, kind: 'person', label: x.name, fields })} />
        {toast && <div className="dd-toast" role="status">{toast}</div>}
        {warn && <p className="dd-warn" role="alert">{warn}</p>}
        <Notice text={notice} onDismiss={() => setNotice(null)} />
        {drawer && (
          <RecordDrawer mode={drawer.mode} kind={drawer.kind} item={drawer.item} plan={plan} findings={findings}
            onSave={runOp} onRemove={removeItem} onClose={() => setDrawer(null)} />
        )}
      </>
    );
  }

  // A competitor is its own page. On the tab, thirteen organisations of desk research is a wall of
  // prose; the card carries the mark and the overlap, and the page carries the finding.
  if (itemKind === 'competitor' && itemId) {
    const found = (plan.COMPETITORS || []).find((x) => x.id === itemId);
    if (!found) return (
      <div className="ca-wrap dd-wrap"><div className="ca-center">
        <h2>No such competitor</h2>
        <p>Nothing in this record with id &ldquo;{itemId}&rdquo;.</p>
        <p><a className="ca-link" href={`#deepdive/${slug}`}>Back to the record</a></p>
      </div></div>
    );
    return (
      <>
        <CompetitorPage slug={slug} item={found} plan={plan} log={log}
          staff={staff && !asClient} canAuthor={canAuthor}
          onEdit={(x) => setDrawer({ mode: 'edit', kind: 'competitor', item: x })}
          onSaveField={(x, fields) => runOp({ type: 'edit', id: x.id, kind: 'competitor', label: x.name, fields })} />
        {toast && <div className="dd-toast" role="status">{toast}</div>}
        {warn && <p className="dd-warn" role="alert">{warn}</p>}
        <Notice text={notice} onDismiss={() => setNotice(null)} />
        {drawer && (
          <RecordDrawer mode={drawer.mode} kind={drawer.kind} item={drawer.item} plan={plan} findings={findings}
            onSave={runOp} onRemove={removeItem} onClose={() => setDrawer(null)} />
        )}
      </>
    );
  }

  // A number is its own page: whose it is, where it stands, and what moves it. The card says the
  // number; the page is where the links that make it a model get worked.
  if (itemKind === 'kpi' && itemId) {
    const found = (plan.KPIS || []).find((x) => x.id === itemId);
    if (!found) return (
      <div className="ca-wrap dd-wrap"><div className="ca-center">
        <h2>No such KPI</h2>
        <p>Nothing in this record with id &ldquo;{itemId}&rdquo;.</p>
        <p><a className="ca-link" href={`#deepdive/${slug}`}>Back to the record</a></p>
      </div></div>
    );
    return (
      <>
        <KpiPage slug={slug} item={found} plan={plan} log={log}
          staff={staff && !asClient} canAuthor={canAuthor}
          onEdit={(x) => setDrawer({ mode: 'edit', kind: 'kpi', item: x })}
          onSaveField={(x, fields) => runOp({ type: 'edit', id: x.id, kind: 'kpi', label: x.name, fields })} />
        {toast && <div className="dd-toast" role="status">{toast}</div>}
        {warn && <p className="dd-warn" role="alert">{warn}</p>}
        <Notice text={notice} onDismiss={() => setNotice(null)} />
        {drawer && (
          <RecordDrawer mode={drawer.mode} kind={drawer.kind} item={drawer.item} plan={plan} findings={findings}
            onSave={runOp} onRemove={removeItem} onClose={() => setDrawer(null)} />
        )}
      </>
    );
  }

  // A hypothesis is its own page: the claim, its twin tests, and what changes if it is wrong.
  if (itemKind === 'hypothesis' && itemId) {
    const found = (plan.HYPOTHESES || []).find((x) => x.id === itemId);
    if (!found) return (
      <div className="ca-wrap dd-wrap"><div className="ca-center">
        <h2>No such hypothesis</h2>
        <p>Nothing in this record with id &ldquo;{itemId}&rdquo;.</p>
        <p><a className="ca-link" href={`#deepdive/${slug}`}>Back to the record</a></p>
      </div></div>
    );
    return (
      <>
        <HypothesisPage slug={slug} item={found} plan={plan} log={log}
          staff={staff && !asClient} canAuthor={canAuthor}
          onEdit={(x) => setDrawer({ mode: 'edit', kind: 'hypothesis', item: x })}
          onSaveField={(x, fields) => runOp({ type: 'edit', id: x.id, kind: 'hypothesis', label: x.claim, fields })} />
        {toast && <div className="dd-toast" role="status">{toast}</div>}
        {warn && <p className="dd-warn" role="alert">{warn}</p>}
        <Notice text={notice} onDismiss={() => setNotice(null)} />
        {drawer && (
          <RecordDrawer mode={drawer.mode} kind={drawer.kind} item={drawer.item} plan={plan} findings={findings}
            onSave={runOp} onRemove={removeItem} onClose={() => setDrawer(null)} />
        )}
      </>
    );
  }

  // A source is its own page: the end of the trail. A citation a reader cannot open is a citation
  // they have to take on trust, which is the opposite of what an evidence record is for.
  if (itemKind === 'source' && itemId) {
    const found = (plan.SOURCES || []).find((x) => x.id === itemId);
    if (!found) return (
      <div className="ca-wrap dd-wrap"><div className="ca-center">
        <h2>No such source</h2>
        <p>Nothing in this record with id &ldquo;{itemId}&rdquo;.</p>
        <p><a className="ca-link" href={`#deepdive/${slug}`}>Back to the record</a></p>
      </div></div>
    );
    return (
      <>
        <SourcePage slug={slug} item={found} plan={plan} findings={findings}
          staff={staff && !asClient} canAuthor={canAuthor} busy={busy}
          files={files} onAttach={attach} onDetach={detach}
          onEdit={(x) => setDrawer({ mode: 'edit', kind: 'source', item: x })}
          onSaveField={(x, fields) => runOp({ type: 'edit', id: x.id, label: x.name, kind: 'source', fields })} 
          onSaveRecord={saveRecord} />
        {toast && <div className="dd-toast" role="status">{toast}</div>}
        {warn && <p className="dd-warn" role="alert">{warn}</p>}
        <Notice text={notice} onDismiss={() => setNotice(null)} />
        {drawer && (
          <RecordDrawer mode={drawer.mode} kind={drawer.kind} item={drawer.item} plan={plan} findings={findings}
            onSave={runOp} onRemove={removeItem} onClose={() => setDrawer(null)} />
        )}
      </>
    );
  }

  // A process is its own page too, and this is the one John asked for by name: click into a box on
  // the chain and map what happens INSIDE it. A process that sits in no workflow lands here as well,
  // which is how it stops being row eleven of a numbered list and becomes a page about a function.
  if (itemKind === 'build' && itemId) {
    const found = (plan.BUILDS || []).find((x) => x.id === itemId);
    if (!found) return (
      <div className="ca-wrap dd-wrap"><div className="ca-center">
        <h2>No such proposal</h2>
        <p>Nothing in this record with id &ldquo;{itemId}&rdquo;.</p>
        <p><a className="ca-link" href={`#deepdive/${slug}`}>Back to the record</a></p>
      </div></div>
    );
    return (
      <div className="ca-wrap dd-wrap">
        <BuildPage slug={slug} item={found} plan={plan} log={log} files={files}
          staff={staff && !asClient} canAuthor={canAuthor} busy={busy}
          onAttach={attach} onDetach={detach}
          onSaveField={(it, fields) => runOp({ type: 'edit', id: it.id, kind: 'build', label: `${it.ref} ${it.name}`.trim(), fields })}
          onSaveRecord={saveRecord}
          onEdit={(x) => setDrawer({ mode: 'edit', kind: 'build', item: x })} />
        {toast && <div className="dd-toast" role="status">{toast}</div>}
        {warn && <p className="dd-warn" role="alert">{warn}</p>}
        <Notice text={notice} onDismiss={() => setNotice(null)} />
        {drawer && (
          <RecordDrawer mode={drawer.mode} kind={drawer.kind} item={drawer.item} plan={plan} findings={findings}
            onSave={runOp} onRemove={removeItem} onClose={() => setDrawer(null)} />
        )}
      </div>
    );
  }

  if (itemKind === 'process' && itemId) {
    const found = (plan.PROCESSES || []).find((x) => x.id === itemId);
    if (!found) return (
      <div className="ca-wrap dd-wrap"><div className="ca-center">
        <h2>No such process</h2>
        <p>Nothing in this record with id &ldquo;{itemId}&rdquo;.</p>
        <p><a className="ca-link" href={`#deepdive/${slug}`}>Back to the record</a></p>
      </div></div>
    );
    return (
      <>
        <ProcessPage slug={slug} item={found} plan={plan} map={map} log={log} findings={findings}
          staff={staff && !asClient} canAuthor={canAuthor} busy={busy} onStatus={set}
          files={files} onAttach={attach} onDetach={detach}
          onSaveSteps={(item, rows) => runOp({ type: 'edit', id: item.id, label: `${item.num} ${item.name}`.trim(), fields: { steps: rows } })}
          // One field, edited where it sits. Same runOp as the drawer, so validation, the version
          // check, the log and attribution are identical — a different way in, not a second writer.
          // `${num} ${name}`, the way labelOf and setMany label a process. With just the name, one
          // item's history split into two labels: drawer edits under "07 Client intake" and inline
          // edits under "Client intake".
          onSaveField={(item, fields) => runOp({ type: 'edit', id: item.id, kind: 'process', label: `${item.num} ${item.name}`.trim(), fields })}
          onSaveRecord={saveRecord} onAddPerson={addPerson}
          onEdit={(x) => setDrawer({ mode: 'edit', kind: 'process', item: x })} />
        {toast && <div className="dd-toast" role="status">{toast}</div>}
        {warn && <p className="dd-warn" role="alert">{warn}</p>}
        <Notice text={notice} onDismiss={() => setNotice(null)} />
        {drawer && (
          <RecordDrawer mode={drawer.mode} kind={drawer.kind} item={drawer.item} plan={plan} findings={findings}
            onSave={runOp} onRemove={removeItem} onClose={() => setDrawer(null)} />
        )}
      </>
    );
  }

  const sessionId = itemKind === 'session' ? itemId : null;
  if (sessionId) {
    const session = (plan.SESSIONS || []).find((x) => x.id === sessionId);
    if (!session) return (
      <div className="ca-wrap dd-wrap"><div className="ca-center">
        <h2>No such session</h2>
        <p>Nothing in this record with id &ldquo;{sessionId}&rdquo;.</p>
        <p><a className="ca-link" href={`#deepdive/${slug}`}>Back to the record</a></p>
      </div></div>
    );
    return (
      <>
        <SessionPage slug={slug} session={session} plan={plan} map={map} staff={staff && !asClient}
          findings={findings} onRecord={recordFinding} onDropFinding={dropFinding} busy={busy}
          canAuthor={canAuthor} onEdit={(item) => setDrawer({ mode: 'edit', kind: 'session', item })}
          onSaveField={(x, fields) => runOp({ type: 'edit', id: x.id, label: x.person, kind: 'session', fields })} 
          onSaveRecord={saveRecord} 
          onAddQuestion={async (fields) => {
            const r = await runOp({ type: 'add', kind: 'question', fields });
            return r?.newId || null;
          }}
          onStatus={set} />
        {toast && <div className="dd-toast" role="status">{toast}</div>}
        {/* ⚠ THIS LINE WAS MISSING, AND ONLY HERE. recordFinding never throws — it catches into
            `warn` — and the session page's Record panel clears its textarea and closes regardless.
            So a practitioner typed what somebody had just said in the room, pressed Record, the
            write failed, and the text vanished with no toast, no error and nothing in the list.
            The single most valuable thing this record collects, dropped in silence. */}
        {warn && <p className="dd-warn" role="alert">{warn}</p>}
        <Notice text={notice} onDismiss={() => setNotice(null)} />
        {drawer && (
          <RecordDrawer mode={drawer.mode} kind={drawer.kind} item={drawer.item} plan={plan} findings={findings}
            onSave={runOp} onRemove={removeItem} onClose={() => setDrawer(null)} />
        )}
      </>
    );
  }
  const clientMode = !staff || asClient;
  const ctx = {
    slug, map, staff: staff && !asClient, set, setMany, busy, canAuthor, onJudge: judge, onConclude: conclude,
    findings, recordFinding, dropFinding, runOp, runOpLoud, setWarn,
    openDrawer: (d) => setDrawer(d),
  };

  return (
    <div className="ca-wrap dd-wrap">
      {/* ⚠ THE ENGAGEMENT HEADER MOVED INTO THE OVERVIEW TAB. It sat here, above the tab panels,
          so the client, sponsor, stage, access, title and two buttons repeated over every one of
          the ten tabs. It is the right header for the Overview and nothing but noise on the other
          nine, where it pushed the thing somebody came for below the fold. Each tab now heads
          itself, with counts about that tab. */}

      {staff && (
        <div className="dd-staffbar">
          <span className="dd-staffbar-tag">Greatstone workspace</span>
          {/* The input stays a real checkbox, focusable and toggled by the label; the box you see
              is the span beside it. Styling a native checkbox directly means relying on pseudo
              elements rendering on a replaced element, which is not something to bet a control on. */}
          <label className="dd-preview">
            <input type="checkbox" checked={asClient} onChange={(e) => setAsClient(e.target.checked)} />
            <span className="dd-box" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="12" height="12" focusable="false">
                <path d="M2.5 8.4 6.3 12 13.5 4.4" fill="none" stroke="currentColor"
                  strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span>Preview as the client sees it</span>
          </label>
          {backend === 'file' && (
            <span className="dd-local" title="Status is written to .deepdive/<slug>.state.json, shared with the Deep Dive MCP. Development only.">
              Saved to the working file
            </span>
          )}
          {backend === 'local' && (
            <span className="dd-local" title="No dev file endpoint and no table: this browser only. A colleague will not see these edits.">
              Saved in this browser only
            </span>
          )}
          {!load.isAuthoritative && <span className="dd-local">Plan read from the local file</span>}
        </div>
      )}
      {warn && <p className="dd-warn" role="alert">{warn}</p>}
      {/* ⚠ THE MAIN RECORD SCREEN WAS THE ONE SCREEN WITH NO <Notice>. Every other site sat
          inside an early return, and this is where the drawer lives, which is how a question
          actually gets reworded. So the single message the whole channel exists to stop losing
          was invisible exactly where it is most often earned. */}
      <Notice text={notice} onDismiss={() => setNotice(null)} />
      {staff && !asClient && !canAuthor.can && canAuthor.why && (
        <p className="dd-readonly" role="note">Read only here. {canAuthor.why}</p>
      )}
      {toast && <div className="dd-toast" role="status">{toast}</div>}
      {drawer && (
        <RecordDrawer
          mode={drawer.mode} kind={drawer.kind} item={drawer.item} plan={plan} findings={findings}
          onSave={runOp} onRemove={removeItem} onClose={() => setDrawer(null)}
        />
      )}

      {clientMode ? (
        <ClientView eng={eng} plan={plan} map={map} />
      ) : (
        <>
          {/* Search sits ABOVE the tabs on purpose: the tabs answer "show me the questions", search
          answers "where is the one about master datasets", and mid-engagement it is almost always
          the second. */}
      <RecordSearch slug={slug} plan={plan} onJump={setTab} />

      {(() => {
        // ⚠ THE TABS ARE THE NAVIGATION, so they belong in the bar at the top rather than in a
        // rounded box below it, where ten of them wrapped and left "History" alone on a second row.
        // They live in this component because they are one screen's state, and they RENDER in the
        // bar, which is outside it.
        //
        // ⚠ AND THEY FALL BACK TO RENDERING IN PLACE. If the slot is not there for any reason, the
        // navigation still has to exist: portalling into nothing would silently remove every way of
        // moving around the record, which is worse than a tab bar in the wrong position.
        const tabs = (
          <div className="dd-tabs" role="tablist" aria-label={`${eng.client} Deep Dive`}>
            {TABS.map((t, i) => {
              // A queue you have to remember to visit is a queue that silently fills up, so the
              // count rides on the tab itself. It moved to Evidence with the band: leaving it on a
              // tab id that no longer exists would have made the queue invisible again.
              const pending = t.id === 'evidence'
                ? (findings || []).filter((f) => f.state === 'proposed').length : 0;
              return (
                <button key={t.id} id={'dd-tab-' + t.id} role="tab" type="button"
                  aria-selected={tab === t.id} aria-controls={'dd-panel-' + t.id}
                  tabIndex={tab === t.id ? 0 : -1} className={tab === t.id ? 'on' : ''}
                  onClick={() => setTab(t.id)} onKeyDown={(e) => onTabKey(e, i)}>
                  {Icon[t.icon] ? Icon[t.icon]({ size: 15 }) : null}
                  {t.label}
                  {pending > 0 && <span className="dd-tabcount" aria-label={`${pending} awaiting validation`}>{pending}</span>}
                </button>
              );
            })}
          </div>
        );
        return barSlot ? createPortal(tabs, barSlot) : tabs;
      })()}
          {TABS.map((t) => (
            <div key={t.id} role="tabpanel" id={'dd-panel-' + t.id} aria-labelledby={'dd-tab-' + t.id} hidden={tab !== t.id}>
              {/* The selected tab is the section heading for a sighted reader, but a tab is a
                  button, not a heading, so navigating by heading level jumped h1 straight to h3 on
                  five of these panels. One heading here restores the structure everywhere without
                  repeating the tab's own label on screen. */}
              {tab === t.id && <h2 className="gs-sr-only">{t.label}</h2>}
              {tab === t.id && (
                t.id === 'overview' ? <Overview eng={eng} plan={plan} cover={cover} go={setTab} goQuestions={() => { setQPreset('questions'); setTab('evidence'); }} ctx={ctx}
                    findings={findings}
                    asClient={asClient} onDetails={() => setDrawer({ mode: 'details' })}
                    onAdd={() => setDrawer({ mode: 'add', kind: 'process' })} />
                : t.id === 'processes' ? <Processes plan={plan} ctx={ctx} onLoose={(kind, mode) => {
                    // One hand-off per kind, because the loose items live on three different tabs.
                    const p = mode === 'dangling' ? 'proc-dangling' : 'proc-loose';
                    if (kind === 'questions') { setQPreset(p); setTab('evidence'); }
                    else if (kind === 'evidence') { setKPreset(p); setTab('evidence'); }
                    else if (kind === 'sessions') { setSessPreset(p); setTab('sessions'); }
                  }} />
                : t.id === 'org' ? <Organisation plan={plan} ctx={ctx} slug={slug} />
                : t.id === 'innovation' ? <InnovationBoard plan={plan} slug={slug} staff={ctx.staff} ctx={ctx} onSaveRecord={saveRecord} />
                : t.id === 'evidence' ? <Knowledge plan={plan} ctx={ctx} preset={kPreset} onPresetUsed={() => setKPreset(null)}  findings={findings} qPreset={qPreset} onQPresetUsed={() => setQPreset(null)} />
                : t.id === 'sessions' ? <Sessions plan={plan} ctx={ctx} slug={slug} onDecide={() => { setQPreset('undecided'); setTab('evidence'); }}
                    preset={sessPreset} onPresetUsed={() => setSessPreset(null)} />
                : t.id === 'competitors' ? <Competitors plan={plan} ctx={ctx} />
                : t.id === 'kpis' ? <Kpis plan={plan} ctx={ctx} />
                : <History log={log} plan={plan} slug={slug} />
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── mount ─────────────────────────────────────────────────────────────────────────────────────
/** A message that stays until the person reading it says otherwise. Everything in `warn` is about
 *  the operation that just ran and is correctly wiped by the next one; this is for the handful that
 *  ask somebody to go and DO something afterwards. */
function Notice({ text, onDismiss }) {
  // ⚠ RETURNING null WHEN EMPTY MEANT THE LIVE REGION DID NOT EXIST until the moment it had
  // something to say, and a region inserted with its content already inside it is announced
  // unreliably. The wrapper is always in the DOM; only its contents change.
  return (
    <div className="dd-notice-live" role="status" aria-live="polite">
      {text && (
        <p className="dd-notice">
          <span>{text}</span>
          <button type="button" className="dd-notice-x" onClick={onDismiss}
            aria-label="Dismiss this notice">Dismiss</button>
        </p>
      )}
    </div>
  );
}

/** ⚠ THE BAR IS RENDERED HERE, NOT INSIDE EACH SCREEN. This component has nine early returns
 *  (checking, no session, no engagement on the account, an item page, the picker, and so on) and
 *  putting the exit into each of them would mean the one that got missed is a screen somebody
 *  cannot leave. With the site header gone on these routes, that is a trap rather than a rough
 *  edge, so the way out sits outside every branch. */
export default function DeepDivePortal(props) {
  // A callback ref rather than useRef: the slot has to be in STATE, or the screen below renders
  // once with nothing to portal into and the tabs never arrive.
  const [slot, setSlot] = useState(null);
  const [info, setInfo] = useState({ client: null, logo: null, slug: null });
  const [asClient, setAsClient] = useState(false);
  const preview = useMemo(() => ({ on: asClient, set: setAsClient }), [asClient]);
  return (
    <BarSlot.Provider value={slot}>
    <BarInfo.Provider value={setInfo}>
    <Preview.Provider value={preview}>
      <PortalBar slotRef={setSlot} client={info.client} logo={info.logo} slug={info.slug}
        asClient={asClient} onExit={() => setAsClient(false)} />
      <DeepDiveScreens {...props} />
    </Preview.Provider>
    </BarInfo.Provider>
    </BarSlot.Provider>
  );
}

function DeepDiveScreens({ slug = null, itemKind = null, itemId = null }) {
  const [session, setSession] = useState(undefined);
  const [staff, setStaff] = useState(undefined);
  const [profile, setProfile] = useState(undefined);
  const [list, setList] = useState(null);

  useEffect(() => {
    getSession().then(setSession);
    const { data } = onAuth(setSession);
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) { setStaff(null); setProfile(null); setActor(null); return; }
    getStaffUser().then((u) => {
      setStaff(u);
      // Every change this person makes from here on carries their name. Resolved once per session
      // rather than per write: there is one person at the keyboard, and asking Supabase who they
      // are on every tick is a round trip per tick.
      setActor(u ? { id: u.id, name: u.full_name || u.email, email: u.email, role: u.role } : null);
    }).catch(() => { setStaff(null); setActor(null); });
    getCustomerProfile().then(setProfile).catch(() => setProfile(null));
  }, [session]);
  // the picker only matters to staff, and only when no engagement is named
  useEffect(() => {
    if (slug || !isStaff(staff)) return;
    listEngagements().then(setList).catch(() => setList([]));
  }, [slug, staff]);

  if (session === undefined) return <div className="ca-wrap dd-wrap"><div className="ca-center">Checking…</div></div>;
  if (!session) return <AuthGate />;
  if (staff === undefined || profile === undefined) return <div className="ca-wrap dd-wrap"><div className="ca-center">Checking…</div></div>;

  const asStaff = isStaff(staff);
  if (!asStaff && !isCustomer(profile)) return (
    <div className="ca-wrap dd-wrap"><div className="ca-center">
      <h2>No Deep Dive on this account</h2>
      <p>{session.user?.email} is not set up against an engagement. <a className="ca-link" href="#go/contact">Contact us</a> and we will get you access.</p>
      <button className="gs-btn ghost" onClick={() => signOut()}>Sign out</button>
    </div></div>
  );

  if (slug) return <Engagement slug={slug} staff={asStaff} itemKind={itemKind} itemId={itemId} />;

  // No slug. A client goes straight to theirs; staff choose from the register.
  // Fail closed: a customer whose account resolves to no engagement sees nothing, never a default.
  // A hardcoded fallback slug would both show them somebody else's Deep Dive and put a real client's
  // name into the public JavaScript bundle.
  if (!asStaff) {
    const mine = profile?.customer?.deepdive_slug || profile?.customer?.slug || null;
    if (!mine) return (
      <div className="ca-wrap dd-wrap"><div className="ca-center">
        <h2>No Deep Dive on this account</h2>
        <p>There is no investigation linked to {session.user?.email} yet. <a className="ca-link" href="#go/contact">Contact us</a> and we will get you access.</p>
      </div></div>
    );
    return <Engagement slug={mine} staff={false} />;
  }
  if (list === null) return <div className="ca-wrap dd-wrap"><div className="ca-center">Loading engagements…</div></div>;
  if (list.length === 1) return <Engagement slug={list[0].slug} staff />;

  return (
    <div className="ca-wrap dd-wrap">
      <header className="dd-head">
        <div className="dd-kicker">Greatstone workspace</div>
        <h1>Deep Dive</h1>
        <p className="dd-lead">{list.length ? 'Choose an engagement.' : 'No engagements are registered on this environment.'}</p>
      </header>
      <ul className="dd-pick">
        {list.map((e) => (
          <li key={e.slug}><a href={`#deepdive/${e.slug}`}><b>{e.client}</b><span>{e.title}</span></a></li>
        ))}
      </ul>
    </div>
  );
}

// ⚠ THE TAB PANELS HAD NO RENDER COVERAGE AT ALL. They are internal to this module, so the render
// smoke test could mount the item pages and the shell and not one of the ten screens somebody
// actually spends the day in. Nine of them were edited in a single sweep to give each its own head,
// and nothing in the suite would have noticed if one had stopped mounting.
//
// Exported for that test and nothing else. It is a real cost to the module's surface, paid because
// a blank tab is exactly the failure this codebase has shipped before and cannot see.
export const __panels = {
  Overview, Processes, Organisation, Pillars, Knowledge, Sessions, Competitors, Kpis, History,
  // ⚠ THE ONE SCREEN A CLIENT EVER SEES, and it was exported nowhere and tested nowhere. It is
  // the component that decides what leaves the building: everything it renders is filtered by
  // isShared, and Internal is the default. Exported so a test can plant internal content and
  // prove it does not come out the other side.
  ClientView,
  // ⚠ THE ONLY SCREEN-INDEPENDENT SURFACE. The bar renders above every branch, which is what makes
  // it the right place for the ways out (the record list, the website, and now preview mode) and
  // the only place a test can check that those ways out exist without mounting a screen.
  PortalBar,
};
