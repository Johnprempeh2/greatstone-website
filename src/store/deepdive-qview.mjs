// The flat questions view: one list, filtered, instead of eight accordions.
//
// The pillar accordion answers "how does Data look?". It cannot answer "show me the 33 questions
// nobody has decided how to answer", because those cut across every pillar (John, 10 Sep). The
// rows come from questionCoverage, so this view and the Sessions tab's gap stat can never disagree
// about what counts as undecided.
import { questionCoverage, PERSON_ROUTES } from '../data/deepdive-schema.mjs';

/** What a row is, for filtering. Route has three honest states, not two: decided-to-a-person,
 *  decided-away-from-people, and nobody-has-decided. Collapsing the last two into "not a session"
 *  is how the portal's own stat used to manufacture meetings. */
export function rowFacts(r) {
  const route = r.question.route || null;
  return {
    pillar: r.pillar,
    pillars: [r.pillar, ...(r.question.alsoPillars || [])],   // home first, then the others
    certainty: r.question.certainty,
    tied: r.sessions.length > 0,
    // The PROCESS tie, which is not the session tie: `tied` says a meeting will ask it, `procs`
    // says which part of the business it is about. The Processes tab's "not yet tied to a process"
    // banner hands off to this view filtered on it, so reusing `tie` here would land on the wrong
    // list.
    procs: r.question.processes || [],
    route,
    routeState: !route ? 'undecided' : PERSON_ROUTES.includes(route) ? 'person' : 'gathered',
  };
}

/** rows from questionCoverage(plan).rows; filters: {cert, tie, routeState, pillar, proc}, null =
 *  off. `proc` is 'loose' (tied to no process) or 'dangling' (tied to a process number no longer
 *  in the record); dangling needs `f.procNums`, a Set of the numbers that still exist, because a
 *  row alone cannot know what was deleted. */
export function filterRows(rows, f = {}) {
  return rows.filter((r) => {
    const x = rowFacts(r);
    if (f.cert && x.certainty !== f.cert) return false;
    if (f.open && x.certainty === 'known') return false;
    if (f.tie === 'tied' && !x.tied) return false;
    if (f.tie === 'untied' && x.tied) return false;
    if (f.proc === 'loose' && x.procs.length) return false;
    if (f.proc === 'dangling' && !(f.procNums && x.procs.some((n) => !f.procNums.has(n)))) return false;
    if (f.routeState && x.routeState !== f.routeState) return false;
    if (f.pillar && !x.pillars.includes(f.pillar)) return false;
    return true;
  });
}

/** The one-click preset: what still needs a decision. Untied AND route undecided, which is the
 *  same predicate the coverage stat calls the honest gap, minus rows a session already absorbs. */
export const NEEDS_DECIDING = { tie: 'untied', routeState: 'undecided', open: true };

export function viewCounts(rows) {
  const c = { all: rows.length, undecided: 0, untied: 0, tiedOrRouted: 0 };
  for (const r of rows) {
    const x = rowFacts(r);
    if (x.routeState === 'undecided' && !x.tied && x.certainty !== 'known') c.undecided += 1;
    if (!x.tied) c.untied += 1; else c.tiedOrRouted += 1;
  }
  return c;
}
