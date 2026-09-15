// A field somebody can TYPE that no screen ever shows back.
//
// It is the quiet failure of a record: the drawer accepts it, the store keeps it, the change log
// records it, and it is never seen again. `session.output` had been in the schema since the
// beginning and was rendered nowhere; `task.note` was editable in the drawer and rendered nowhere.
// Both were found by reading, months apart. This is the check.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { FIELDS, KINDS } from '../data/deepdive-schema.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
// ⚠ THE DRAWER IS EXCLUDED, and that is the whole point of the check.
// RecordDrawer seeds its form state with `output: seed.output || ''`, which matched the pattern and
// made every field look rendered — including the two this file exists because of. A form showing
// you your own input is not the record showing it back. The question is whether any SCREEN does.
// ⚠ SCOPED TO THE PAGE THAT RENDERS EACH KIND, because scanning every file matched things that have
// nothing to do with the record: `supabase.from(`, `Array.from(`, `Icon.link`, `customer.name`,
// `staff.role`. `question.from` passed on `supabase.from` alone — I removed every real render of it
// and the test stayed green. A check satisfied by unrelated code is not a check.
// The drawer is excluded everywhere: a form showing you your own input is not the record showing it
// back, and its form state (`output: seed.output`) matched every field name there is.
const read = (f) => fs.readFileSync(path.join(here, f), 'utf8');
const strip = (t) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const PORTAL = strip(read('DeepDivePortal.jsx'));

/** ⚠ THE WHOLE PORTAL IS TOO BIG A SCOPE. Four kinds had no page and fell back to all 2,500 lines
 *  of it, where `k.current`, `e.target` and `c.unit` satisfied `kpi.current`, `kpi.target` and
 *  `competitor.unit` — the same "satisfied by unrelated code" fault this file was rewritten to fix,
 *  surviving in the half that had no page to point at. Those kinds ARE rendered, by a named panel
 *  component inside the portal, so the scope is that function. */
function componentIn(src, name) {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) return '';
  const next = src.indexOf('\nfunction ', at + 1);
  return src.slice(at, next < 0 ? src.length : next);
}

const WHERE = {
  process: ['ProcessPage.jsx', 'ProcessCanvas.jsx', 'OfferingBoard.jsx'],
  question: ['QuestionPage.jsx'], evidence: ['EvidencePage.jsx'], session: ['SessionPage.jsx'],
  source: ['SourcePage.jsx'], person: ['PersonPage.jsx'], task: ['PersonPage.jsx'],
  offering: ['OfferingBoard.jsx'],
  // A proposal now has a page of its own; the process page still shows the summary of it.
  build: ['BuildPage.jsx', 'ProcessPage.jsx'],
  unit: [],
  kpi: ['KpiPage.jsx'], hypothesis: ['HypothesisPage.jsx'],
  competitor: ['CompetitorPage.jsx'],
  // The middle of the chain: where change could create value, and what delivering it would take.
  opportunity: ['OpportunityRail.jsx'], complexity: ['OpportunityRail.jsx'],
};
/** For the kinds with no page of their own, the panel that renders them. */
// ⚠ A PANEL THAT DELEGATES NEEDS ITS DELEGATE IN SCOPE. Scoping `unit` to Organisation alone
// reported unitType, lead and does as unrendered; all three are drawn by OrgUnit, the component
// Organisation calls. A scope tight enough to be useful is tight enough to be wrong, so it names
// every component that does the drawing.
const PANEL = { kpi: ['Kpis'], hypothesis: ['Hypotheses'], competitor: ['Competitors'],
                unit: ['Organisation', 'OrgUnit'] };

const jsxFor = (kind) => [
  ...(PANEL[kind] ? PANEL[kind].map((c) => componentIn(PORTAL, c)) : [PORTAL]),
  ...(WHERE[kind] || []).map((f) => strip(read(f))),
].join('\n');
const jsx = PORTAL;   // kept for the blind-scanner guard below

// Fields that are deliberately not shown as themselves, with the reason. Anything not here must
// appear somewhere in the JSX.
const NOT_SHOWN = {
  'process.x': 'canvas geometry, seen as the position of the box',
  'process.y': 'canvas geometry, seen as the position of the box',
  'question.mergedFrom': 'provenance of a merge, kept for the trail rather than displayed',
  'session.personId': 'resolved to a person and rendered as their name',
  'task.personId': 'resolved to a person and rendered as their name',
  'kpi.unitId': 'resolved to a unit and rendered as its name',
  'unit.leadId': 'resolved to a person and rendered as their name',
  'person.unitId': 'resolved to a unit and rendered as its name',
  'process.unitId': 'resolved to a unit and rendered as its name',
  'session.unitId': 'resolved to a unit and rendered as its name',
  'unit.parent': 'drawn as the shape of the org chart',
  'person.reportsTo': 'drawn as the shape of the people chart',
  'evidence.provenanceKind': 'rendered through the provenance vocabulary, not as a raw field',
  'complexity.buildId': 'resolved to an initiative and rendered as its name',
  'opportunity.fromFindings': 'counted rather than listed: the ids are the link, the count is the fact',
};

// ⚠ THE SCOPE OF THIS CHECK, STATED, BECAUSE IT CANNOT COVER EVERYTHING.
// It matches `something.fieldName` anywhere in the JSX, which cannot tell `task.note` from
// `unit.note`. So it only checks field names that belong to exactly ONE kind: 77 of 94. The
// seventeen shared names below are NOT covered, and `task.note` — one of the two bugs that prompted
// this file — is among them. Saying so here is the point: a check that quietly covers 82% while
// reading like it covers everything is worse than one that names its own blind spot.
const owners = {};
for (const k of KINDS) for (const f of FIELDS[k]) (owners[f] ||= []).push(k);
const SHARED = Object.entries(owners).filter(([, ks]) => ks.length > 1).map(([f]) => f);

test('every uniquely named field a practitioner can type is rendered somewhere', () => {
  const unseen = [];
  for (const kind of KINDS) {
    for (const field of FIELDS[kind]) {
      if (NOT_SHOWN[`${kind}.${field}`]) continue;
      if (SHARED.includes(field)) continue;               // see the note above
      const seen = new RegExp(`\\b[A-Za-z_$][\\w$]*\\.${field}\\b`).test(jsxFor(kind));
      if (!seen) unseen.push(`${kind}.${field}`);
    }
  }
  assert.deepEqual(unseen, [],
    'these can be typed and stored and no screen shows them back — render them, or list them in '
    + 'NOT_SHOWN with the reason');
});

test('the blind spot is the size it claims to be', () => {
  // If a refactor makes many more names shared, the check silently shrinks. This notices.
  assert.ok(SHARED.length <= 20, `${SHARED.length} field names are now shared, so this check covers `
    + `much less than it did: ${SHARED.join(', ')}`);
});

test('the scanner can still see the JSX', () => {
  assert.ok(jsx.length > 50000, `only read ${jsx.length} chars of JSX — the scanner has gone blind`);
});
