// The Deep Dive Portal's vocabulary and engagement registry.
//
// Operating Standard v2.3, 4.10: on commitment in principle the client is given access to the Portal,
// BEFORE commercial commitment, so they can see the shape of the investigation before funding it. The
// Portal carries the areas to be scrutinised, the evidence record with provenance and validation status,
// status logging, and requests for access, participation and information.
//
// NOTHING client-specific lives here, and that includes which clients exist. An engagement's content
// AND its descriptor (client, sponsor, stage) are Confidential and are fetched at runtime by
// ../store/deepdive-source.mjs, never imported: anything imported is compiled into a bundle that any
// visitor can download, signed in or not. This module holds only the shared vocabulary and the
// counting, all of which is safe to ship.

// ── the Greatstone Transformation Pillars, Appendix A, ratified 4 September 2026 ──────────────
// Two layers: four client-facing, eight working beneath, two under each. The working pillars drive
// the investigation. NOTE: this is NOT the set carried by the public site's PillarCards / Pillars /
// PillarExplorer blocks and maturity-seed.mjs, which still hold Book III's superseded set
// (Innovation and Value in place of Process and Governance). Reconciling the public site is a
// separate, content-owner decision; the Portal is a Standard instrument and follows the Standard.
export const PILLAR_GROUPS = [
  { key: 'innovation', name: 'Innovation', asks: 'What the organisation knows, and what it uses to know it', pillars: ['Data', 'Technology'] },
  { key: 'culture',    name: 'Culture',    asks: 'Who does the work, and how what they know moves between them', pillars: ['People', 'Communication'] },
  { key: 'operations', name: 'Operations', asks: 'How work gets done, and what controls it', pillars: ['Process', 'Governance'] },
  { key: 'market',     name: 'Market',     asks: 'Who it serves, and who it competes with', pillars: ['Customer', 'Competitor'] },
];

export const groupOf = (pillar) => PILLAR_GROUPS.find((g) => g.pillars.includes(pillar)) || null;

// ── certainty, 4.2. Effort follows it: Known costs nothing, Unknown is where the effort belongs ──
export const CERTAINTY = {
  known:     { label: 'Known',     verb: 'State it',       blurb: 'Established through Discovery, the GITA or a prior deliverable. Carried into the plan, never asked again.', effort: 'None' },
  indicated: { label: 'Indicated', verb: 'Validate it',    blurb: 'Believed but not yet evidenced.', effort: 'Proportionate to what rests on it' },
  unknown:   { label: 'Unknown',   verb: 'Investigate it', blurb: 'Not established. This is what the Deep Dive goes and finds out.', effort: 'Where the effort belongs' },
};
export const CERTAINTY_ORDER = ['known', 'indicated', 'unknown'];

// ── the evidence record, 4.10. Provenance is who holds it; validation status is whether we have seen it ──
export const EVIDENCE_STATE = {
  held:    { label: 'Held',        blurb: 'In hand and examined.' },
  partial: { label: 'Part held',   blurb: 'Some of it established. The record behind it is still outstanding.' },
  missing: { label: 'Outstanding', blurb: 'Requested, not yet provided.' },
  ours:    { label: 'Ours to build', blurb: 'Greatstone builds this. Nothing is asked of the client beyond correcting it.' },
  // ⚠ A DECISION, NOT A FAILURE. Evidence we will not get, where the assessment proceeds with the
  // limitation recorded. Without this state such an item stays Outstanding forever and the register
  // slowly becomes a list of things we did not manage rather than a record of what we decided.
  accepted: { label: 'Accepted limitation', blurb: 'We will not get this. The assessment proceeds and the limitation stays visible wherever it bears on a conclusion.' },
};

// ── the SECOND axis. `state` is do we have it; this is have we assessed it ────────────────────
// Validation is about the FITNESS OF THE EVIDENCE for assessment use. It does not mean every
// statement inside the source is factually true, and a record that blurs those two ends up
// presenting somebody's confident memo as established fact.
export const EVIDENCE_VSTATE = {
  captured:   { label: 'Captured',   blurb: 'In the record. Nobody has weighed it yet.' },
  reviewed:   { label: 'Reviewed',   blurb: 'Relevance, context and reliability assessed.' },
  validated:  { label: 'Validated',  blurb: 'Fit to support a material conclusion. Not a claim that everything in it is true.' },
  challenged: { label: 'Challenged', blurb: 'Something material conflicts with it. The conflict is the signal, not a defect.' },
  restricted: { label: 'Restricted', blurb: 'Held under a limit on how it may be used or who may see it.' },
  superseded: { label: 'Superseded', blurb: 'A later source replaced it. Kept so the change stays visible.' },
};
export const EVIDENCE_VSTATE_ORDER = ['captured', 'reviewed', 'validated', 'challenged', 'restricted', 'superseded'];

