// The organisation, as a chart.
//
// A KPI that says "team" tells you the size of the claim; it does not tell you WHOSE number it is.
// Assigning it to a unit does, and once numbers hang off boxes you can roll them up, compare two
// teams doing the same job, and see which part of the business nobody is measuring at all.
//
// The tree is derived, never stored: a stored tree is a second copy of `parent` that drifts.

/** Units arranged as a forest, deepest-last within each level. A unit whose parent is missing is
 *  surfaced at the root rather than dropped, because a box that vanishes from the chart is worse
 *  than one drawn in the wrong place. */
export function orgTree(plan) {
  const units = plan.UNITS || [];
  const byId = new Map(units.map((u) => [u.id, u]));
  const kids = new Map();
  const roots = [];
  for (const u of units) {
    if (u.parent && byId.has(u.parent)) {
      if (!kids.has(u.parent)) kids.set(u.parent, []);
      kids.get(u.parent).push(u);
    } else {
      roots.push(u);
    }
  }
  const order = (a, b) => String(a.ref || a.name).localeCompare(String(b.ref || b.name));
  const build = (u, depth, guard) => {
    // The schema refuses a cycle on write, but a record can be edited by two writers and read by
    // this before either guard ran. A renderer that can hang is not a renderer.
    if (guard.has(u.id)) return null;
    guard.add(u.id);
    const children = (kids.get(u.id) || []).sort(order).map((c) => build(c, depth + 1, guard)).filter(Boolean);
    guard.delete(u.id);
    return { unit: u, depth, children };
  };
  return roots.sort(order).map((u) => build(u, 0, new Set())).filter(Boolean);
}

/** Flattened, in the order the chart reads, so a list of options matches the picture. */
export function orgList(plan) {
  const out = [];
  const walk = (nodes) => { for (const n of nodes) { out.push(n); walk(n.children); } };
  walk(orgTree(plan));
  return out;
}

/** What hangs off one unit: who is in it, the numbers it owns, what it runs, who we sit with. */
export function unitHolds(plan, unitId) {
  return {
    people: (plan.PEOPLE || []).filter((n) => n.unitId === unitId),
    kpis: (plan.KPIS || []).filter((k) => k.unitId === unitId),
    processes: (plan.PROCESSES || []).filter((p) => p.unitId === unitId),
    sessions: (plan.SESSIONS || []).filter((s) => s.unitId === unitId),
  };
}

/** The people chart, which is NOT the unit chart. Somebody can sit in one team and report to
 *  somebody in another, and that gap is often the finding rather than a mistake. */
export function peopleTree(plan, people = plan.PEOPLE || []) {
  const ids = new Set(people.map((n) => n.id));
  const kids = new Map();
  const roots = [];
  for (const n of people) {
    if (n.reportsTo && ids.has(n.reportsTo)) {
      if (!kids.has(n.reportsTo)) kids.set(n.reportsTo, []);
      kids.get(n.reportsTo).push(n);
    } else {
      roots.push(n);
    }
  }
  const order = (a, b) => String(a.name).localeCompare(String(b.name));
  const build = (n, depth, guard) => {
    if (guard.has(n.id)) return null;
    guard.add(n.id);
    const children = (kids.get(n.id) || []).sort(order).map((c) => build(c, depth + 1, guard)).filter(Boolean);
    guard.delete(n.id);
    return { person: n, depth, children };
  };
  return roots.sort(order).map((n) => build(n, 0, new Set())).filter(Boolean);
}

