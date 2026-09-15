// Does the portal actually RENDER?
//
// Every other test in this suite reads source. That is why 622 of them once passed over a page that
// mounted to nothing: a useEffect named two consts three lines before they were declared, and no
// test in the repo had ever mounted a Deep Dive screen. Reading source cannot see a TDZ error, a
// prop shape that does not match, or a hook that throws on its first commit.
//
// So this one compiles the real components, mounts each of them in a DOM, and fails if any throws
// or paints nothing.
//
// ⚠ THE FIRST VERSION OF THIS COULD NOT FAIL. createRoot().render() SCHEDULES the work, so the
// try/catch around it had returned long before React rendered anything: it reported 20 of 20 green
// and would have done so with a `throw` on line one. What replaced it is an error boundary, a
// flush, and a floor on the text produced, and all three were proven by planting a crash and
// watching this go red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

// The screens, and the props each is actually called with, read off the component signatures. A
// prop this gets wrong surfaces as a crash, which is the point rather than a problem.
const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as S from '${join(root, 'src/data/deepdive-schema.mjs')}';
import ProcessPage from '${join(root, 'src/store/ProcessPage.jsx')}';
import QuestionPage from '${join(root, 'src/store/QuestionPage.jsx')}';
import EvidencePage from '${join(root, 'src/store/EvidencePage.jsx')}';
import SessionPage from '${join(root, 'src/store/SessionPage.jsx')}';
import SourcePage from '${join(root, 'src/store/SourcePage.jsx')}';
import PersonPage from '${join(root, 'src/store/PersonPage.jsx')}';
import CompetitorPage from '${join(root, 'src/store/CompetitorPage.jsx')}';
import KpiPage from '${join(root, 'src/store/KpiPage.jsx')}';
import HypothesisPage from '${join(root, 'src/store/HypothesisPage.jsx')}';
import SessionRun from '${join(root, 'src/store/SessionRun.jsx')}';
import OfferingBoard from '${join(root, 'src/store/OfferingBoard.jsx')}';
import BuildPage from '${join(root, 'src/store/BuildPage.jsx')}';
// ⚠ THE SHELL ITSELF HAD NO RENDER COVERAGE, and it is the component with nine early returns and
// the only way back to the website in it. Mounting it lands on the "checking the session" branch,
// which is exactly the branch that has to still carry the exit.
import DeepDivePortal, { __panels } from '${join(root, 'src/store/DeepDivePortal.jsx')}';
import InnovationBoard from '${join(root, 'src/store/InnovationBoard.jsx')}';
import RecordDrawer from '${join(root, 'src/store/RecordDrawer.jsx')}';

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { this.props.onError(String(err && err.message).slice(0, 300)); }
  render() { return this.state.err ? React.createElement('i', null, 'x') : this.props.children; }
}