/** The instruments ask evidence to be classified Fact, Perspective or Unknown. We record HOW WE
 *  KNOW instead, which is strictly more informative and answers the classification on the way past:
 *  "seen" and "measured" are facts because somebody can go and look, "told" is a perspective however
 *  confidently it was said, and "assumed" is not evidence at all.
 *
 *  ⚠ `inferred` maps to nothing on purpose. An inference is OURS, not the source's, and filing it as
 *  a Fact is precisely how an interpretation becomes indistinguishable from the thing it was drawn
 *  from. It has to be carried as a finding, where it can be challenged. */
export const BEN_CLASSIFICATION = {
  seen: 'Fact', measured: 'Fact', held: 'Fact',
  told: 'Perspective',
  assumed: 'Unknown', inferred: null,
};

// which kind of request an evidence item actually is, so the register never drifts from the plan
export const REQUEST_KIND = {
  information:   { label: 'Information', blurb: 'A document, a record or a dataset.' },
  access:        { label: 'Access',      blurb: 'Read-only entry to a system, or approval to observe.' },
  participation: { label: 'Participation', blurb: 'A person’s time, in one session covering every pillar they can speak to.' },
};

// an evidence item that names a system or a site visit is an access request, not an information one
const ACCESS_RE = /\b(access|read only|read-only|observ|site visit|workspace)\b/i;
export const requestKindOf = (ev) => (ACCESS_RE.test(ev.item + ' ' + ev.note) ? 'access' : 'information');

// ── derived coverage. Counted from the plan at render time, never stored, so it cannot disagree ──
export function coverageOf(data) {
  const items = (data.QUESTIONS || []).flatMap((q) => q.items);
  const certainty = { known: 0, indicated: 0, unknown: 0 };
  items.forEach((it) => { certainty[it.certainty] = (certainty[it.certainty] || 0) + 1; });

  const evidence = { held: 0, partial: 0, missing: 0, ours: 0, accepted: 0 };
  (data.EVIDENCE || []).forEach((e) => { evidence[e.state] = (evidence[e.state] || 0) + 1; });
  // The second axis counted separately, because "we hold nine documents" and "somebody has actually
  // assessed two of them" are different facts and only one of them is about rigour.
  const assessed = { captured: 0, reviewed: 0, validated: 0, challenged: 0, restricted: 0, superseded: 0 };
  (data.EVIDENCE || []).forEach((e) => { if (e.vstate) assessed[e.vstate] = (assessed[e.vstate] || 0) + 1; });

  // a pillar is only "covered" when at least one session can speak to it — a pillar nobody can
  // answer for is the gap 4.3 exists to prevent, so surface it rather than average it away.
  const spoken = new Set((data.SESSIONS || []).flatMap((s) => s.pillars));
  const uncovered = (data.PILLAR_ORDER || []).filter((p) => !spoken.has(p));

  return {
    questions: items.length,
    certainty,
    settled: certainty.known,
    toValidate: certainty.indicated,
    toInvestigate: certainty.unknown,
    evidence,
    assessed,
    // ⚠ An accepted limitation is NOT outstanding. It is closed, by a decision, and counting it as
    // work-in-hand would keep it on the chase list forever.
    outstanding: evidence.missing + evidence.partial,
    // Held but nobody has weighed it. This is the gap the second axis exists to surface.
    unassessed: assessed.captured,
    pillars: (data.PILLAR_ORDER || []).length,
    uncovered,
    sessions: (data.SESSIONS || []).length,
    processes: (data.PROCESSES || []).length,
  };
}

// questions belonging to one pillar, in plan order
export const questionsFor = (data, pillar) =>
  (data.QUESTIONS || []).find((q) => q.pillar === pillar) || { pillar, group: null, items: [] };

// processes that touch a pillar
export const processesFor = (data, pillar) =>
  (data.PROCESSES || []).filter((p) => p.pillars.includes(pillar));

// sessions that can speak to a pillar
export const sessionsFor = (data, pillar) =>
  (data.SESSIONS || []).filter((s) => s.pillars.includes(pillar));