/** Everything the record knows about one person, so a name is a way in rather than a label. */
export function personHolds(plan, personId) {
  const byId = new Map((plan.PEOPLE || []).map((n) => [n.id, n]));
  const me = byId.get(personId);
  return {
    person: me || null,
    unit: me?.unitId ? (plan.UNITS || []).find((u) => u.id === me.unitId) || null : null,
    manager: me?.reportsTo ? byId.get(me.reportsTo) || null : null,
    reports: (plan.PEOPLE || []).filter((n) => n.reportsTo === personId),
    worksWith: (me?.worksWith || []).map((id) => byId.get(id)).filter(Boolean),
    leads: (plan.UNITS || []).filter((u) => u.leadId === personId),
    sessions: (plan.SESSIONS || []).filter((s) => s.personId === personId),
    // ⚠ EVERYTHING ELSE THEY ARE ON THE HOOK FOR. All four of these were free text, so a person's
    // page could show their tasks and their reporting line and nothing about the processes they
    // run, the numbers that are theirs or the systems whose access goes through them. The words are
    // still on those records; these are the links, and they are what makes the page an oversight
    // rather than a profile.
    runs: (plan.PROCESSES || []).filter((x) => x.whoRunsId === personId),
    // ⚠ THE MOST SPECIFIC THING THE RECORD KNOWS ABOUT SOMEBODY. Running a process is a claim about
    // ownership; doing a step is the actual work, and it is where an automate-or-augment decision
    // gets made. It was free text until now and reached nobody.
    doesSteps: (plan.PROCESSES || []).flatMap((x) => (x.steps || [])
      .filter((st) => st.whoId === personId)
      .map((st) => ({ process: x, step: st }))),
    walkWith: (plan.PROCESSES || []).filter((x) => (x.speakToIds || []).includes(personId)),
    owns: (plan.SOURCES || []).filter((x) => x.ownerId === personId),
    numbers: (plan.KPIS || []).filter((x) => x.ownerId === personId),
    tasks: (plan.TASKS || []).filter((t) => t.personId === personId),
  };
}

/** A name written on a record that is not tied to anybody in the organisation.
 *
 *  ⚠ THIS IS THE POINT OF THE LINKS, AND THE HONEST HALF OF IT. Adding a picker beside every name
 *  does nothing on its own: what makes the sweep finishable is the record being able to say which
 *  names it still cannot follow. A name here is not an error, it may be somebody outside the
 *  business, but it is a thing somebody has to decide about rather than a gap that stays invisible. */
export function unlinkedNames(plan) {
  const out = [];
  // ⚠ A RECORDED GAP IS NOT AN UNLINKED NAME. Four processes say "Not established" under who runs
  // them, which is an honest answer somebody already wrote down. Listing those here as names to go
  // and link buried the real ones and made the surface read as twenty-eight jobs when it was five.
  const isGap = (t) => /^(not established|not recorded|unknown|none|n\/a|tbc|to be confirmed)\b/i.test(t);
  const add = (kind, id, label, field, text) => {
    const said = String(text || '').trim();
    if (said && !isGap(said)) out.push({ kind, id, label, field, said });
  };
  // ⚠ AND THESE LINES ARE SENTENCES, NOT NAMES. "The field supervisor, on what a day actually looks
  // like" leads with a person and then says what to ask them, so an exact-match comparison reported
  // every single one as unlinked while the link sat right there. A line counts as covered when a
  // person actually linked to that record is named anywhere in it.
  // ⚠ A leading article is not part of who somebody is. The record holds "The interviewers" and a
  // line reads "Interviewers themselves, not only those who manage them"; the same people, and an
  // exact substring match called it unlinked. Both sides lose the article before comparing.
  const bare = (t) => String(t).trim().toLowerCase().replace(/^(the|a|an|one|our)\s+/, '');
  const names = (ids) => (ids || []).map((id) => (plan.PEOPLE || []).find((n) => n.id === id))
    .filter(Boolean).map((n) => bare(n.name)).filter((n) => n.length > 2);
  const covered = (line, linked) => {
    const t = bare(line);
    return linked.some((n) => t.includes(n));
  };
  const byId = new Map((plan.PEOPLE || []).map((n) => [n.id, n]));
  for (const x of plan.PROCESSES || []) {
    const label = `${x.num} ${x.name}`.trim();
    if (!x.whoRunsId) add('process', x.id, label, 'who runs it', x.whoRuns);
    // ⚠ PARTIAL LINKING USED TO HIDE THE REST. This skipped every name the moment ONE person was
    // linked, so a process listing three people to speak to and linking one reported nothing left
    // to do. Each name is checked on its own against the people actually linked.
    const linked = names(x.speakToIds);
    for (const line of x.speakTo || []) {
      if (!covered(line, linked)) add('process', x.id, label, 'who to speak to', line);
    }
  }
  for (const x of plan.SOURCES || []) if (!x.ownerId) add('source', x.id, x.name, 'who controls it', x.owner);
  for (const x of plan.KPIS || []) if (!x.ownerId) add('kpi', x.id, x.name, 'whose number it is', x.owner);
  for (const x of plan.SESSIONS || []) if (!x.personId) add('session', x.id, x.person, 'who the session is with', x.person);
  for (const x of plan.UNITS || []) if (!x.leadId) add('unit', x.id, x.name, 'who leads it', x.lead);
  return out;
}