export async function run() {
  // ⚠ THE BOUNDARY ONLY CATCHES THROWS. Everything React WARNS about — invalid DOM nesting, a
  // missing key, a controlled input becoming uncontrolled, a hook-order complaint — goes to
  // console.error and was invisible here. Nesting is the one that nearly bit: the inline editor's
  // read state is a <button>, whose content model is phrasing content, so a list inside it is
  // invalid and throws nothing at all.
  const complaints = [];
  const realError = console.error;
  console.error = (...a) => {
    const m = a.map((x) => (typeof x === 'string' ? x : String(x && x.message || ''))).join(' ');
    // The boundary logs its own "The above error occurred in" line; that is already reported as a
    // throw, so counting it again would just double up.
    if (!/The above error occurred/.test(m)) complaints.push(m.slice(0, 240));
    realError(...a);
  };

  let plan = S.normalisePlan({ engagement: { slug: 'probe', client: 'Probe', title: 'T',
    stage: 'Greatstone Deep Dive', access: 'Commitment in principle', sponsor: 'S', lead: 'L' } });
  const add = (kind, fields, id) => { plan = S.applyOp(plan, { type: 'add', kind, fields }, id); };
  add('offering', { ref: '01', name: 'Tracking', what: 'What they sell' }, 'o:aaaaaaa1');
  add('process', { num: '01', name: 'Data collection', howToday: 'By hand', whoRuns: 'The field team',
    pains: 'Slow', opens: 'Who checks it', pillars: ['Data'], offerings: ['01'],
    steps: [{ name: 'Collect', who: 'Field', tool: 'Paper', detail: 'Re-keyed that evening' }] }, 'p:aaaaaaa1');
  // ⚠ A SECOND PROCESS AND A REAL HANDOFF. With one process and no feeds, every control that
  // resolves a handoff back to a record renders zero chips and its callbacks never run, so a
  // reference to something undefined sails through. It did exactly that once.
  add('process', { num: '02', name: 'Analysis', howToday: 'In a spreadsheet',
    whoRuns: 'The research manager', pillars: ['Data'] }, 'p:bbbbbbb2');
  plan = S.applyOp(plan, { type: 'edit', id: 'p:aaaaaaa1', fields: { feeds: ['02'] } }, 'p:aaaaaaa1');
  // ⚠ AND ONE WITH NOTHING AT ALL. 01 hands to 02, which makes 02 fed-by, so NEITHER of them is
  // bare on handoffs and both render the section whether or not the empty state works. Twice I
  // thought I had a bare fixture and did not; this is the only process in the record with no
  // handoff in either direction, no question and no session.
  add('process', { num: '03', name: 'Reporting', howToday: 'Written up by hand' }, 'p:ccccccc3');
  add('unit', { ref: 'OPS', name: 'Operations', unitType: 'team', headcount: 12, does: 'Runs delivery' }, 'u:aaaaaaa1');
  add('person', { name: 'Ama', role: 'Supervisor', side: 'client', unitId: 'u:aaaaaaa1' }, 'n:aaaaaaa1');
  add('person', { name: 'Kofi', role: 'Analyst', side: 'client', reportsTo: 'n:aaaaaaa1' }, 'n:bbbbbbb2');
  add('task', { what: 'Re-types responses', personId: 'n:aaaaaaa1', processes: ['01'], pillars: ['Data'],
    cadence: 'daily', hours: 6, fate: 'automated', why: 'It is manual' }, 't:aaaaaaa1');
  add('question', { pillar: 'Data', q: 'Who checks the returns?', certainty: 'unknown',
    why: 'It decides the fix', ref: 'Q34', route: 'session', processes: ['01'], alsoPillars: ['Process'] }, 'q:aaaaaaa1');
  add('question', { pillar: 'Data', q: 'And who checks the checker?', from: 'q:aaaaaaa1' }, 'q:bbbbbbb2');
  add('evidence', { item: 'The value tables', state: 'partial', held: 'A sample', missing: 'The rest',
    provenance: 'Shown on screen', provenanceKind: 'seen', processes: ['01'], sessionIds: ['s:aaaaaaa1'] }, 'e:aaaaaaa1');
  add('source', { name: 'The data lead', sourceType: 'person', gives: 'Access', owner: 'Ama',
    access: 'Ask first', pillars: ['Data'] }, 'r:aaaaaaa1');
  add('session', { person: 'Ama', name: 'How the wave actually runs', method: 'blended', priority: 'critical', only: 'Only she runs it', pillars: ['Data'], objectives: 'Walk it',
    covers: ['q:aaaaaaa1'], ref: 'S3', minutes: 60, processes: ['01'], personId: 'n:aaaaaaa1',
    record: 'https://example.org/notes' }, 's:aaaaaaa1');
  add('session', { name: 'The sitting that ended', person: 'Kofi',
    covers: ['q:bbbbbbb2'] }, 's:ended001');
  add('kpi', { name: 'Turnaround', scope: 'team', unitId: 'u:aaaaaaa1', unit: 'days', current: 9,
    target: 4, direction: 'down', cadence: 'weekly', pillars: ['Data'] }, 'k:aaaaaaa1');
  add('hypothesis', { ref: 'H1', claim: 'Re-keying causes the delay', grounds: 'Observed',
    kills: 'A clean run', test: 'Time it', verdict: 'open', bearsOn: ['01'], sessionIds: ['s:aaaaaaa1'] }, 'h:aaaaaaa1');
  add('competitor', { name: 'Another firm', evidence: 'Their site', overlaps: 'Tracking' }, 'c:aaaaaaa1');
  add('opportunity', { ref: 'Y1', name: 'Remove the evening re-keying',
    statement: 'Field data is captured on paper and re-entered after hours.',
    rootCause: 'Capture and recording are two separate activities owned by different people.',
    desiredOutcome: 'Field data recorded once, at source, on the day.',
    potentialValue: 'Returns roughly an evening a week to the field team.',
    baselineRequired: true, kpis: ['k:aaaaaaa1'], pillars: ['Data'], state: 'refined' }, 'y:aaaaaaa1');
  add('build', { ref: 'B1', name: 'Field capture app', state: 'considering', opportunityId: 'y:aaaaaaa1',
    stateWhy: 'Waiting on whether the field team have devices at all.',
    what: 'Collect on a phone', forWhom: 'The field team', processes: ['01'],
    touches: ['01:1'], replaces: 'The paper form', needs: 'A device each',
    unknowns: 'Whether there is signal', options: 'A native app\\nA web form',
    problems: 'Battery life in the field', blockers: 'No device budget agreed',
    roi: 'Removes the evening re-keying', effort: 4, impact: 8.5, foundational: true,
    demoKind: 'prototype', demoLink: 'https://example.org/demo', demoNote: 'The capture screen',
    decisions: '2026-08-27 :: their ops lead :: worth doing if the devices exist',
    pillars: ['Data'] }, 'b:aaaaaaa1');

  add('complexity', { buildId: 'b:aaaaaaa1', state: 'initial',
    dimensions: [
      { dimension: 'data', level: 'significant', driver: 'No structured record of what is captured today',
        implication: 'A discovery pass on the paper forms before any schema is designed' },
      { dimension: 'change', level: 'elevated', driver: 'The field team have never used a device for this',
        implication: 'Training and a parallel-run period rather than a cutover' },
      { dimension: 'technology', level: 'standard', driver: 'Off-the-shelf capture is adequate',
        implication: 'No specialist capability needed' },
    ],
    interactions: 'Poor data plus a team new to devices makes a bad first release hard to recover from',
    preconditions: 'Agree what the form actually needs to capture',
    risks: 'Devices are not budgeted, so a pilot may stall',
    uncertainty: 'Whether there is signal in the field at all' }, 'x:aaaaaaa1');

  const map = { 's:ended001': { status: 'done' },
    'q:aaaaaaa1': { status: 'done', visibility: 'shared', note: 'A note',
    updated: '2026-09-07T00:00:00Z' } };
  const noop = () => {}; const an = async () => {};
  const common = { slug: 'probe', plan, map, log: [], findings: [], files: [], staff: true,
    canAuthor: { can: true }, busy: false, onEdit: noop, onSaveField: an, onStatus: an, onAttach: an,
    onDetach: an, onRecord: an, onJudge: an, onDropFinding: an, onAgreement: an, onNote: an,
    onSaveSteps: an, onEditTask: noop, onSelect: noop, onConnect: an, onMove: an, onTidy: an,
    // ⚠ The cross-record writer. Without it every control that ties one record to another correctly
    // refuses to render, which is right behaviour and made the fixture blind to those controls.
    onSaveRecord: an,
    onAddProcess: noop, onEditOffering: noop };
  const F = (k) => S.findItem(plan, k).item;
  const SEED = { process: F('p:aaaaaaa1'), question: F('q:aaaaaaa1'), evidence: F('e:aaaaaaa1'),
    session: F('s:aaaaaaa1'), source: F('r:aaaaaaa1'), kpi: F('k:aaaaaaa1'),
    hypothesis: F('h:aaaaaaa1'), competitor: F('c:aaaaaaa1'), offering: F('o:aaaaaaa1'),
    unit: F('u:aaaaaaa1'), person: F('n:aaaaaaa1'), task: F('t:aaaaaaa1'), build: F('b:aaaaaaa1'),
    opportunity: F('y:aaaaaaa1'), complexity: F('x:aaaaaaa1') };

  const cases = [
    ['ProcessPage', () => React.createElement(ProcessPage, { ...common, item: F('p:aaaaaaa1') })],
    // ⚠ THE BARE ONE. Process 01 has a handoff, a question and a session tied to it, so every
    // "add the first one" control renders on it whether or not the empty state is handled. Process
    // 02 has none of the three, which is the only fixture that can see the trap.
    ['ProcessPage:bare', () => React.createElement(ProcessPage, { ...common, item: F('p:ccccccc3') })],
    ['QuestionPage', () => React.createElement(QuestionPage, { ...common, question: F('q:aaaaaaa1'), pillar: 'Data' })],
    ['EvidencePage', () => React.createElement(EvidencePage, { ...common, item: F('e:aaaaaaa1') })],
    ['SessionPage', () => React.createElement(SessionPage, { ...common, session: F('s:aaaaaaa1') })],
    // the live-meeting surface, mounted with the same fixture session (it has covers + notHere)
    ['SessionPage:ended', () => React.createElement(SessionPage, { ...common, session: F('s:ended001') })],
    ['SessionRun', () => React.createElement(SessionRun, { session: F('s:aaaaaaa1'), plan, map,
      busy: false, canAuthor: { can: true }, onSaveRecord: an, onSaveField: an, onStatus: an, onAddQuestion: an, onDone: noop })],
    ['SourcePage', () => React.createElement(SourcePage, { ...common, item: F('r:aaaaaaa1') })],
    ['PersonPage', () => React.createElement(PersonPage, { ...common, item: F('n:aaaaaaa1') })],
    ['CompetitorPage', () => React.createElement(CompetitorPage, { ...common, item: F('c:aaaaaaa1') })],
    ['KpiPage', () => React.createElement(KpiPage, { ...common, item: F('k:aaaaaaa1') })],
    ['HypothesisPage', () => React.createElement(HypothesisPage, { ...common, item: F('h:aaaaaaa1') })],
    ['OfferingBoard', () => React.createElement(OfferingBoard, { ...common, selectedId: 'o:aaaaaaa1' })],
    ['BuildPage', () => React.createElement(BuildPage, { ...common, item: F('b:aaaaaaa1') })],
    ['DeepDivePortal', () => React.createElement(DeepDivePortal, {})],
    // ⚠ THE TEN SCREENS SOMEBODY ACTUALLY SPENDS THE DAY IN, none of which had render coverage.
    // The ctx here is the same shape the portal builds for them.
    ...(() => {
      const ctx = { slug: 'probe', map, staff: true, set: an, setMany: an, busy: false,
        canAuthor: { can: true }, onJudge: an, findings: [], recordFinding: an, dropFinding: an,
        runOp: an, runOpLoud: an, setWarn: noop, openDrawer: noop };
      const eng = plan.engagement;
      const cover = { processes: 1, pillars: 1, questions: 2, toInvestigate: 1, settled: 0,
        outstanding: 1, sessions: 1, shared: 0 };
      const P = __panels;
      return [
        ['tab:Overview', () => React.createElement(P.Overview, { eng, plan, cover, go: noop, ctx, asClient: false, onDetails: noop, onAdd: noop })],
        ['tab:Processes', () => React.createElement(P.Processes, { plan, ctx })],
        ['tab:Organisation', () => React.createElement(P.Organisation, { plan, ctx, slug: 'probe' })],
        ['tab:Innovation', () => React.createElement(InnovationBoard, { plan, slug: 'probe', staff: true, ctx })],
        // the flat questions view, entered the way the Sessions gap sends you in
        ['tab:Enquiry', () => React.createElement(P.Knowledge, { plan, ctx })],
        ['tab:Sessions', () => React.createElement(P.Sessions, { plan, ctx, slug: 'probe' })],
        ['tab:Competitors', () => React.createElement(P.Competitors, { plan, ctx })],
        ['tab:KPIs', () => React.createElement(P.Kpis, { plan, ctx })],
        ['tab:History', () => React.createElement(P.History, { log: [{ at: '2026-09-08T00:00:00Z', id: 'p:aaaaaaa1', label: '01 Data collection', by: 'A practitioner', changed: {} }] })],
      ];
    })(),
    ...S.KINDS.map((kind) => [\`drawer:\${kind}\`, () => React.createElement(RecordDrawer,
      { mode: 'add', kind, item: null, plan, onSave: an, onRemove: noop, onClose: noop })]),
    // ⚠ EDIT is a different code path from ADD: it seeds every control from a stored value, which
    // is where a select with no matching option silently blanks free text and where a dangling id
    // is either shown or swallowed. Add mode alone would have missed all of it.
    ...S.KINDS.map((kind) => [\`drawer:edit:\${kind}\`, () => React.createElement(RecordDrawer,
      { mode: 'edit', kind, item: SEED[kind], plan, onSave: an, onRemove: an, onClose: noop })]),
    // The client's view of the same screens. Different branches: no edit controls, no findings
    // machinery, and a canAuthor that refuses.
    ...[['ProcessPage', ProcessPage, { item: F('p:aaaaaaa1') }],
        ['QuestionPage', QuestionPage, { question: F('q:aaaaaaa1'), pillar: 'Data' }],
        ['EvidencePage', EvidencePage, { item: F('e:aaaaaaa1') }],
        ['SessionPage', SessionPage, { session: F('s:aaaaaaa1') }],
        ['SourcePage', SourcePage, { item: F('r:aaaaaaa1') }],
        ['PersonPage', PersonPage, { item: F('n:aaaaaaa1') }],
        ['OfferingBoard', OfferingBoard, { selectedId: 'o:aaaaaaa1' }],
        ['BuildPage', BuildPage, { item: F('b:aaaaaaa1') }]]
      .map(([name, C, extra]) => [\`client:\${name}\`, () => React.createElement(C,
        { ...common, ...extra, staff: false, canAuthor: { can: false, why: 'Not yours' } })]),
  ];

  const out = [];

  const roots = [];
  for (const [name, make] of cases) {
    const el = document.createElement('div'); document.body.appendChild(el);
    // ⚠ The drawer PORTALS to <body>, so its own container is empty by design. What is measured is
    // the text this mount added to the document, wherever it landed.
    const before = document.body.textContent.trim().length;
    let err = null;
    try {
      const root = createRoot(el);
      roots.push(root);
      root.render(React.createElement(Boundary, { onError: (m) => { err = m; } }, make()));
    } catch (e) { err = 'sync: ' + String(e.message).slice(0, 300); }
    await new Promise((r) => setTimeout(r, 30));
    const chars = Math.max((el.textContent || '').trim().length,
      document.body.textContent.trim().length - before);
    // ⚠ THIS TOOK THE LAST 4000 CHARACTERS OF THE WHOLE DOCUMENT, which happened to be right only
    // because ProcessPage is case one and roots are never unmounted. Reorder the list and the
    // content assertion below would quietly start reading a different screen. The text this mount
    // ADDED is exactly the slice past where the document ended before it.
    out.push({ name, err, chars, text: (document.body.textContent || '').slice(before),
      // ⚠ An accessible name lives in an attribute, not in the text, so a text-only capture cannot
      // see it. Bounded, because this is kept for every mount.
      html: (el.innerHTML || '').slice(0, 60000) });
  }
  console.error = realError;
  // ⚠ UNMOUNT, OR THE PROCESS NEVER EXITS. Roots were kept mounted (see the slicing note above)
  // and for months nothing minded. Then SessionRun brought the portal its first setInterval (the
  // live clock), whose cleanup only runs on unmount, and every run of this file became a zombie:
  // results printed, event loop pinned, three of them found 7 to 30 hours old holding the
  // machine. Measurement is finished by here; unmounting is what lets node go home.
  for (const r of roots) { try { r.unmount(); } catch {} }
  return { out, seeded: Object.keys(SEED).filter((k) => SEED[k]), complaints };
}
`;

async function mountAll() {
  const dir = mkdtempSync(join(tmpdir(), 'ddrender-'));
  const outfile = join(dir, 'entry.mjs');
  await build({
    stdin: { contents: ENTRY, resolveDir: root, loader: 'jsx' },
    bundle: true, format: 'esm', outfile, platform: 'browser', jsx: 'automatic',
    logLevel: 'silent', define: { 'process.env.NODE_ENV': '"development"' },
    loader: { '.svg': 'text', '.css': 'empty' },
  });

  const win = new Window({ url: 'http://localhost/' });
  const g = globalThis;
  const saved = {};
  // ⚠ In a browser the global object IS the window, so `addEventListener(...)` with no receiver is
  // correct, and this codebase writes it that way throughout. Node's global object is not a window,
  // so every screen threw "addEventListener is not defined" until these were mirrored too. That was
  // the harness being unlike a browser, not the source being wrong: the same screens render clean
  // in a real one. A DOM stand-in has to mirror the global object, not just the document.
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event',
    'CustomEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
    'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'SVGElement',
    'addEventListener', 'removeEventListener', 'dispatchEvent', 'matchMedia', 'location',
    'history', 'localStorage', 'sessionStorage', 'DOMParser', 'Image', 'Blob', 'FileReader',
    'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'HTMLInputElement', 'HTMLTextAreaElement',
    'HTMLSelectElement', 'HTMLAnchorElement', 'HTMLButtonElement', 'NodeFilter', 'Range'];
  // ⚠ Plain assignment fails on `navigator`, which is getter-only on modern Node, and the failure
  // is a TypeError that aborts the whole mount. defineProperty, and remember what was there.
  // ⚠ THIS OVERWROTE WHAT IT HAD ALREADY SAVED. `window` and `document` are in `keys` AND were put
  // again afterwards, so the second put recorded the happy-dom descriptor the first had just
  // installed, and the restore below then REINSTALLED happy-dom on globalThis instead of removing
  // it. Contained today only because `node --test` gives each file its own process; it would leak
  // into every other test the moment isolation is turned off. Save the FIRST descriptor only.
  const put = (k, v) => {
    if (!(k in saved)) saved[k] = Object.getOwnPropertyDescriptor(g, k);
    Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
  };
  for (const k of keys) {
    if (win[k] === undefined) continue;
    // A method pulled off the window loses its receiver, so bind it back.
    put(k, typeof win[k] === 'function' && !/^[A-Z]/.test(k) ? win[k].bind(win) : win[k]);
  }
  put('window', win); put('document', win.document);
  const Stub = class { observe() {} unobserve() {} disconnect() {} };
  if (!g.ResizeObserver) put('ResizeObserver', Stub);
  if (!g.IntersectionObserver) put('IntersectionObserver', Stub);
  // Set through `put` like everything else, so it is restored too. `false` is right here: the
  // flush is a real setTimeout, so act() warnings would be noise rather than signal.
  put('IS_REACT_ACT_ENVIRONMENT', false);

  try {
    const mod = await import(pathToFileURL(outfile).href);
    return await mod.run();
  } finally {
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(g, k, d); else delete g[k];
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

let RESULTS = null;
const results = async () => (RESULTS ||= await mountAll());

test('every deep dive screen mounts without throwing', async () => {
  const { out: r } = await results();
  assert.deepEqual(r.filter((x) => x.err).map((x) => `${x.name}: ${x.err}`), [],
    'a screen threw while rendering');
});

test('every deep dive screen paints something', async () => {
  const { out: r } = await results();
  // A component that renders null throws nothing. The floor is deliberately low: this asks whether
  // the screen produced a page at all, which is the one thing no other test here can see.
  assert.deepEqual(r.filter((x) => !x.err && x.chars < 30).map((x) => `${x.name}: ${x.chars}`), [],
    'a screen rendered nothing');
});

test('the portal shell always carries a way back out', async () => {
  const { out: r } = await results();
  const shell = r.find((x) => x.name === 'DeepDivePortal');
  assert.ok(shell && !shell.err, `the portal shell did not mount: ${shell && shell.err}`);
  // ⚠ The site header is removed on these routes, so this bar is the ONLY route back to the
  // website. It has to be outside every early return, including the one that renders while the
  // session is still being checked, which is the branch this mount lands on.
  // ⚠ THE EXIT MOVED INTO A MENU, so asserting on its visible text would only pass while the menu
  // happened to be open. What has to be true is that the CONTROL leading out is on the screen, and
  // its accessible name is what a screen reader announces, so that is what is checked.
  assert.ok(/Your account and how to leave the portal/.test(shell.html),
    'no control leading out of the portal on the session-check screen');
  assert.ok(/Deep Dive/.test(shell.text), 'the portal bar did not render');
});

test('the control that records the FIRST of something is there when there are none', async () => {
  const { out: r } = await results();
  const proc = r.find((x) => x.name === 'ProcessPage');
  assert.ok(proc && !proc.err, 'the process page did not mount');
  // ⚠ THIS TRAP HAS BITTEN THREE TIMES: a section rendered only once it had content, so the control
  // for adding the first item did not exist and the drawer was the only route. It is invisible to
  // every other check, because the page looks right and the missing thing is a thing that is not
  // there. The fixture's process has no question and no session tied to it, so these add controls
  // can only be present if they render on an empty section.
  // ⚠ MEASURED ON THE BARE PROCESS, NOT THE POPULATED ONE. Asserting against a process that already
  // has a handoff proves nothing: the section renders because it has content, whether or not the
  // empty state works. Verified by planting the trap and watching this go red.
  const bare = r.find((x) => x.name === 'ProcessPage:bare');
  assert.ok(bare && !bare.err, 'the bare process page did not mount');
  for (const want of ['Tie a question', 'Tie a session', 'Add a handoff']) {
    assert.ok(bare.html.includes(want),
      `"${want}" is missing on a process with none, so the first one can only be added in the drawer`);
  }
});

test('a field edited in place still SHOWS its stored value', async () => {
  const { out: r } = await results();
  // ⚠ `pains` and `opens` were made editable in place, and a field can stop showing its value
  // without throwing and without dropping below the 30-character floor. The fixture puts a known
  // word in each, so this goes red the moment one stops reaching the page. Verified by planting.
  //
  // ⚠ WHAT IT DOES NOT CATCH, established by planting that too: it cannot tell a LIST from a
  // run-on string. Bypassing the custom renderer leaves the same words on the page in one
  // paragraph and this stays green. That difference is visual, and only a pair of eyes settles it.
  const proc = r.find((x) => x.name === 'ProcessPage');
  assert.ok(proc && !proc.err, 'the process page did not mount');
  for (const [field, word] of [['pains', 'Slow'], ['opens', 'Who checks it'],
    ['howToday', 'By hand'], ['whoRuns', 'The field team']]) {
    assert.ok(proc.text.includes(word), `process.${field} is not on the page ("${word}")`);
  }
});

test('React complains about nothing while the screens render', async () => {
  const { complaints } = await results();
  // Named patterns rather than every console.error, so an unrelated log from application code does
  // not turn this into noise nobody reads.
  const real = complaints.filter((m) => /validateDOMNesting|cannot appear as a descendant|unique "key"|changing an? (un)?controlled input|Rendered more hooks|Each child in a list/i.test(m));
  assert.deepEqual([...new Set(real)], [], 'React warned while rendering');
});

test('the mount covers every screen and every drawer kind', async () => {
  const { out: r, seeded } = await results();
  const SEEDED = new Set(seeded);
  const names = new Set(r.map((x) => x.name));
  for (const k of ['ProcessPage', 'QuestionPage', 'EvidencePage', 'SessionPage', 'SourcePage',
    'PersonPage', 'OfferingBoard', 'BuildPage']) assert.ok(names.has(k), `${k} is not mounted`);
  // ⚠ Every tab in TABS has to be mounted, or a new one ships with no render coverage at all.
  // Pillars folded into Enquiry as its questions band (12 Sep), so it is no longer a tab.
  for (const k of ['Overview', 'Processes', 'Organisation', 'Innovation', 'Enquiry',
    'Sessions', 'Competitors', 'KPIs', 'History']) {
    assert.ok(names.has(`tab:${k}`), `the ${k} tab is not mounted`);
  }
  // ⚠ The drawer is the only screen with a per-kind code path, and a kind added to the schema with
  // no form is exactly what this catches: the build kind shipped with a dead Add button.
  const { KINDS } = await import('../data/deepdive-schema.mjs');
  for (const k of KINDS) {
    assert.ok(names.has(`drawer:${k}`), `drawer:${k} is not mounted`);
    assert.ok(names.has(`drawer:edit:${k}`), `drawer:edit:${k} is not mounted`);
    // ⚠ A kind with no seed would mount `edit` over `undefined`, which renders an empty form and
    // passes. The map has to hold a real item of every kind or this test only looks thorough.
    assert.ok(SEEDED.has(k), `drawer:edit:${k} was mounted with no stored item to seed from`);
  }
  for (const k of ['ProcessPage', 'QuestionPage', 'EvidencePage', 'SessionPage', 'SourcePage',
    'PersonPage', 'OfferingBoard', 'BuildPage']) assert.ok(names.has(`client:${k}`), `client:${k} is not mounted`);
});

test('a client sees nothing that offers to change the record', async () => {
  // ⚠ THE CLIENT MOUNTS PROVED ONLY THAT THEY RENDER. The comment beside them has said "no edit
  // controls" since they were written, and nothing checked it: a mount test proves a screen does
  // not throw, never what it contains. Internal is the default in this portal and authorship is
  // staff-only, so an edit affordance on a client screen is either a dead control that lies about
  // what the reader can do, or a way in that should not exist.
  const { out: r } = await results();
  const clients = r.filter((x) => x.name.startsWith('client:'));
  assert.ok(clients.length >= 8, `only ${clients.length} client screens mounted; the scan has gone blind`);
  const bad = [];
  for (const c of clients) {
    const html = c.html || '';
    // Affordances that exist ONLY to change something. `dd-inline` is the in-place editor's
    // button form: read-only callers render a span or a paragraph instead, so seeing the class on
    // a <button> means the editor itself is reachable.
    for (const [what, re] of [
      ['an Edit button', /class="[^"]*\bdd-edit\b/],
      ['an in-place editor', /<button[^>]*class="[^"]*\bdd-inline\b/],
      ['an Add control', /class="[^"]*\bdd-add\b/],
      ['a link-add control', /class="[^"]*\bdd-link-add\b/],
      ['a status picker', /class="[^"]*\bdd-sel\b/],
      ['a visibility toggle', /class="[^"]*\bdd-vis\b/],
    ]) if (re.test(html)) bad.push(`${c.name}: ${what}`);
  }
  assert.deepEqual(bad, [], 'these client screens offer to change a record the reader cannot write to');
});
