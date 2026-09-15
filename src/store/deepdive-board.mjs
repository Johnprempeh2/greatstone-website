// Which processes deliver which offering, resolved in ONE place.
//
// The link is stored twice: an offering names its processes, and a process names its offerings.
// Two mirrors of one relationship drift the moment either side is edited, and a screen that reads
// both and renders the union renders the drift as if it were data. So every surface reads the
// offering's side, because that is the offering's own statement about what delivers it, and the
// disagreement is surfaced as a counted finding instead of being quietly merged away.
//
// MEMBERSHIP IS NOT SEQUENCE. An offering's process list says which processes deliver it. It does
// not say in what order, and laying the board out by list order would manufacture exactly the
// inference this record refuses everywhere else. A row of arrows is drawn only when the RECORDED
// handoffs order the members completely, and otherwise the members are shown as an unordered set
// with the absence stated in words.

/** The processes an offering names, in record order. Numbers that resolve to nothing are dropped
 *  here and counted by driftOf, rather than rendering as a gap nobody can explain. */
export function processesForOffering(plan, offering) {
  if (!offering) return [];
  const by = new Map((plan.PROCESSES || []).map((p) => [p.num, p]));
  const seen = new Set();
  return (offering.processes || [])
    .map((n) => by.get(n))
    .filter((p) => p && !seen.has(p.id) && seen.add(p.id));
}

/** The members in order, but ONLY when the recorded handoffs order all of them into one path.
 *  Anything else (no edges, a branch, a fork, a cycle) returns null and is drawn as a set. */
export function chainOf(members) {
  if (members.length < 2) return members.length ? [...members] : null;
  const nums = new Set(members.map((p) => p.num));
  const out = new Map();
  for (const p of members) {
    // ⚠ DEDUPED, BECAUSE ONE EDGE WRITTEN TWICE IS NOT TWO EDGES. `checkFeeds` in the schema drops
    // duplicates, but it runs on WRITE and never on load, so a row stored before that check existed
    // can still hold `['02','02']`. Counted raw, that reads as a fork, and a chain the record can
    // fully prove gets drawn as an unordered set with "no order recorded" written under it.
    const inside = [...new Set((p.feeds || []).filter((n) => nums.has(n) && n !== p.num))];
    if (inside.length > 1) return null;           // a fork is not a chain
    if (inside.length === 1) out.set(p.num, inside[0]);
  }
  if (out.size !== members.length - 1) return null;
  const fedInto = new Set([...out.values()]);
  const roots = members.filter((p) => !fedInto.has(p.num));
  if (roots.length !== 1) return null;
  const path = [];
  const by = new Map(members.map((p) => [p.num, p]));
  let cur = roots[0];
  while (cur && path.length <= members.length) {
    path.push(cur);
    const next = out.get(cur.num);
    cur = next ? by.get(next) : null;
  }
  return path.length === members.length ? path : null;
}

/** The recorded handoffs among a set of members, for the case where they do not form one path. */
export function handoffsWithin(members) {
  const nums = new Set(members.map((p) => p.num));
  const by = new Map(members.map((p) => [p.num, p]));
  const out = [];
  for (const p of members) {
    for (const n of p.feeds || []) if (nums.has(n) && n !== p.num) out.push({ from: p, to: by.get(n) });
  }
  return out;
}

/** Processes no offering names. Not "shared across every offering": an empty list records that
 *  nobody has said which offering this serves, and reading an absence as a universal is the move
 *  this board refuses everywhere else. */
export function unnamedProcesses(plan) {
  const named = new Set((plan.OFFERINGS || []).flatMap((o) => o.processes || []));
  return (plan.PROCESSES || []).filter((p) => !named.has(p.num));
}

/** Where the two mirrors disagree. Author-only, and counted rather than silently reconciled.
 *
 *  Three shapes, and a renderer keys on which parts a row carries, because each part is a
 *  different way in: a process has a page, an offering has a lane on the board, and a ref that
 *  resolves to nothing has neither and can only be named.
 *    { process, ref }        the process names an offering ref this record does not hold
 *    { process, offering }   the process says it serves an offering that does not name it back
 *    { offering, ref }       the offering names a process number this record does not hold
 *  `why` stays the plain sentence, for anything that can only print text. The resolved offering
 *  used to live only inside that string, which left the board no way to open it. */
export function driftOf(plan) {
  const offerings = plan.OFFERINGS || [];
  const byRef = new Map(offerings.map((o) => [o.ref, o]));
  const nums = new Set((plan.PROCESSES || []).map((p) => p.num));
  const out = [];
  for (const p of plan.PROCESSES || []) {
    for (const ref of p.offerings || []) {
      const o = byRef.get(ref);
      if (!o) out.push({ process: p, ref, why: 'names an offering this record does not hold' });
      else if (!(o.processes || []).includes(p.num)) {
        out.push({ process: p, offering: o, ref, why: `says it serves ${o.name}, which does not name it back` });
      }
    }
  }
  for (const o of offerings) {
    for (const n of o.processes || []) {
      if (!nums.has(n)) out.push({ offering: o, ref: n, why: 'names a process this record does not hold' });
    }
  }
  return out;
}

/** What the board can prove about an offering, in words rather than a percentage. */
export function coverageOfOffering(plan, offering) {
  const members = processesForOffering(plan, offering);
  const chain = chainOf(members);
  const handoffs = handoffsWithin(members).length;
  const stepped = members.filter((p) => (p.steps || []).length).length;
  return { members, chain, handoffs, stepped, count: members.length };
}

/** Which offering the board opens on: the one with the most recorded. Four of six are empty on a
 *  fresh record, and opening on an empty stage reads as a broken page rather than as the finding. */
export function defaultOffering(plan) {
  let win = null, n = -1;
  for (const o of plan.OFFERINGS || []) {
    const c = processesForOffering(plan, o).length;
    if (c > n) { n = c; win = o; }
  }
  return win;
}