/** People nobody has put in a unit. Not hidden: an unplaced person is a question, not a tidy-up. */
export const unplacedPeople = (plan) => (plan.PEOPLE || [])
  .filter((n) => !n.unitId || !(plan.UNITS || []).some((u) => u.id === n.unitId));

/** Everything under a unit, including the unit itself: the roll-up. */
export function withDescendants(plan, unitId) {
  const kids = new Map();
  for (const u of plan.UNITS || []) if (u.parent) {
    if (!kids.has(u.parent)) kids.set(u.parent, []);
    kids.get(u.parent).push(u.id);
  }
  const out = []; const seen = new Set();
  const walk = (id) => {
    if (seen.has(id)) return;
    seen.add(id); out.push(id);
    for (const k of kids.get(id) || []) walk(k);
  };
  walk(unitId);
  return out;
}

/** The chain from a unit up to the top, for a breadcrumb. */
export function ancestry(plan, unitId) {
  const byId = new Map((plan.UNITS || []).map((u) => [u.id, u]));
  const out = []; const seen = new Set();
  let cur = byId.get(unitId);
  while (cur && !seen.has(cur.id)) { out.unshift(cur); seen.add(cur.id); cur = cur.parent ? byId.get(cur.parent) : null; }
  return out;
}

/** What the chart can prove, and where it cannot. Counted rather than hidden: a record where most
 *  of the numbers belong to nobody is a finding about the record, not a rendering problem. */
export function orgCoverage(plan) {
  const units = plan.UNITS || [];
  const kpis = plan.KPIS || [];
  const people = plan.PEOPLE || [];
  const measured = new Set(kpis.filter((k) => k.unitId).map((k) => k.unitId));
  const named = new Set((plan.SESSIONS || []).map((s) => s.personId).filter(Boolean));
  return {
    units: units.length,
    named: people.length,
    headcount: units.reduce((n, u) => n + (u.headcount || 0), 0),
    withAccount: people.filter((n) => n.accountEmail).length,
    kpis: kpis.length,
    unassignedKpis: kpis.filter((k) => !k.unitId).length,
    unitsWithNoNumber: units.filter((u) => !measured.has(u.id)),
    unitsWithNoLead: units.filter((u) => !u.lead && !u.leadId),
    unplaced: unplacedPeople(plan),
    // Somebody in the record we have not arranged to speak to. The point of mapping people is to
    // notice the ones nobody is scheduled to meet.
    notBeingMet: people.filter((n) => n.side === 'client' && !named.has(n.id)),
  };
}

// ── the target state ──────────────────────────────────────────────────────────────────────────
//
// Ben, 6 September 2026: "are there going to be less processes attached to this individual? No
// processes attached to this individual, because they've moved on to some agentic or automated
// process. Showing that information would be invaluable... now I've gone from a headcount of 23
// to 16."
//
// This is that arithmetic, and it is deliberately CONSERVATIVE and deliberately EXPLICIT about what
// it does not know. A headcount number put in front of a chief executive has to survive the
// question "where does that come from", so every figure here traces to tasks somebody recorded and
// a fate somebody chose. Nothing is inferred from a job title.
import { FATE_REMOVES, FATE_REDUCES } from '../data/deepdive-schema.mjs';

/** What one person does, and what is left of it in the target state. */
export function personLoad(plan, personId) {
  const tasks = (plan.TASKS || []).filter((t) => t.personId === personId);
  const freed = tasks.filter((t) => FATE_REMOVES.has(t.fate));
  const kept = tasks.filter((t) => !FATE_REMOVES.has(t.fate));
  // ⚠ MOVED WORK IS NOT SAVED WORK. It used to count as freed, so handing a task to a colleague
  // reduced the headcount. It leaves THIS person and stays in the business, so it is reported on
  // its own rather than disappearing into either column.
  const moved = tasks.filter((t) => t.fate === 'moves');
  // Less of it, still theirs. Real, but not a whole person, so it never becomes freed hours.
  const lightened = tasks.filter((t) => FATE_REDUCES.has(t.fate));
  const hoursOf = (list) => list.reduce((n, t) => n + (t.hours || 0), 0);
  return {
    tasks,
    kept,
    freed,
    decided: tasks.filter((t) => t.fate !== 'not decided').length,
    moved,
    lightened,
    hoursNow: hoursOf(tasks),
    hoursAfter: hoursOf(kept),
    hoursFreed: hoursOf(freed),
    // Off this person but still in the business. Named so a page can never present it as a saving.
    hoursMoved: hoursOf(moved),
    hoursLightened: hoursOf(lightened),
    // Hours are only known where somebody recorded them. Saying so stops a partial count reading
    // as a total.
    hoursUnknown: tasks.filter((t) => t.hours == null).length,
    // The processes that come off them entirely: every task touching that process is going.
    processesFreed: [...new Set(freed.flatMap((t) => t.processes))]
      .filter((n) => !kept.some((t) => t.processes.includes(n))),
  };
}

/** The whole business, current state against target state.
 *
 *  `headcountAfter` is expressed as a RANGE, not a single number, because freed hours only convert
 *  into fewer people if the remaining work can actually be rearranged. Handing a CEO one figure
 *  implies a precision this evidence does not have. */
export function targetState(plan, hoursPerWeek = 37.5) {
  const people = (plan.PEOPLE || []).filter((n) => n.side === 'client');
  const rows = people.map((n) => ({ person: n, ...personLoad(plan, n.id) }));
  const withTasks = rows.filter((r) => r.tasks.length);
  const hoursNow = rows.reduce((a, r) => a + r.hoursNow, 0);
  const hoursFreed = rows.reduce((a, r) => a + r.hoursFreed, 0);
  const headcountNow = (plan.UNITS || []).reduce((a, u) => a + (u.headcount || 0), 0) || people.length;
  // Whole people freed, only where the hours are known. Rounded DOWN: an overclaim here is the
  // kind that gets an engagement thrown out of the room.
  const peopleFreed = hoursPerWeek > 0 ? Math.floor(hoursFreed / hoursPerWeek) : 0;
  return {
    people: rows,
    peopleWithNoTasks: rows.filter((r) => !r.tasks.length).map((r) => r.person),
    tasks: (plan.TASKS || []).length,
    undecided: (plan.TASKS || []).filter((t) => t.fate === 'not decided').length,
    // Reported beside the saving, never inside it: work that moved to somebody else is work the
    // business still does, and a headcount claim that quietly includes it will not survive being
    // asked where it came from.
    hoursMoved: rows.reduce((a, r) => a + r.hoursMoved, 0),
    tasksMoved: rows.reduce((a, r) => a + r.moved.length, 0),
    hoursLightened: rows.reduce((a, r) => a + r.hoursLightened, 0),
    tasksLightened: rows.reduce((a, r) => a + r.lightened.length, 0),
    hoursNow,
    hoursFreed,
    hoursUnknown: rows.reduce((a, r) => a + r.hoursUnknown, 0),
    headcountNow,
    peopleFreed,
    headcountAfter: Math.max(0, headcountNow - peopleFreed),
    // What the claim rests on, so it can be checked rather than believed.
    restsOn: { peopleMapped: withTasks.length, ofPeople: people.length, hoursPerWeek },
  };
}

/** Everything in the record that touches one process.
 *
 *  Ben: "every task, every goal within a business is made up of processes... it is these processes
 *  that they're looking to identify." John: "everything needs to revolve around the process."
 *  So the process is the hub, and this is the one query that gathers its spokes. People arrive
 *  INDIRECTLY, through the tasks they do inside it, because that is the only link the record can
 *  actually evidence: naming a person against a process without a task behind it would be a guess.
 */
export function processHub(plan, num) {
  const tasks = (plan.TASKS || []).filter((t) => (t.processes || []).includes(num));
  const byPerson = new Map((plan.PEOPLE || []).map((n) => [n.id, n]));
  const people = [...new Set(tasks.map((t) => t.personId).filter(Boolean))]
    .map((id) => byPerson.get(id)).filter(Boolean);
  const questions = [];
  for (const g of plan.QUESTIONS || []) {
    for (const q of g.items || []) if ((q.processes || []).includes(num)) questions.push({ ...q, pillar: g.pillar });
  }
  const process = (plan.PROCESSES || []).find((p) => p.num === num) || null;
  return {
    process,
    questions,
    evidence: (plan.EVIDENCE || []).filter((e) => (e.processes || []).includes(num)),
    sessions: (plan.SESSIONS || []).filter((s) => (s.processes || []).includes(num)),
    tasks,
    people,
    // The pillars this process actually touches: its own, plus every pillar its questions sit under.
    pillars: [...new Set([...(process?.pillars || []), ...questions.map((q) => q.pillar)])],
    // Numbers that belong to whoever runs it, so a process can be read against what it is measured on.
    kpis: (plan.KPIS || []).filter((k) => k.unitId && k.unitId === process?.unitId),
    offerings: (plan.OFFERINGS || []).filter((o) => (o.processes || []).includes(num)),
    // What the GITA proposed that would CHANGE this chain. The Deep Dive exists to work out what it
    // would take to get there, so the proposal belongs beside the process it would change rather
    // than in a list of its own that nobody reads next to anything.
    builds: (plan.BUILDS || []).filter((b) => (b.processes || []).includes(num)),
  };
}

/** How much of the record is actually tied to a process, and what is floating free.
 *  John: "everything needs to revolve around the process", so what is NOT tied is the finding. */
export function processCoverage(plan) {
  const questions = (plan.QUESTIONS || []).flatMap((g) => g.items || []);
  const loose = (list) => list.filter((x) => !(x.processes || []).length);
  // ⚠ A TIE TO A PROCESS THAT IS NO LONGER HERE IS NOT THE SAME AS NO TIE.
  // checkRefs validates process numbers on write, but `remove` does not cascade, so deleting a
  // process leaves every question, build and task that named it pointing at nothing. Those rendered
  // exactly like an item that had never been tied to anything, and `loose` did not count them, so
  // the "not yet tied to a process" banner undercounted and the broken tie was invisible.
  const nums = new Set((plan.PROCESSES || []).map((x) => x.num));
  const dangling = (list) => list.filter((x) => (x.processes || []).some((n) => !nums.has(n)));
  return {
    questions: { total: questions.length, loose: loose(questions).length, dangling: dangling(questions).length },
    evidence: { total: (plan.EVIDENCE || []).length, loose: loose(plan.EVIDENCE || []).length, dangling: dangling(plan.EVIDENCE || []).length },
    sessions: { total: (plan.SESSIONS || []).length, loose: loose(plan.SESSIONS || []).length, dangling: dangling(plan.SESSIONS || []).length },
    tasks: { total: (plan.TASKS || []).length, loose: loose(plan.TASKS || []).length, dangling: dangling(plan.TASKS || []).length },
    // A proposed build names the chain it would change, or it is a proposal about nothing. It
    // belongs in this count for the same reason everything else does.
    builds: { total: (plan.BUILDS || []).length, loose: loose(plan.BUILDS || []).length, dangling: dangling(plan.BUILDS || []).length },
  };
}
