// The rules for changing a client record, in one place, runnable in both a browser and Node.
//
// WHY THIS EXISTS. Two things author records: the workspace in the browser and the deepdive MCP.
// If each carried its own idea of what a valid process or question is, they would drift, and the
// drift would only show up as a record that one of them refuses to open. So the vocabulary and the
// writer live here, and both callers run the same code over the same plan.
//
// PURE AND DEPENDENCY FREE. No node:crypto, no node:fs, no fetch. `applyOp` takes a plan and returns
// a new one or throws; it never touches storage. That is what lets the browser validate a change
// before sending it and the server validate the same change again on arrival, without a second
// implementation of "valid".
//
// It is also safe to bundle: vocabulary and field rules only, never client content.

export const KINDS = ['process', 'question', 'evidence', 'session', 'source', 'kpi', 'hypothesis', 'competitor', 'offering', 'unit', 'person', 'task', 'build', 'opportunity', 'complexity'];

// ── what the GITA proposed we build ──────────────────────────────────────────────────────────
// A GITA does not only assess. It proposes implementations, and those proposals are what the
// engagement is working TOWARDS. The Deep Dive is how we find out what it would actually take to
// get there: the existing processes are half the job, and how a proposed thing would behave inside
// this particular business is the other half.
//
// So a build item is carried in the record from the start, and its Deep Dive job is explicit in the
// fields: `needs` is what must be true for it to work, and `unknowns` is what we cannot yet answer.
// An unknown with nothing investigating it is a gap the record should be able to show.
//
// ⚠ NO COST, NO HOURS, NO RATE FIELD, DELIBERATELY. A GITA is priced by complexity index, never by
// an hourly rate and never by a committed number of hours, and the build number itself is John's
// and Ben's to set. A field here would invite a figure into the record that nobody has ratified.
/** Where a proposal stands, and it is ONE axis on purpose.
 *
 *  ⚠ "parked" retired. It covered three different situations that a reader cannot tell apart:
 *  waiting on a date, waiting on a decision, and ruled out. Those have different consequences, so
 *  they are different words.
 *
 *  ⚠ EVERY STATE THAT IS NOT MOVING FORWARD REQUIRES A REASON, enforced in buildItem. A proposal
 *  that stops with no recorded reason cannot be revisited: six months later nobody can tell whether
 *  it failed on cost, on capability or on somebody's preference, so it either gets re-argued from
 *  scratch or stays dead for a reason that no longer holds. */
export const BUILD_STATES = ['proposed', 'considering', 'agreed', 'building', 'live', 'deferred', 'tabled', 'cancelled'];
/** The states a reader must be given a reason for. */
export const BUILD_STATES_NEEDING_WHY = ['considering', 'deferred', 'tabled', 'cancelled'];
/** The word a reader sees. ⚠ ProcessPage kept its own copy of this map, so adding a state to the
 *  schema left that copy silently wrong: an unknown state fell through to the raw token. One map. */
export const BUILD_STATE_WORD = {
  proposed: 'Proposed', considering: 'Under consideration', agreed: 'Agreed', building: 'Being built',
  live: 'Live', deferred: 'Deferred', tabled: 'Tabled', cancelled: 'Cancelled',
};
export const BUILD_STATE_MEANS = {
  proposed: 'On the table, from the assessment. Nobody has weighed it yet.',
  considering: 'Actively being weighed. Say what the open question is.',
  agreed: 'Going ahead.',
  building: 'Being built now.',
  live: 'In their hands and running.',
  deferred: 'Later, and there is a date or a trigger. Say which.',
  tabled: 'Paused with no date. Say what would restart it.',
  cancelled: 'Ruled out. Say why, because this is the one a reader will question.',
};

// What the client actually sells. A workflow belongs to an OFFERING, not to the business as a whole:
// mystery shopping does not run the way tracking runs, and a record that assumes one chain for
// everything cannot say what it has covered. An offering with no process walked is a coverage gap
// worth seeing, not an empty screen.
export const OFFERING_STATES = ['live', 'attempted', 'stopped', 'planned'];

// A hypothesis is the instrument that keeps an investigation honest: it names what would CONFIRM it
// and, more importantly, what would KILL it, and what the plan does if it turns out to be wrong.
// Without the kill condition it is just an opinion with a number on it.
export const HYPOTHESIS_VERDICTS = ['open', 'confirmed', 'killed'];

// How a question gets answered. Most of a good plan is answered WITHOUT anyone's time, and recording
// the route is what lets the record say so rather than assuming a session for everything.
/* How a session is run, and how urgently it matters. Ben's Stakeholder and Persona Plan (the
   Indago DDIP v4, section 6): a session is organised around the EVIDENCE it exists to produce,
   named for that, and a persona can put several people in the room. Practitioner led is a person
   across the table; blended adds technology-enabled capture or engagement; technology enabled is
   the parallel instrument doing the sitting. */
export const SESSION_METHODS = ['practitioner led', 'blended', 'technology enabled'];
export const SESSION_PRIORITIES = ['critical', 'high', 'selective'];

export const ROUTES = ['session', 'document', 'system', 'observation', 'desk research',
                       'parallel interview', 'client of client', 'respondent research'];

// A KPI belongs to somebody. A company-wide number and a team's own number are different animals,
// and flattening them loses the thing that makes a KPI conversation useful: whose it is.
// ── the organisation ──────────────────────────────────────────────────────────────────────────
//
// A unit is a box on the org chart: the company, a division, a department, a team, or one person's
// role. `parent` is what makes it a chart rather than a list, and it is the thing that lets a
// number be assigned to a team and then tracked as that team's.
//
// The SAME vocabulary as KPI_SCOPES on purpose. A KPI scoped to "team" and a unit of type "team"
// have to be talking about the same thing, or assigning one to the other proves nothing.
// Which side of the table somebody sits on. Factual, and it decides what may ever be shown to
// them: a client's own people and Greatstone's people are not the same audience.
// ── the North Star ────────────────────────────────────────────────────────────────────────────
//
// Ben's ruling, 6 September 2026: every Deep Dive opens with the CEO's North Star, "established
// from their perspective, because then it gives us a certain minimum foundation with which we must
// work from. Because the target state must exceed or beat it."
//
// Two rules follow from that and both are enforced here rather than left to a practitioner's care:
//
//   1. THE WORDS ARE THEIRS. "At the beginning, instead of what you're trying to achieve: his words,
//      actual verbatim words." A vision we have tidied up is our vision, and the whole point is that
//      it is theirs, so the record keeps what was said and asks who said it.
//   2. CLARITY IS A JUDGEMENT WE MAKE OUT LOUD. "Put him so that his back is against the wall: if
//      anything is not clear, that means it's not thought through properly." So the record carries
//      how clear it actually is, and an unclear one is a finding rather than a blank.
export const CLARITY = ['unclear', 'partly clear', 'unequivocal'];

// Whether the ambition matches the business. Ben: "if you believe that the ambition doesn't match
// what the company is said to do, we should have that honest debate." Recording "not yet tested" is
// the honest default: it says the conversation has not happened, rather than implying agreement.
export const AMBITION_FIT = ['not yet tested', 'matches', 'falls short of the business', 'beyond what the business can carry'];

// ── what happens to a task ────────────────────────────────────────────────────────────────────
//
// Ben's four levers, in his own words: "Eliminate, automate, augment. Make it agentic." Plus the
// honest default, which is that nobody has decided yet. This is the field that turns an organogram
// into a TARGET STATE, because it is what lets the record say a process has come OFF a person
// rather than merely that it exists: "are there going to be less processes attached to this
// individual? No processes, because they've moved on to an agentic or automated process."
// ⚠ THE SIX TAGS WERE FOUR, AND ONE OF THE EXTRAS WAS NOT A TAG AT ALL.
// Simplify and Digitise were missing, so the two cheapest answers to "what should happen to this
// work" could not be recorded and every task skipped straight to automation. That is the bias the
// assessment order exists to prevent.
//
// Listed in ASSESSMENT ORDER. Elimination is tested first because removing work recovers its full
// cost while automating preserves that cost in another form, and one tag resolves per task at
// target state. `moves` and `stays` are not tags: `stays` is what it says when none of the six
// apply, and `moves` is a real thing that happens which changes nothing about the total.
export const TASK_FATE = ['not decided',
  'eliminated', 'simplified', 'digitised', 'automated', 'augmented', 'agentic',
  'moves', 'stays'];

/** What each tag means for the work and who performs it afterwards. This is what removes the
 *  overlap between them: the distinction is never how modern the answer sounds. */
export const FATE_MEANS = {
  'not decided': 'Nobody has judged this yet.',
  eliminated: 'The work ceases to exist. Nobody does it.',
  simplified: 'It continues with fewer steps, inputs or handoffs. The same people.',
  digitised:  'It continues, but the record moves from paper or documents into structured data. The same people.',
  automated:  'It continues, executed against fixed rules. A system, with no judgement.',
  augmented:  'It continues, with a person materially faster or more accurate. A person, assisted.',
  agentic:    'It continues, with approach and exceptions handled within limits. A system, with bounded judgement.',
  moves:      'It continues unchanged, performed by somebody else. The business still does it.',
  stays:      'Nothing changes. None of the six applies.',
};

/** ⚠ WHAT ACTUALLY COMES OFF A PERSON, AND `moves` IS NOT IT.
 *
 *  `moves` was in here, so work handed to a colleague counted as freed hours and reduced the
 *  headcount. Moving work frees one person and burdens another: unless the receiving person is
 *  recorded as gaining it, the rollup books a saving the business never makes. This is the same
 *  ruling as "removing a tool is not eliminating a process": if the activity still happens, it has
 *  not gone, whoever now performs it. The number this feeds goes in front of a chief executive and
 *  has to survive the question "where does that come from". */
export const FATE_REMOVES = new Set(['eliminated', 'automated', 'agentic']);

/** Tags that reduce the work without taking it off the person. They are NOT counted as freed hours:
 *  "less of it" is real but it is not a whole person, and the rollup is deliberately conservative.
 *  Kept as a set of its own so a page can say so rather than implying nothing happened. */
export const FATE_REDUCES = new Set(['simplified', 'digitised', 'augmented']);

export const PERSON_SIDES = ['client', 'greatstone', 'third party'];

export const UNIT_TYPES = ['company', 'division', 'department', 'team', 'individual'];

// How often a number is actually measured. A closed set, because "how often" is the axis you filter
// and group by, and free text makes "daily", "Daily", "every day" and "each morning" four different
// answers to one question. `other` exists so an odd cadence is recorded rather than forced.
export const CADENCES = ['continuous', 'daily', 'weekly', 'fortnightly', 'monthly', 'quarterly',
  'twice a year', 'annually', 'per project', 'per wave', 'ad hoc', 'not measured', 'other'];

// What somebody typing free text usually meant. Applied on the way in so an existing record, or a
// practitioner typing what comes naturally, lands on the vocabulary instead of being refused.
const CADENCE_ALIAS = {
  'every day': 'daily', 'each day': 'daily', 'day': 'daily', 'nightly': 'daily',
  'every week': 'weekly', 'week': 'weekly', 'weekly-ish': 'weekly',
  'every two weeks': 'fortnightly', 'biweekly': 'fortnightly', 'every fortnight': 'fortnightly',
  'every month': 'monthly', 'month': 'monthly', 'monthly-ish': 'monthly',
  'every quarter': 'quarterly', 'quarter': 'quarterly', 'q': 'quarterly',
  'half yearly': 'twice a year', 'half-yearly': 'twice a year', 'biannually': 'twice a year',
  'semi annually': 'twice a year', 'semi-annually': 'twice a year', 'every six months': 'twice a year',
  'yearly': 'annually', 'every year': 'annually', 'annual': 'annually', 'year': 'annually',
  'real time': 'continuous', 'real-time': 'continuous', 'live': 'continuous', 'always': 'continuous',
  'per wave of fieldwork': 'per wave', 'wave': 'per wave', 'per job': 'per project',
  'as needed': 'ad hoc', 'when needed': 'ad hoc', 'occasionally': 'ad hoc', 'irregular': 'ad hoc',
  'never': 'not measured', 'we do not': 'not measured', "we don't": 'not measured', 'none': 'not measured',
};

// How we know a thing: the evidence-quality axis. "We were told" and "we measured it" are different
// claims and the difference is the whole point of an evidence record, so it is not free text.
export const PROVENANCE_KINDS = ['seen', 'measured', 'held', 'told', 'inferred', 'assumed'];
const PROVENANCE_ALIAS = {
  'observed': 'seen', 'witnessed': 'seen', 'demonstrated': 'seen', 'on screen': 'seen', 'screen share': 'seen',
  'counted': 'measured', 'calculated': 'measured', 'from the system': 'measured',
  'in hand': 'held', 'we have it': 'held', 'document': 'held',
  'said': 'told', 'stated': 'told', 'reported': 'told', 'in a session': 'told', 'interview': 'told',
  'deduced': 'inferred', 'derived': 'inferred', 'implied': 'inferred',
  'guess': 'assumed', 'assumption': 'assumed', 'our view': 'assumed',
};

/** Map what somebody typed onto a controlled vocabulary, WITHOUT losing what they typed.
 *
 *  Returns [value, note]. A recognised word becomes the vocabulary term and no note. Anything else
 *  becomes `fallback` and the original text is handed back to be stored beside it, because a record
 *  that silently rewrites what a practitioner wrote is worse than one that admits it did not know. */
export function categorise(raw, allowed, alias = {}, fallback = 'other') {
  const t = String(raw ?? '').trim();
  if (!t) return ['', ''];
  const low = t.toLowerCase();
  if (allowed.includes(low)) return [low, ''];
  if (alias[low] && allowed.includes(alias[low])) return [alias[low], ''];
  if (!allowed.includes(fallback)) throw new Error(`"${t}" is not one of: ${allowed.join(', ')}.`);
  return [fallback, t];
}

/** The two vocabularies with their own alias tables baked in, so a caller cannot forget to pass
 *  one and quietly send every typed answer to "other". Each returns [value, whatTheyActuallyTyped]. */
export const cadenceOf = (raw) => categorise(raw, CADENCES, CADENCE_ALIAS, 'other');
export const provenanceKindOf = (raw) => categorise(raw, PROVENANCE_KINDS, PROVENANCE_ALIAS, null);

export const KPI_SCOPES = ['company', 'division', 'department', 'team', 'individual'];
// Whether a bigger number is better. Without this, "up 12%" cannot be read as good or bad.
export const KPI_DIRECTIONS = ['up', 'down', 'steady'];

/** How far a MEASURE can be relied on. Distinct from the confidence on a finding, which is about
 *  accounts agreeing: this is about the number itself. Verbal, like everything else here. */
export const MEASURE_CONFIDENCE = ['high', 'moderate', 'limited'];
export const MEASURE_CONFIDENCE_MEANS = {
  high: 'Reliable, representative evidence and a clearly defined method.',
  moderate: 'Useful, but subject to a material limitation.',
  limited: 'Directional only. Significant limitations remain.',
};

/** ⚠ A NUMBER YOU CANNOT REPRODUCE CANNOT BE COMPARED TO A LATER ONE, and comparing it anyway is
 *  how benefits realisation dies: a baseline of 8.4 days and a post-implementation 2.7 days that
 *  counted different populations, or different months, is not a 68% improvement. It is two numbers.
 *
 *  So a measure is only safe to set a target against once somebody can say HOW it was calculated
 *  and WHAT PERIOD it covers. This does not block recording the number, which is often the first
 *  thing anyone learns. It blocks treating it as a baseline. */
export function canBaseline(k) {
  const missing = [];
  if (k?.current == null) missing.push('a current value');
  if (!String(k?.definition || '').trim()) missing.push('how it is calculated');
  if (!String(k?.period || '').trim()) missing.push('what period it covers');
  if (!missing.length) return { ok: true, why: null };
  return {
    ok: false,
    why: `Not yet safe to set a target against: this needs ${missing.join(', ')}. `
       + 'Two numbers calculated differently are not an improvement, they are two numbers.',
  };
}
// Where information comes from, kept apart from the sessions that draw on it. A person can be in
// three sessions or none; a system is never in a session at all but is still a source. Modelling
// them as the same thing loses both.
export const SOURCE_TYPES = ['person', 'team', 'system', 'document', 'external'];
export const STATUS_IDS = ['open', 'active', 'done', 'blocked'];
export const VISIBILITY_IDS = ['internal', 'shared'];
export const CERTAINTY_IDS = ['known', 'indicated', 'unknown'];
/** ⚠ TWO AXES, NOT ONE, AND THEY WERE SHARING A FIELD.
 *
 *  `state` answers DO WE HAVE IT. `vstate` answers HAVE WE ASSESSED IT. They are independent
 *  judgements and collapsing them loses the one that matters most: a document sitting in the record
 *  untouched and a document somebody has read, weighed and decided is fit to support a conclusion
 *  both read as "Held", and a finding built on either looks equally sound.
 *
 *  `accepted` is new and was genuinely unrepresentable. Evidence we are never going to get, where
 *  the assessment proceeds anyway with the limitation recorded, is not "Outstanding": leaving it
 *  outstanding forever makes the register a list of failures rather than a record of decisions. */
export const EVIDENCE_STATE_IDS = ['held', 'partial', 'missing', 'ours', 'accepted'];

/** Validation applies to the FITNESS OF THE EVIDENCE for assessment use. It does not mean every
 *  statement inside the source is factually true, and a record that blurs those two will eventually
 *  present somebody's confident memo as established fact. */
export const EVIDENCE_VSTATE_IDS = ['captured', 'reviewed', 'validated', 'challenged', 'restricted', 'superseded'];

/** You cannot review what you do not hold. Without this the two axes drift into nonsense: evidence
 *  nobody has provided, marked Validated, with a finding resting on it. */
export const HOLDS_SOMETHING = new Set(['held', 'partial', 'ours']);
export function canReview(ev) {
  if (HOLDS_SOMETHING.has(ev?.state)) return { ok: true, why: null };
  return {
    ok: false,
    why: ev?.state === 'accepted'
      ? 'This is an accepted limitation: there is nothing in hand to assess.'
      : 'Nothing is in hand yet, so there is nothing to review. Record what we hold first.',
  };
}

/** THE TRANSFORMATION OPPORTUNITY IS A RECORD, NOT A FIELD. Ruled 9 September 2026.
 *
 *  It was a sentence written on a finding, which reads fine until you need the shape the method
 *  actually has: SEVERAL findings may point at ONE opportunity, and ONE opportunity may require
 *  SEVERAL builds. A sentence copied onto four findings is four opportunities that happen to match,
 *  and nothing can count them, dedupe them or carry them forward. An id is what makes the
 *  many-to-many representable at all. */
export const OPPORTUNITY_STATES = ['draft', 'refined', 'validated'];

/** Delivery complexity: what makes the transformation hard to IMPLEMENT. Deliberately distinct from
 *  how much investigation the Deep Dive needs (that is the Assessment Profile) and from what the
 *  work is worth commercially (that is the Transformation Profile). A large organisation may need an
 *  extensive Deep Dive and a focused implementation. */
export const COMPLEXITY_LEVELS = ['standard', 'elevated', 'significant'];
export const COMPLEXITY_LEVEL_MEANS = {
  standard:    'Normal delivery requirements, addressable through established approaches.',
  elevated:    'Material complexity needing additional planning, capability, coordination or control.',
  significant: 'Materially affects delivery structure, resources, risk, duration or sequencing, and needs explicit treatment.',
};
/** The ten dimensions. Assessed only to the extent relevant, which is why this is a list of entries
 *  rather than ten mandatory fields: an unassessed dimension is absent, not "standard". */
export const COMPLEXITY_DIMENSIONS = [
  'organisational scale', 'process', 'technology', 'data', 'integration',
  'transformation breadth', 'automation and ai', 'change', 'risk and regulatory', 'delivery dependencies',
];
export const COMPLEXITY_STATES = ['initial', 'refined', 'validated'];

// Operating Standard v2.3 Appendix A, ratified 4 September 2026. NOT Book III's superseded set,
// which the public site's PillarCards blocks still carry.
export const PILLARS = ['Data', 'Technology', 'People', 'Communication', 'Process', 'Governance', 'Customer', 'Competitor'];
export const PILLAR_GROUP = {
  Data: 'Innovation', Technology: 'Innovation',
  People: 'Culture', Communication: 'Culture',
  Process: 'Operations', Governance: 'Operations',
  Customer: 'Market', Competitor: 'Market',
};

/** ⚠ `logo` IS A LINK, NOT A FILE, AND THAT IS THE WHOLE POINT. A client's mark belongs to the
 *  client: bundling one into our JavaScript would put their brand into every visitor's download of
 *  the Greatstone site, which is exactly what the leak gate exists to stop. The record holds a URL
 *  to a mark that is already public on their own site, and the portal points at it. Nothing about
 *  a client ever enters the build. */
export const DESCRIPTOR = ['client', 'title', 'sponsor', 'stage', 'follows', 'access', 'accessNote', 'lead', 'logo'];
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export const SECTIONS = ['PROCESSES', 'QUESTIONS', 'SESSIONS', 'EVIDENCE', 'SOURCES', 'KPIS', 'HYPOTHESES', 'COMPETITORS', 'OFFERINGS', 'UNITS', 'PEOPLE', 'TASKS', 'BUILDS', 'OPPORTUNITIES', 'COMPLEXITY', 'PILLAR_ORDER', 'OUTCOMES', 'GATHERING'];
export const ENGAGEMENT_REQUIRED = ['slug', 'client', 'title', 'stage', 'access'];

// ── field rules ───────────────────────────────────────────────────────────────────────────────
export function oneOf(v, allowed, label) {
  if (!allowed.includes(v)) throw new Error(`${label} must be one of: ${allowed.join(', ')} (got "${v}")`);
  return v;
}
export function strList(v, label) {
  if (v === undefined || v === null) return [];
  if (typeof v === 'string') return v.split('\n').map((x) => x.trim()).filter(Boolean);
  if (!Array.isArray(v)) throw new Error(`${label} must be an array of strings.`);
  return v.map((x) => String(x).trim()).filter(Boolean);
}
/** A link to the actual thing: the Notion page the transcript sits on, the document, the dashboard.
 *
 *  Scheme-checked at WRITE time, because this record is written by an MCP as well as by a person,
 *  and a stored `javascript:` URL rendered as an anchor is script execution on a practitioner's
 *  click. http and https only. Every renderer checks again on the way out, since a record written
 *  before this guard existed would not have been checked at all.
 *
 *  A bare "notion.so/..." is accepted and normalised, because that is what gets pasted. */
export function link(v, label = 'link') {
  if (v === undefined || v === null) return '';
  const raw = String(v).trim();
  if (!raw) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let u;
  try { u = new URL(withScheme); } catch { throw new Error(`That ${label} is not a web address: "${raw}".`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`A ${label} has to be an http or https address. "${u.protocol}" is refused, because a stored link is opened by a click.`);
  }
  return u.href;
}

/** The same check on the way OUT, for anything stored before the check existed. Returns null rather
 *  than throwing: a bad link should not take the page down, it should simply not be a link. */
export function safeLink(v) {
  try { return link(v) || null; } catch { return null; }
}

/** A diagram coordinate. Layout only, and bounded so a stray drag cannot push a card somewhere
 *  nobody can scroll to. */
export function coord(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(8000, Math.round(n)));
}

export function checkPillars(list, label) {
  const bad = list.filter((p) => !PILLARS.includes(p));
  if (bad.length) throw new Error(`Unknown pillar(s) in ${label}: ${bad.join(', ')}. Valid: ${PILLARS.join(', ')}`);
  return list;
}

// Identity must be a function of what is STORED, never of what was typed. buildItem trims and pads,
// so hashing the raw fields meant "1" and "01" were different items while rendering identically:
// a save that changed nothing re-minted the id and orphaned that item's status, visibility and
// history, and a duplicate walked straight past the "already exists" check.
const normNum = (v) => (String(v || '').trim().padStart(2, '0').slice(0, 4) || '00');
const t = (v) => String(v || '').trim();

/** The text an item's identity is derived from. Kept separate from hashing because the two callers
 *  hash differently: Node has createHash, a browser has crypto.subtle (async). Neither invents the
 *  parts, so an id minted in a form and an id minted by the MCP agree. */
export function identityParts(kind, f) {
  switch (kind) {
    // normNum unconditionally: buildItem stores '00' for a blank number, so hashing anything else
    // for that case would once again identify by what was typed rather than by what is stored.
    case 'process': return [normNum(f.num), t(f.name)];
    case 'question': return [t(f.pillar), t(f.q)];
    case 'evidence': return [t(f.item)];
    case 'session': return [t(f.name) || t(f.person)];
    case 'kpi': return [t(f.scope), t(f.name)];
    case 'hypothesis': return [t(f.ref) || t(f.claim)];
    case 'competitor': return [t(f.name)];
    case 'offering': return [t(f.ref) || t(f.name)];
    case 'source': return [t(f.name)];
    case 'unit': return [t(f.ref) || t(f.name)];
    case 'person': return [t(f.name)];
    case 'task': return [t(f.personId), t(f.what)];
    case 'build': return [t(f.ref) || t(f.name)];
    case 'opportunity': return [t(f.ref) || t(f.name)];
    // One assessment per initiative, so the initiative IS the identity.
    case 'complexity': return [t(f.buildId)];
    default: throw new Error(`Unknown kind "${kind}". One of: ${KINDS.join(', ')}`);
  }
}
export const ID_PREFIX = { process: 'p', question: 'q', evidence: 'e', session: 's', source: 'r', kpi: 'k', hypothesis: 'h', competitor: 'c', offering: 'o', unit: 'u', person: 'n', task: 't', build: 'b', opportunity: 'y', complexity: 'x' };

/** Build a validated item. The id is supplied rather than computed, so a browser cannot mint an
 *  identity of its own choosing and every refusal below fires identically on both sides. */
/** The steps inside a process, in order.
 *
 *  "Data collection" is one box on a chain and a dozen actions in the room, and the difference is
 *  where the work actually goes wrong. A step carries who does it and what they do it in, because
 *  "a person carries a file from one tool to another" is the finding, and it is invisible unless the
 *  handoffs inside a process are written down.
 *
 *  Order is explicit and 1-based rather than implied by array position, so a step can be discussed
 *  by number without the number becoming its identity. */
export function stepList(v, label = 'steps') {
  if (v === undefined || v === null || v === '') return [];
  const rows = Array.isArray(v) ? v : String(v).split('\n');
  const out = [];
  for (const row of rows) {
    if (typeof row === 'string') {
      // "Interviewer calls from the list :: the interviewer :: the survey tool" — the separators are
      // optional, so a practitioner can type a bare line and fill the rest in later.
      const [name, who, tool] = row.split('::').map((x) => x.trim());
      if (!name) continue;
      out.push({ n: out.length + 1, name, who: who || '', whoId: null, tool: tool || '', detail: '' });
    } else if (row && typeof row === 'object') {
      const name = String(row.name || '').trim();
      if (!name) continue;
      out.push({
        n: out.length + 1, name,
        who: String(row.who || '').trim(),
        // ⚠ THE PERSON, BESIDE THE WORDS, exactly as whoRuns and speakTo work one level up. A step
        // is where the work actually happens, so "who does it" is the most specific answer the
        // record holds to what somebody is on the hook for, and it reached nobody's page because it
        // was only ever text. The words stay: half of these are a role, not a name on the chart.
        whoId: row.whoId ? String(row.whoId).trim() : null,
        tool: String(row.tool || '').trim(),
        detail: String(row.detail || '').trim(),
      });
    }
  }
  if (out.length > 40) throw new Error(`A process with more than 40 ${label} is probably several processes.`);
  return out;
}

/** Which fields each kind actually owns.
 *
 *  This exists because of one bug shape. An edit merges `{ ...stored, ...op.fields }`, and the
 *  drawer keeps ONE form object covering every kind, so a key that belongs to the kind being
 *  edited but has no control on screen writes an empty string over whatever was stored. It is
 *  silent, it only fires on the first edit, and it took `ref` (Q34, S3) and the evidence
 *  provenance fields with it. Narrowing the submission to the kind's own fields removes the trap
 *  rather than asking every future control to remember it.
 *
 *  Kept immediately beside buildItem so the two are edited together; fieldsAreComplete() below is
 *  the test that they still agree. */
export const FIELDS = {
  process: ['num', 'group', 'name', 'howToday', 'whoRuns', 'whoRunsId', 'pains', 'opens', 'speakTo', 'speakToIds', 'pillars', 'offerings', 'unitId', 'feeds', 'steps', 'x', 'y'],
  question: ['pillar', 'q', 'certainty', 'note', 'from', 'ref', 'subset', 'route', 'why', 'mergedFrom', 'processes', 'alsoPillars'],
  evidence: ['item', 'note', 'state', 'vstate', 'held', 'missing', 'whyItMatters', 'impactIfUnresolved', 'provenance', 'provenanceKind', 'link', 'processes', 'sessionIds'],
  session: ['name', 'person', 'only', 'method', 'priority', 'pillars', 'objectives', 'covers', 'ref', 'role', 'notHere', 'output', 'minutes', 'materials', 'context', 'opening', 'unitId', 'processes', 'personId', 'record', 'recordNote'],
  source: ['name', 'sourceType', 'gives', 'access', 'owner', 'ownerId', 'link', 'located', 'pillars'],
  kpi: ['name', 'scope', 'owner', 'ownerId', 'unitId', 'unit', 'current', 'target', 'direction', 'cadence', 'cadenceNote', 'definition', 'measuredBy', 'period', 'population', 'limitations', 'confidence', 'pillars', 'affectedBy'],
  hypothesis: ['ref', 'claim', 'group', 'grounds', 'confirms', 'kills', 'test', 'ifWrong', 'verdict', 'pillars', 'bearsOn', 'sessionIds'],
  competitor: ['name', 'evidence', 'overlaps', 'source', 'logo'],
  offering: ['ref', 'name', 'alias', 'state', 'what', 'who', 'note', 'processes'],
  unit: ['ref', 'name', 'unitType', 'parent', 'lead', 'leadId', 'headcount', 'does', 'note'],
  person: ['name', 'role', 'side', 'unitId', 'reportsTo', 'worksWith', 'email', 'accountEmail', 'note'],
  task: ['what', 'personId', 'processes', 'pillars', 'cadence', 'cadenceNote', 'hours', 'fate', 'why', 'note'],
  build: ['ref', 'name', 'state', 'stateWhy', 'what', 'forWhom', 'processes', 'touches', 'replaces',
    'needs', 'unknowns', 'opens', 'options', 'problems', 'blockers', 'roi', 'effort', 'impact',
    'foundational', 'dependsOn', 'demoKind', 'demoLink', 'demoNote', 'decisions', 'pillars', 'kpis', 'note',
    // Which opportunity this initiative serves. One opportunity may need several builds, which is
    // the half of the many-to-many that lives on this side of the link.
    'opportunityId'],
  opportunity: ['ref', 'name', 'statement', 'rootCause', 'desiredOutcome', 'fromFindings', 'pillars',
    'potentialValue', 'baselineRequired', 'kpis', 'state', 'note'],
  complexity: ['buildId', 'dimensions', 'interactions', 'preconditions', 'risks', 'uncertainty', 'state', 'note'],
};

/** Only the fields this kind owns, so a shared form cannot blank what it never showed. */
export function ownFields(kind, f) {
  const keep = FIELDS[kind];
  if (!keep) throw new Error(`Unknown kind "${kind}". One of: ${KINDS.join(', ')}`);
  const out = {};
  for (const k of keep) if (f[k] !== undefined) out[k] = f[k];
  return out;
}

/** How often, and the words behind it.
 *
 *  ⚠ THE NOTE WAS ONLY EVER CLEARED BY THE FORM, so an item could hold `cadence: 'monthly'` beside
 *  `cadenceNote: 'every third Tuesday'` and any renderer showing both stated a contradiction. A
 *  form is a courtesy to the typist, not the guard on the record: an MCP session wrote straight
 *  past it. The note belongs to "other"; it goes when "other" does, and it goes HERE so that every
 *  writer is held to it.
 *
 *  Doing it here rather than in the form also stops the form destroying data. A <select> fires
 *  change on every arrow-key step, so clearing on change meant tabbing to cadence and pressing the
 *  down arrow once wiped the client's own words with no undo and no stash. Now they survive in the
 *  form while somebody looks around, and are dropped only if the item is actually saved as
 *  something other than "other". */
function cadenceFields(f) {
  const [cadence, derived] = cadenceOf(f.cadence);
  const note = String(f.cadenceNote || '').trim() || derived;
  return { cadence, cadenceNote: cadence === 'other' ? note : '' };
}


/** EVERY FIELD THAT STORES ANOTHER ITEM'S ID, as [section, field, isArray].
 *
 *  ⚠ Ids are content hashes, so editing an item MINTS A NEW ONE and every field pointing at the old
 *  id goes stale. Each of these is also hard-validated when its own item is next edited, so a stale
 *  one does not merely lose a link: it makes the REFERRING item unwritable, and clearing the bad
 *  reference needs an edit the record refuses. Fixing a typo in a question could brick the session
 *  that covers it and the KPI it affects.
 *
 *  This started as a single fix to `question.from` and missed the other twelve. A table, because
 *  the failure mode is somebody adding a fourteenth and nobody noticing: `carryRefs` walks it, and
 *  a test walks a populated record looking for id-shaped values in fields this does not name. */
export const ID_FIELDS = [
  ['QUESTIONS', 'from', false],       // the question this one followed from
  ['SESSIONS', 'covers', true],       // the questions a session is set to answer
  ['SESSIONS', 'personId', false],
  ['KPIS', 'affectedBy', true],
  ['KPIS', 'unitId', false],
  ['HYPOTHESES', 'bearsOn', true],
  ['HYPOTHESES', 'sessionIds', true], ['EVIDENCE', 'sessionIds', true],
  ['UNITS', 'parent', false],
  ['UNITS', 'leadId', false],
  ['PEOPLE', 'reportsTo', false],
  ['PEOPLE', 'worksWith', true],
  ['PEOPLE', 'unitId', false],
  ['TASKS', 'personId', false],
  ['BUILDS', 'kpis', true],
  // ⚠ Found by the derived test, not by hand: any kind may carry a unitId, and two more did.
  ['PROCESSES', 'unitId', false],
  ['PROCESSES', 'whoRunsId', false],
  ['PROCESSES', 'speakToIds', true],
  ['SOURCES', 'ownerId', false],
  ['KPIS', 'ownerId', false],
  ['SESSIONS', 'unitId', false],
  ['BUILDS', 'dependsOn', true],   // the builds that must exist first
  ['BUILDS', 'opportunityId', false],       // the opportunity this initiative serves
  ['OPPORTUNITIES', 'fromFindings', true],  // the findings that point at this opportunity
  ['OPPORTUNITIES', 'kpis', true],          // the baselines that would show it moved
  ['COMPLEXITY', 'buildId', false],         // the initiative this assessment is of
];

/** Rewrite every reference to `oldId` so it points at `newId`, wherever it is held.
 *
 *  The link survives a re-mint because it is the SAME item: a reference is a structural fact about
 *  the investigation, not a decision about the item, which is exactly why it carries where
 *  publication status deliberately does not (rewording detaches Shared on purpose; it must not
 *  detach provenance). Returns the plan with only the sections that changed replaced. */
export function carryRefs(p, oldId, newId) {
  if (!oldId || !newId || oldId === newId) return p;
  // ⚠ NESTED IDS ARE NOT IN ID_FIELDS AND CANNOT BE. That table names top-level fields, and the
  // completeness test that guards it works by offering an id to a field and seeing whether the
  // record validates it: a reference buried inside an array of objects is invisible to both. So
  // renaming somebody would have left every step they do pointing at an id that no longer exists,
  // and each of those processes unwritable. Handled here by hand, and by a test that says so.
  p.PROCESSES = (p.PROCESSES || []).map((x) => {
    if (!(x.steps || []).some((st) => st.whoId === oldId)) return x;
    return { ...x, steps: x.steps.map((st) => (st.whoId === oldId ? { ...st, whoId: newId } : st)) };
  });
  const swapOne = (v) => (v === oldId ? newId : v);
  const swapMany = (v) => (Array.isArray(v) && v.includes(oldId)
    ? [...new Set(v.map(swapOne))] : v);
  for (const [section, field, many] of ID_FIELDS) {
    const fix = (x) => {
      const next = many ? swapMany(x[field]) : swapOne(x[field]);
      return next === x[field] ? x : { ...x, [field]: next };
    };
    if (section === 'QUESTIONS') {
      // grouped by pillar, so the walk is one level deeper
      p.QUESTIONS = (p.QUESTIONS || []).map((g) => {
        const items = (g.items || []).map(fix);
        return items.some((x, i) => x !== g.items[i]) ? { ...g, items } : g;
      });
    } else {
      const list = p[section] || [];
      const next = list.map(fix);
      if (next.some((x, i) => x !== list[i])) p[section] = next;
    }
  }
  return p;
}


/** How a proposal can be SHOWN before it exists. A proposal nobody can look at is an argument;
 *  something on screen that a client can press is a different conversation. */
export const DEMO_KINDS = ['none', 'sketch', 'screenshot', 'prototype', 'live'];
export const DEMO_KIND_MEANS = {
  none: 'Nothing to show yet.',
  sketch: 'A drawing or a wireframe.',
  screenshot: 'A still of something we built.',
  prototype: 'Something they can press.',
  live: 'The real thing, running.',
};

/** A score from 0 to 10, or null. Effort and impact place a proposal on the quadrant, and a missing
 *  one is left OFF the chart rather than defaulted to the middle: a dot at 5,5 is a claim, and
 *  "nobody has scored this" is not that claim. */
export function score(v, label) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${label} must be a number from 0 to 10.`);
  if (n < 0 || n > 10) throw new Error(`${label} must be between 0 and 10, not ${n}.`);
  return Math.round(n * 10) / 10;
}

/** A granular tie: not just "this changes data collection" but WHICH STEP inside it.
 *  Written "01:2" for step 2 of process 01, or "01" for the whole chain. */
export function touchList(v, label = 'touches') {
  return strList(v, label).map((x) => {
    const m = /^\s*(\d+)\s*(?::\s*(\d+))?\s*$/.exec(String(x));
    if (!m) throw new Error(`${label}: write a process number, or a process and a step inside it, like "01" or "01:2". Got "${x}".`);
    return m[2] ? `${m[1].padStart(2, '0')}:${Number(m[2])}` : m[1].padStart(2, '0');
  });
}

/** What was actually said about an idea, and when.
 *
 *  ⚠ A STATE WITH NO HISTORY LOSES THE ARGUMENT. "Cancelled" tells a reader the outcome and nothing
 *  about the reasoning, so the next person either re-runs the whole discussion or treats a decision
 *  made on old information as settled. Each entry is one thing somebody said, on a date, and the
 *  list is never rewritten: a later entry supersedes an earlier one in the reading, not on disk.
 *  Written "2026-08-27 :: their operations lead :: what was said". ⚠ NEVER a real name in an
 *  example: example text ships inside the JS bundle, and the leak gate caught exactly that. */
/** Complexity dimensions as [{dimension, level, driver, implication}].
 *
 *  ⚠ A LEVEL WITHOUT A DRIVER AND AN IMPLICATION IS NOISE. "Technology: Significant" tells a reader
 *  nothing they can act on; the assessment exists to answer WHY this is hard and WHAT WE DO
 *  DIFFERENTLY because of it. The classification is not the insight, so the record refuses one
 *  offered on its own. */
export function dimensionList(v, label = 'dimensions') {
  if (v === undefined || v === null || v === '') return [];
  // Text or objects, the same as decisionList: the drawer types `dimension :: level :: driver ::
  // implication` a line at a time, the MCP sends objects, and both land here.
  const rows = Array.isArray(v) ? v : String(v).split('\n');
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    let dimension, level, driver, implication;
    if (typeof row === 'string') {
      if (!row.trim()) continue;
      const parts = row.split('::').map((x) => x.trim());
      [dimension, level, driver] = parts;
      implication = parts.slice(3).join(' :: ').trim();
    } else if (row && typeof row === 'object') {
      ({ dimension, level, driver, implication } = row);
    } else continue;
    dimension = String(dimension || '').trim().toLowerCase();
    if (!COMPLEXITY_DIMENSIONS.includes(dimension)) {
      throw new Error(`${label}: "${dimension}" is not a complexity dimension. One of: ${COMPLEXITY_DIMENSIONS.join(', ')}`);
    }
    // ⚠ ONE ENTRY PER DIMENSION. Two rows for the same dimension is not a richer assessment, it is
    // two answers to one question, and nothing downstream could say which one drives delivery.
    if (seen.has(dimension)) throw new Error(`${label}: "${dimension}" is assessed twice. One entry per dimension.`);
    seen.add(dimension);
    level = oneOf(String(level || 'standard').trim().toLowerCase(), COMPLEXITY_LEVELS, `${label} level for "${dimension}"`);
    driver = String(driver || '').trim();
    implication = String(implication || '').trim();
    if (!driver) throw new Error(`${label}: "${dimension}" needs its principal driver. A level with no reason behind it is not an assessment.`);
    if (!implication) throw new Error(`${label}: "${dimension}" needs its delivery implication. What must be done differently because this is ${level}?`);
    out.push({ dimension, level, driver, implication });
  }
  return out;
}

/** The overall complexity perspective. ⚠ NEVER AVERAGED, AND THERE IS NO SCORE.
 *
 *  A single Significant factor carrying regulatory, operational or organisational consequence can
 *  determine the whole implementation approach even where every other dimension is Standard.
 *  Averaging is exactly how that gets buried: nine benign dimensions wash out the one that decides
 *  the delivery. So this returns the DRIVING dimensions and the highest level reached, and no
 *  caller is given a number it could rank engagements by. */
export function complexityPerspective(item) {
  const dims = (item && item.dimensions) || [];
  if (!dims.length) return { level: null, driving: [], counts: {}, assessed: 0 };
  const counts = {};
  for (const d of dims) counts[d.level] = (counts[d.level] || 0) + 1;
  const level = COMPLEXITY_LEVELS.slice().reverse().find((l) => counts[l]) || null;
  return { level, driving: dims.filter((d) => d.level === level), counts, assessed: dims.length };
}

export function decisionList(v, label = 'decisions') {
  if (v === undefined || v === null || v === '') return [];
  const rows = Array.isArray(v) ? v : String(v).split('\n');
  const out = [];
  for (const row of rows) {
    if (typeof row === 'string') {
      if (!row.trim()) continue;
      const [when, who, ...rest] = row.split('::').map((x) => x.trim());
      const said = rest.join(' :: ').trim();
      // A bare line is still worth keeping: somebody typing fast should not lose the sentence.
      if (!said && !who) { out.push({ when: '', who: '', said: when }); continue; }
      if (!said) { out.push({ when: '', who: when, said: who }); continue; }
      out.push({ when, who, said });
    } else if (row && typeof row === 'object') {
      const said = String(row.said || '').trim();
      if (!said) continue;
      out.push({ when: String(row.when || '').trim(), who: String(row.who || '').trim(), said });
    }
  }
  if (out.length > 60) throw new Error(`${label}: more than 60 entries. Keep the ones that changed the decision.`);
  return out;
}

export function buildItem(kind, f, id) {
  if (!id) throw new Error('buildItem needs an id (see identityParts).');
  if (kind === 'process') {
    if (!f.name || !f.howToday) throw new Error('A process needs a name and how it works today.');
    return {
      id,
      num: normNum(f.num),
      group: String(f.group || 'Delivery').trim(),
      name: String(f.name).trim(),
      howToday: String(f.howToday).trim(),
      // ⚠ THE NAME STAYS. A link is added BESIDE the words somebody typed, never instead of them:
      // replacing free text with a picker is how a name that matches nobody in the record gets
      // silently blanked, which has happened here three times. The text is what was said; the id is
      // what the record can follow.
      whoRuns: String(f.whoRuns || '').trim(),
      whoRunsId: f.whoRunsId ? String(f.whoRunsId).trim() : null,
      pains: strList(f.pains, 'pains'),
      opens: strList(f.opens, 'opens'),
      speakTo: strList(f.speakTo, 'speakTo'),
      speakToIds: strList(f.speakToIds, 'speakToIds'),
      pillars: checkPillars(strList(f.pillars, 'pillars'), 'pillars'),
      // Which of the client's own service lines this process serves. The Investigation Plan writes
      // it onto most processes; a fixed object literal that does not declare it deletes it on the
      // first edit from either writer. Same bug class as the evidence provenance fields.
      offerings: strList(f.offerings, 'offerings'),
      unitId: f.unitId ? String(f.unitId).trim() : null,   // which part of the business runs it
      // What this process HANDS TO next, by process number. The record had no process-to-process
      // edge at all, so a flow drawn from it would assert a sequence nobody recorded: the numbers
      // imply an order to a reader, they do not state one.
      feeds: strList(f.feeds, 'feeds'),
      // What actually happens inside this box. A chain of nine processes says nothing about where
      // the work goes wrong; the handoffs INSIDE a process are usually where it does.
      steps: stepList(f.steps),
      // WHERE THE BOX SITS ON THE DIAGRAM, and nothing more. This is layout, not a claim: moving a
      // process left of another does NOT say it happens first, and the record still draws an arrow
      // only where a handoff was actually recorded in `feeds`. Null means "place it automatically",
      // which is what every process does until somebody moves it.
      x: coord(f.x), y: coord(f.y),
    };
  }
  if (kind === 'question') {
    if (!f.pillar || !f.q) throw new Error('A question needs a pillar and the question itself.');
    checkPillars([f.pillar], 'pillar');
    const certainty = oneOf(f.certainty || 'unknown', CERTAINTY_IDS, 'certainty');
    const note = f.note ? String(f.note).trim() : null;
    // Known and Indicated are claims that something is established. A claim with nothing behind it
    // is how a plan quietly stops being evidence-led, so the note is required with them (4.2).
    if (certainty !== 'unknown' && !note) {
      throw new Error(`A question marked ${certainty} must say what is already established. Add a note, or set it to Unknown.`);
    }
    // A follow-up names the question it came out of. One-way in the data, two-way on the page, so a
    // question can show what it led to without a second list to keep in step.
    return {
      id, q: String(f.q).trim(), certainty, note,
      from: f.from ? String(f.from).trim() : null,
      ref: String(f.ref || '').trim(),               // Q34 — what the plan and the client call it
      subset: String(f.subset || '').trim(),         // the area within the pillar
      // How this gets answered. Most of a good plan is answered WITHOUT anyone's time, and naming
      // the route is what lets the record say "38 of 49 need nobody" instead of assuming a session.
      route: f.route ? oneOf(f.route, ROUTES, 'route') : null,
      why: String(f.why || '').trim(),               // why it matters, so it can be dropped honestly
      mergedFrom: strList(f.mergedFrom, 'mergedFrom'),
      // Which part of the business this question is actually about. A question with no process is
      // a question about the company in general, and those are the ones that go unanswered.
      processes: strList(f.processes, 'processes'),
      // ⚠ THE PRIMARY PILLAR STAYS THE HOME. It is half the question's identity and the key the
      // record groups by, so a question that ALSO belongs elsewhere (John, 12 Sep: many do) keeps
      // its home and carries the others here. Every view that filters by pillar reads both.
      alsoPillars: checkPillars(strList(f.alsoPillars, 'alsoPillars'), 'alsoPillars')
        .filter((p) => p !== String(f.pillar).trim()),
    };
  }
  if (kind === 'evidence') {
    if (!f.item) throw new Error('An evidence item needs a name.');
    // held / missing / provenance are what make this an evidence RECORD rather than a shopping list:
    // 4.10 asks for provenance and validation status, and "we were told X in the August session, and
    // have seen none of it" is a different fact from "we have it". These arrive from the Investigation
    // Plan and were being silently dropped on every edit because buildItem did not know them.
    return {
      id, item: String(f.item).trim(), note: String(f.note || '').trim(),
      state: oneOf(f.state || 'missing', EVIDENCE_STATE_IDS, 'state'),
      // The second axis. Held but unassessed is `captured`; nothing in hand carries none at all,
      // because a validation status on evidence nobody has provided is a claim about thin air.
      vstate: (() => {
        const acquired = oneOf(f.state || 'missing', EVIDENCE_STATE_IDS, 'state');
        if (!HOLDS_SOMETHING.has(acquired)) return null;
        return oneOf(f.vstate || 'captured', EVIDENCE_VSTATE_IDS, 'vstate');
      })(),
      held: String(f.held || '').trim(),                    // what we actually hold
      missing: String(f.missing || '').trim(),              // what is still outstanding
      // The sittings this will be asked for in. An outstanding document with no session naming
      // it is chased by nobody; this is how the ask reaches a room (John, 12 Sep).
      sessionIds: strList(f.sessionIds, 'sessionIds'),
      // ⚠ WHAT MAKES A GAP A GAP. An outstanding item with no stated consequence is a shopping list
      // entry: nobody can tell whether chasing it matters more than the next thing. These are the
      // two fields Ben's Evidence Gap adds, kept ON the evidence record rather than in a record of
      // their own so the thing keeps ONE identity as it moves from outstanding to held. Two records
      // for one document is how provenance gets lost at exactly the moment it arrives.
      whyItMatters: String(f.whyItMatters || '').trim(),
      impactIfUnresolved: String(f.impactIfUnresolved || '').trim(),
      provenance: String(f.provenance || '').trim(),        // how we know what we know
      // "We were told" and "we measured it" are different claims, and the difference is the whole
      // point of an evidence record, so this is a vocabulary rather than a sentence.
      provenanceKind: f.provenanceKind ? provenanceKindOf(f.provenanceKind)[0] : null,
      link: link(f.link, 'evidence link'),          // where the document itself is, once we hold it
      processes: strList(f.processes, 'processes'),
    };
  }
  if (kind === 'session') {
    if (!f.person) throw new Error('A session needs a person, by name or by role.');
    if (f.method && !SESSION_METHODS.includes(f.method)) {
      throw new Error(`method must be one of: ${SESSION_METHODS.join(', ')}.`);
    }
    if (f.priority && !SESSION_PRIORITIES.includes(f.priority)) {
      throw new Error(`priority must be one of: ${SESSION_PRIORITIES.join(', ')}.`);
    }
    const minutes = f.minutes === '' || f.minutes == null ? null : Number(f.minutes);
    if (minutes !== null && (!Number.isFinite(minutes) || minutes <= 0 || minutes > 480)) {
      throw new Error('Estimated length must be a number of minutes between 1 and 480.');
    }
    return {
      // What the session exists to establish, which is its NAME (John, 10 Sep: a session is not an
      // individual; several people can be in the room, and the room is there for a purpose). The
      // person field stays required and now carries the participants, in words.
      id, name: String(f.name || '').trim(),
      person: String(f.person).trim(), only: String(f.only || '').trim(),
      method: f.method || '',                        // how it is run, from SESSION_METHODS
      priority: f.priority || '',                    // from SESSION_PRIORITIES
      pillars: checkPillars(strList(f.pillars, 'pillars'), 'pillars'),
      // A session is run, not just listed. These are what a practitioner needs in front of them.
      objectives: strList(f.objectives, 'objectives'),
      covers: strList(f.covers, 'covers'),          // question ids this session is meant to answer
      ref: String(f.ref || '').trim(),              // S3 — what the plan calls it
      role: String(f.role || '').trim(),            // why this person and not another
      // What is deliberately NOT asked here, because it is answered elsewhere. This is how the plan
      // stops the same question being put to four people and wasting three of them.
      notHere: strList(f.notHere, 'notHere'),
      output: String(f.output || '').trim(),
      minutes,
      materials: strList(f.materials, 'materials'),
      context: String(f.context || '').trim(),      // who they are, and how to approach them
      opening: String(f.opening || '').trim(),      // how to start, in the practitioner's own words
      // Where the record of this session lives once it has been run: the Notion page, the
      // transcript, the recording. A finding traced to "the session with X" is only checkable if
      // somebody can open the session.
      unitId: f.unitId ? String(f.unitId).trim() : null,   // which part of the business they sit in
      processes: strList(f.processes, 'processes'),   // which processes this session is walking
      personId: f.personId ? String(f.personId).trim() : null,   // WHO, as a person in the record
      record: link(f.record, 'session record'),
      recordNote: String(f.recordNote || '').trim(),
    };
  }

  if (kind === 'source') {
    if (!f.name) throw new Error('A source needs a name.');
    return {
      id, name: String(f.name).trim(),
      sourceType: oneOf(f.sourceType || 'person', SOURCE_TYPES, 'sourceType'),
      gives: String(f.gives || '').trim(),          // what this source can tell us
      access: String(f.access || '').trim(),        // how we reach it, and what that needs
      // ⚠ The name stays; the link is added beside it. See whoRunsId.
      owner: String(f.owner || '').trim(),          // who controls access
      ownerId: f.ownerId ? String(f.ownerId).trim() : null,
      // WHERE IT ACTUALLY IS. A record that cites "the August transcript" and cannot open it is
      // asking a practitioner to go and find it again every time. One of these two is enough:
      // a link when the thing has a web address, a location when it does not.
      link: link(f.link, 'source link'),
      located: String(f.located || '').trim(),
      pillars: checkPillars(strList(f.pillars, 'pillars'), 'pillars'),
    };
  }
  if (kind === 'kpi') {
    if (!f.name) throw new Error('A KPI needs a name.');
    // Everything a KPI is measured by, plus what it is CONNECTED to. The links are the point: a
    // number on its own is a dashboard, a number wired to the processes and questions that move it
    // is a model of how the business actually works.
    const num = (v) => (v === '' || v === undefined || v === null ? null : Number(v));
    for (const k of ['current', 'target']) {
      if (num(f[k]) !== null && !Number.isFinite(num(f[k]))) throw new Error(`${k} must be a number.`);
    }
    return {
      id, name: String(f.name).trim(),
      scope: oneOf(f.scope || 'company', KPI_SCOPES, 'scope'),
      owner: String(f.owner || '').trim(),          // whose number it is
      ownerId: f.ownerId ? String(f.ownerId).trim() : null,
      unit: String(f.unit || '').trim(),
      current: num(f.current), target: num(f.target),
      direction: oneOf(f.direction || 'up', KPI_DIRECTIONS, 'direction'),
      // Categorical, because "how often" is the axis you filter and group by, and free text makes
      // "daily", "Daily" and "every day" three different answers to one question. What was actually
      // typed is kept in cadenceNote rather than thrown away.
      ...cadenceFields(f),
      definition: String(f.definition || '').trim(),// how it is calculated, in their terms
      measuredBy: String(f.measuredBy || '').trim(),// where the number comes from
      // ⚠ THE MEASUREMENT DEFINITION, which is what makes a number reproducible rather than merely
      // recorded. Without the period and the population, a baseline and a later measurement that
      // look like the same measure can have been calculated on different months and different
      // caseloads, and the difference between them gets reported as an improvement.
      period: String(f.period || '').trim(),        // what stretch of time the current value covers
      population: String(f.population || '').trim(),// what is counted, and what is deliberately not
      // Seasonality, an exceptional event, a temporary operating condition, incomplete data. Kept
      // visible so a limited number stays useful instead of being quietly treated as a solid one.
      limitations: String(f.limitations || '').trim(),
      confidence: oneOf(f.confidence || 'moderate', MEASURE_CONFIDENCE, 'confidence'),
      // WHOSE number, as a link rather than a name. `owner` is the person; this is the team, and it
      // is what makes a KPI something you can group, roll up and track by part of the business.
      unitId: f.unitId ? String(f.unitId).trim() : null,
      pillars: checkPillars(strList(f.pillars, 'pillars'), 'pillars'),
      affectedBy: strList(f.affectedBy, 'affectedBy'), // ids of processes, questions, other KPIs
    };
  }
  if (kind === 'hypothesis') {
    if (!f.claim) throw new Error('A hypothesis needs a claim.');
    // `kills` is the load-bearing field on an OPEN hypothesis: a claim that cannot say what would
    // disprove it is an opinion, and "assumptions may begin an investigation, never conclude it" is
    // exactly that distinction. A hypothesis already confirmed has been tested, so it is exempt —
    // demanding a falsifier for something settled would refuse the record's own history.
    const verdict = oneOf(f.verdict || 'open', HYPOTHESIS_VERDICTS, 'verdict');
    if (verdict === 'open' && !f.kills) {
      throw new Error('An open hypothesis needs to say what would KILL it. A claim with no falsifier is an opinion.');
    }
    return {
      id,
      ref: String(f.ref || '').trim(),               // H01… the label the whole plan refers to it by
      claim: String(f.claim).trim(),
      group: String(f.group || '').trim(),           // Innovation / Culture / Operations / Market
      grounds: String(f.grounds || '').trim(),       // what we hold that makes us think so
      confirms: String(f.confirms || '').trim(),
      kills: String(f.kills).trim(),
      test: String(f.test || '').trim(),             // how we actually test it
      ifWrong: String(f.ifWrong || '').trim(),       // what changes in the plan if it is false
      sessionIds: strList(f.sessionIds, 'sessionIds'),   // the sittings that will run the test
      verdict,
      pillars: checkPillars(strList(f.pillars, 'pillars'), 'pillars'),
      bearsOn: strList(f.bearsOn, 'bearsOn'),        // ids of what it would change
    };
  }
  if (kind === 'competitor') {
    if (!f.name) throw new Error('A competitor needs a name.');
    return {
      id, name: String(f.name).trim(),
      evidence: String(f.evidence || '').trim(),     // what we actually found, not what we assume
      overlaps: String(f.overlaps || '').trim(),     // where they meet the client
      source: String(f.source || '').trim(),         // where we found it, so it can be checked
      // Their mark, as a URL and never a bundled file: a competitor logo checked into the build
      // would put client-adjacent research into the public bundle, which the leak gate exists to
      // refuse. An empty string renders as a lettermark, which is honest rather than broken.
      logo: safeLink(f.logo, 'logo'),
    };
  }
  if (kind === 'task') {
    if (!f.what) throw new Error('A task needs to say what it is.');
    const hours = f.hours === '' || f.hours == null ? null : Number(f.hours);
    if (hours !== null && (!Number.isFinite(hours) || hours < 0)) {
      throw new Error('Hours must be a number of hours a week, or left blank.');
    }
    return {
      id,
      what: String(f.what).trim(),                     // what they actually do, in their words
      personId: f.personId ? String(f.personId).trim() : null,
      processes: strList(f.processes, 'processes'),    // which process numbers it sits inside
      pillars: checkPillars(strList(f.pillars, 'pillars'), 'pillars'),
      // The same cadence vocabulary a KPI uses, so effort can be compared across people.
      ...cadenceFields(f),
      hours,
      // THE TARGET STATE, and the reason this kind exists at all.
      fate: oneOf(f.fate || 'not decided', TASK_FATE, 'fate'),
      why: String(f.why || '').trim(),                 // why that fate, so it can be argued with
      note: String(f.note || '').trim(),
    };
  }
  if (kind === 'person') {
    if (!f.name) throw new Error('A person needs a name.');
    return {
      id,
      name: String(f.name).trim(),
      role: String(f.role || '').trim(),               // their job, in the company's own words
      side: oneOf(f.side || 'client', PERSON_SIDES, 'side'),
      unitId: f.unitId ? String(f.unitId).trim() : null,   // which part of the business they sit in
      // The people chart, which is not the same shape as the unit chart: somebody can sit in one
      // team and report to somebody in another, and that gap is often the finding.
      reportsTo: f.reportsTo ? String(f.reportsTo).trim() : null,
      worksWith: strList(f.worksWith, 'worksWith'),    // the dotted lines
      email: String(f.email || '').trim(),
      // The email they would SIGN IN with. A person exists in this record whether or not they have
      // an account: most of the people we interview never will. This is a fact about them, not a
      // grant of access, and nothing here gives anybody a login.
      accountEmail: String(f.accountEmail || '').trim(),
      note: String(f.note || '').trim(),
    };
  }
  if (kind === 'unit') {
    if (!f.name) throw new Error('A unit needs a name.');
    const headcount = f.headcount === '' || f.headcount == null ? null : Number(f.headcount);
    if (headcount !== null && (!Number.isFinite(headcount) || headcount < 0)) {
      throw new Error('Headcount must be a number of people, or left blank.');
    }
    return {
      id,
      ref: String(f.ref || '').trim(),                  // what the org calls it, e.g. OPS
      name: String(f.name).trim(),
      unitType: oneOf(f.unitType || 'team', UNIT_TYPES, 'unitType'),
      // The id of the unit above it. This is the one field that makes this a CHART rather than a
      // list, and it is what lets a number be assigned to a team and then rolled up.
      parent: f.parent ? String(f.parent).trim() : null,
      lead: String(f.lead || '').trim(),                // who runs it, when they are not in PEOPLE yet
      leadId: f.leadId ? String(f.leadId).trim() : null,   // who runs it, as a person in the record
      headcount,
      does: String(f.does || '').trim(),                // what this part of the business does
      note: String(f.note || '').trim(),
    };
  }
  if (kind === 'offering') {
    if (!f.name) throw new Error('An offering needs a name.');
    return {
      id,
      ref: String(f.ref || '').trim(),                 // what the plan calls it, e.g. 01
      name: String(f.name).trim(),
      alias: String(f.alias || '').trim(),             // what the CLIENT calls it, where that differs
      state: oneOf(f.state || 'live', OFFERING_STATES, 'state'),
      what: String(f.what || '').trim(),               // what the client actually delivers
      who: String(f.who || '').trim(),                 // who buys it
      note: String(f.note || '').trim(),
      // The processes that deliver it. This is what makes a workflow belong to an offering rather
      // than to the business, and what lets the record say an offering has not been walked at all.
      processes: strList(f.processes, 'processes'),
    };
  }
  if (kind === 'build') {
    if (!f.name) throw new Error('A proposed build needs a name.');
    return {
      id,
      ref: String(f.ref || '').trim(),                  // what the GITA calls it
      name: String(f.name).trim(),
      state: (() => {
        const st = oneOf(f.state || 'proposed', BUILD_STATES, 'state');
        // ⚠ THE REASON IS THE POINT. A proposal that stops with nothing recorded cannot be
        // revisited: nobody can tell later whether it failed on cost, on capability or on somebody's
        // preference, so it is either re-argued from scratch or stays dead for a reason that has
        // since changed. Ghana's Twi speech models are exactly that case.
        if (BUILD_STATES_NEEDING_WHY.includes(st) && !String(f.stateWhy || '').trim()) {
          throw new Error(`"${st}" needs a reason. Say why in stateWhy, so somebody can revisit it later knowing what the decision actually rested on.`);
        }
        return st;
      })(),
      what: String(f.what || '').trim(),                // what it does, in a sentence
      forWhom: String(f.forWhom || '').trim(),          // who in their business would use it
      // ⚠ THE LINK. A proposal that names no process is a proposal about nothing: the whole point
      // is that it changes how some existing chain runs, and the record has to be able to say which.
      processes: strList(f.processes, 'processes'),
      replaces: String(f.replaces || '').trim(),        // the manual step, tool or handoff it removes
      needs: strList(f.needs, 'needs'),                 // what must be true for it to work here
      // What the DEEP DIVE is for, on this item. An unknown with nothing investigating it is a gap.
      unknowns: strList(f.unknowns, 'unknowns'),
      opens: strList(f.opens, 'opens'),                 // questions it raises
      pillars: checkPillars(strList(f.pillars, 'pillars'), 'pillars'),
      kpis: strList(f.kpis, 'kpis'),                    // what it should move
      // The opportunity this initiative serves. Several builds may serve one opportunity, and the
      // opportunity in turn gathers several findings, which is the whole chain in two links.
      opportunityId: f.opportunityId ? String(f.opportunityId).trim() : null,
      note: String(f.note || '').trim(),

      // ── what it would take to decide ────────────────────────────────────────────────────────
      // ⚠ A PROPOSAL IS NOT ONE THING. "A client portal" could be a website, an app, or a report
      // that lands in an inbox, and which one it is changes the cost, the risk and who can use it.
      // The Deep Dive is how that gets settled, so the record has to hold the options unresolved
      // rather than quietly picking one.
      options: strList(f.options, 'options'),
      problems: strList(f.problems, 'problems'),        // what could go wrong if we do it
      blockers: strList(f.blockers, 'blockers'),        // what would stop it happening at all
      roi: String(f.roi || '').trim(),                  // the return, in the client's own terms

      // ── where it sits ───────────────────────────────────────────────────────────────────────
      effort: score(f.effort, 'effort'),
      impact: score(f.impact, 'impact'),
      // ⚠ FOUNDATIONAL IS NOT A PRIORITY, IT IS A DEPENDENCY. A client portal is foundational
      // because other things cannot exist without it, which is a different claim from it being
      // the most valuable thing, and the two get confused the moment they share a word.
      foundational: !!f.foundational,
      dependsOn: strList(f.dependsOn, 'dependsOn'),     // build ids that must exist first
      // The granular tie: which STEP inside a process this changes, not just which process.
      touches: touchList(f.touches, 'touches'),

      // ── what can be shown ───────────────────────────────────────────────────────────────────
      demoKind: oneOf(f.demoKind || 'none', DEMO_KINDS, 'demoKind'),
      demoLink: safeLink(f.demoLink, 'demoLink'),
      demoNote: String(f.demoNote || '').trim(),

      // ── how it got to where it is ───────────────────────────────────────────────────────────
      stateWhy: String(f.stateWhy || '').trim(),
      decisions: decisionList(f.decisions, 'decisions'),
    };
  }
  if (kind === 'opportunity') {
    if (!f.name) throw new Error('An opportunity needs a name.');
    if (!f.desiredOutcome) {
      throw new Error('An opportunity needs a desired outcome. Without one it is an observation, not an opportunity.');
    }
    return {
      id,
      ref: String(f.ref || '').trim(),
      name: String(f.name).trim(),
      // Where meaningful change may create value. Kept apart from the design, which is what we
      // propose to DO about it: an opportunity that already names its solution has skipped a layer.
      statement: String(f.statement || '').trim(),
      rootCause: String(f.rootCause || '').trim(),
      desiredOutcome: String(f.desiredOutcome).trim(),
      // The findings that point here. SEVERAL findings, ONE opportunity: this is the half of the
      // many-to-many that a sentence written on each finding could never express.
      fromFindings: strList(f.fromFindings, 'fromFindings'),
      pillars: checkPillars(strList(f.pillars, 'pillars'), 'pillars'),
      potentialValue: String(f.potentialValue || '').trim(),
      // Whether the outcome needs a measurable starting position before anyone can claim it moved.
      baselineRequired: !!f.baselineRequired,
      kpis: strList(f.kpis, 'kpis'),                    // the baselines that would show it
      state: oneOf(f.state || 'draft', OPPORTUNITY_STATES, 'state'),
      note: String(f.note || '').trim(),
    };
  }
  if (kind === 'complexity') {
    if (!f.buildId) throw new Error('A complexity assessment must be attached to an initiative.');
    return {
      id,
      buildId: String(f.buildId).trim(),
      dimensions: dimensionList(f.dimensions, 'dimensions'),
      // Where several factors together are worse than any of them alone. Legacy technology plus poor
      // data plus multiple integrations plus a regulated environment is not the sum of four
      // problems, and this is where that is said rather than inferred.
      interactions: strList(f.interactions, 'interactions'),
      // ⚠ COMPLEXITY IS NOT FIXED. Where resolving a dependency FIRST would make implementation
      // materially less complex, that is a precondition, and it drives sequencing rather than
      // merely warning about cost. This is the field that turns an assessment into a roadmap input.
      preconditions: strList(f.preconditions, 'preconditions'),
      risks: strList(f.risks, 'risks'),
      uncertainty: String(f.uncertainty || '').trim(),   // what is still not known, kept visible
      state: oneOf(f.state || 'initial', COMPLEXITY_STATES, 'state'),
      note: String(f.note || '').trim(),
    };
  }
  throw new Error(`Unknown kind "${kind}". One of: ${KINDS.join(', ')}`);
}

// ── reading a plan ────────────────────────────────────────────────────────────────────────────
/** The CEO's own statement of where the business is going, and what we do with it.
 *
 *  `words` is theirs and is never tidied. `target` is ours and has to BEAT theirs, which is the
 *  whole reason for capturing the first: without a stated minimum, "the target state must exceed
 *  it" is not something anybody can check. */
export function northStar(f = {}) {
  const words = String(f.words || '').trim();
  const target = String(f.target || '').trim();
  const clarity = oneOf(f.clarity || 'unclear', CLARITY, 'clarity');
  // The target has to be an improvement on something. Setting one with no stated vision to beat is
  // the failure this whole section exists to prevent.
  if (target && !words) {
    throw new Error('A target state has to exceed something. Record what they actually said first, in their own words.');
  }
  return {
    words,
    saidBy: String(f.saidBy || '').trim(),          // whose words these are
    saidOn: String(f.saidOn || '').trim(),          // when they said them
    sourceId: f.sourceId ? String(f.sourceId).trim() : null,   // where it can be heard or read
    clarity,
    // What is still not clear, which is the thing to put to them. An unclear vision with nothing
    // written here is a note that says "we noticed and did not ask".
    gap: String(f.gap || '').trim(),
    ambition: oneOf(f.ambition || 'not yet tested', AMBITION_FIT, 'ambition'),
    target,
    note: String(f.note || '').trim(),
  };
}

export function normalisePlan(plan) {
  const p = { ...(plan || {}) };
  for (const k of SECTIONS) if (!Array.isArray(p[k])) p[k] = [];
  if (!p.PILLAR_ORDER.length) p.PILLAR_ORDER = [...PILLARS];
  p.engagement = { ...(p.engagement || {}) };
  // NOT in SECTIONS, deliberately: that list is the ARRAY sections and everything in it is coerced
  // to []. There is one North Star per record, so it is an object and is normalised on its own.
  p.NORTH_STAR = p.NORTH_STAR ? northStar(p.NORTH_STAR) : null;
  return p;
}

export function allIds(plan) {
  return [
    ...(plan.PROCESSES || []).map((p) => p.id),
    ...(plan.QUESTIONS || []).flatMap((q) => (q.items || []).map((i) => i.id)),
    ...(plan.EVIDENCE || []).map((e) => e.id),
    ...(plan.SESSIONS || []).map((s) => s.id),
    ...(plan.KPIS || []).map((k) => k.id),
    ...(plan.HYPOTHESES || []).map((h) => h.id),
    ...(plan.COMPETITORS || []).map((c) => c.id),
    ...(plan.OFFERINGS || []).map((o) => o.id),
    ...(plan.SOURCES || []).map((s) => s.id),
    ...(plan.UNITS || []).map((u) => u.id),
    ...(plan.PEOPLE || []).map((n) => n.id),
    ...(plan.TASKS || []).map((t) => t.id),
    ...(plan.BUILDS || []).map((b) => b.id),
    ...(plan.OPPORTUNITIES || []).map((o) => o.id),
    ...(plan.COMPLEXITY || []).map((x) => x.id),
  ].filter(Boolean);
}

export function findItem(plan, id) {
  for (const p of plan.PROCESSES || []) if (p.id === id) return { kind: 'process', item: p };
  for (const e of plan.EVIDENCE || []) if (e.id === id) return { kind: 'evidence', item: e };
  for (const s of plan.SESSIONS || []) if (s.id === id) return { kind: 'session', item: s };
  for (const k of plan.KPIS || []) if (k.id === id) return { kind: 'kpi', item: k };
  for (const h of plan.HYPOTHESES || []) if (h.id === id) return { kind: 'hypothesis', item: h };
  for (const c of plan.COMPETITORS || []) if (c.id === id) return { kind: 'competitor', item: c };
  for (const o of plan.OFFERINGS || []) if (o.id === id) return { kind: 'offering', item: o };
  for (const r of plan.SOURCES || []) if (r.id === id) return { kind: 'source', item: r };
  for (const u of plan.UNITS || []) if (u.id === id) return { kind: 'unit', item: u };
  for (const n of plan.PEOPLE || []) if (n.id === id) return { kind: 'person', item: n };
  for (const t of plan.TASKS || []) if (t.id === id) return { kind: 'task', item: t };
  for (const b of plan.BUILDS || []) if (b.id === id) return { kind: 'build', item: b };
  for (const o of plan.OPPORTUNITIES || []) if (o.id === id) return { kind: 'opportunity', item: o };
  for (const x of plan.COMPLEXITY || []) if (x.id === id) return { kind: 'complexity', item: x };
  for (const g of plan.QUESTIONS || []) for (const q of g.items || []) {
    if (q.id === id) return { kind: 'question', item: q, pillar: g.pillar };
  }
  return null;
}

export function labelOf(plan, id) {
  const f = findItem(plan, id);
  if (!f) return id;
  return f.kind === 'process' ? `${f.item.num} ${f.item.name}`
    : f.kind === 'question' ? f.item.q
    : f.kind === 'evidence' ? f.item.item
    : f.kind === 'source' ? f.item.name
    : f.kind === 'hypothesis' ? `${f.item.ref} ${f.item.claim}`.trim()
    : f.kind === 'competitor' ? f.item.name
    : f.kind === 'offering' ? f.item.name
    : f.kind === 'kpi' ? f.item.name
    : f.kind === 'unit' ? `${f.item.ref} ${f.item.name}`.trim()
    : f.kind === 'person' ? f.item.name
    : f.kind === 'task' ? f.item.what
    : f.kind === 'build' ? `${f.item.ref} ${f.item.name}`.trim()
    : f.kind === 'opportunity' ? `${f.item.ref} ${f.item.name}`.trim()
    : f.kind === 'complexity' ? `Complexity of ${label(plan, f.item.buildId)}`
    // The fall-through is a SESSION (its label is the person). Anything else reaching here would
    // render as undefined, which is how a new kind ends up logged as a bare id.
    : (f.item.name || f.item.person);
}

// ── the writer ────────────────────────────────────────────────────────────────────────────────
/** Apply one operation and return a NEW plan. Pure and total: it throws rather than half-writing,
 *  so a caller can validate a change before sending it and a server can re-check it on arrival.
 *  op: { type: 'set_engagement' | 'add' | 'edit' | 'remove', ... } */
export function applyOp(plan, op, id = null) {
  const p = normalisePlan(plan);
  // ⚠ COPY EVERY LIST, NOT THE FIVE SOMEBODY REMEMBERED.
  // normalisePlan is a shallow copy, and the `add` arms push straight into whatever array they find.
  // With only five sections copied, adding a KPI, hypothesis, competitor, offering, unit, person,
  // task or build MUTATED THE CALLER'S PLAN — including the object React is rendering, because
  // applyRecordOp runs applyOp locally as a fail-fast pre-check before the round trip.
  // So a failed add left a phantom in the live plan, and the retry was refused with
  // "That already exists in this record" — an error that was not true, and that no amount of
  // correcting the form could clear short of reloading the page.
  for (const k of SECTIONS) if (Array.isArray(p[k])) p[k] = [...p[k]];
  p.QUESTIONS = p.QUESTIONS.map((g) => ({ ...g, items: [...(g.items || [])] }));

  if (op.type === 'set_engagement') {
    const f = op.fields || {};
    const unknown = Object.keys(f).filter((k) => !DESCRIPTOR.includes(k) && k !== 'outcomes' && k !== 'northStar');
    if (unknown.length) throw new Error(`Not descriptor fields: ${unknown.join(', ')}. Allowed: ${DESCRIPTOR.join(', ')}, outcomes, northStar`);
    for (const k of DESCRIPTOR) if (f[k] !== undefined) p.engagement[k] = String(f[k]).trim();
    // ⚠ Scheme-checked at WRITE time like every other stored link: this one is rendered as an <img>
    // src, so an unchecked value is a way to point the portal at anything at all.
    if (f.logo !== undefined) p.engagement.logo = safeLink(f.logo, 'logo');
    if (f.outcomes !== undefined) p.OUTCOMES = strList(f.outcomes, 'outcomes');
    if (f.northStar !== undefined) p.NORTH_STAR = northStar(f.northStar);
    // Blanking one of these writes a record that can never be read again. Refuse it here, where both
    // the browser and the server run the same check, rather than discovering it on the next load.
    const emptied = ENGAGEMENT_REQUIRED.filter((k) => k !== 'slug' && !p.engagement[k]);
    if (emptied.length) {
      throw new Error(`These cannot be left empty: ${emptied.join(', ')}. The record could not be opened again without them.`);
    }
    return p;
  }

  // An evidence item pointing at a process number that does not exist saved clean and then rendered
  // as a bare number with nothing behind it. buildItem cannot see the record, so the cross-reference
  // is checked here, where the whole plan is in hand.
  // A KPI's links must point at things that exist, or the graph quietly fills with dead ends.
  const checkLinks = (item, kind) => {
    if (kind !== 'kpi' || !item.affectedBy.length) return item;
    const known = new Set(allIds(p));
    const stray = item.affectedBy.filter((x) => !known.has(x));
    if (stray.length) throw new Error(`Nothing in this record with id ${stray.join(', ')}. A KPI can only be affected by something the record holds.`);
    return item;
  };

  // A process can only feed one that exists, and never itself. The record had NO process-to-process
  // edge before this, so a flow drawn from it would have been asserting a sequence nobody recorded.
  const checkFeeds = (item, kind) => {
    if (kind !== 'process' || !(item.feeds || []).length) return item;
    const nums = new Set(p.PROCESSES.map((x) => x.num).concat(item.num));
    const norm = item.feeds.map((x) => String(x).trim().padStart(2, '0'));
    const stray = norm.filter((x) => !nums.has(x));
    if (stray.length) throw new Error(`No process numbered ${stray.join(', ')} for this to feed into.`);
    if (norm.includes(item.num)) throw new Error('A process cannot feed itself.');
    return { ...item, feeds: [...new Set(norm)] };
  };

  // A chart with a loop in it is not a chart. Walking up from any unit has to terminate, and a unit
  // that is its own ancestor would hang every renderer that draws the tree.
  const checkTree = (item, kind) => {
    if (kind !== 'unit') return item;
    if (!item.parent) return item;
    const units = new Map((p.UNITS || []).map((u) => [u.id, u]));
    units.set(item.id, item);
    if (!units.has(item.parent)) {
      throw new Error(`No unit "${item.parent}" in this record for this to sit under.`);
    }
    if (item.parent === item.id) throw new Error('A unit cannot sit under itself.');
    const seen = new Set([item.id]);
    let cur = units.get(item.parent);
    while (cur) {
      if (seen.has(cur.id)) {
        throw new Error(`That would put ${item.name} inside itself: the chain of parents loops back round.`);
      }
      seen.add(cur.id);
      cur = cur.parent ? units.get(cur.parent) : null;
    }
    return item;
  };

  // The people chart has exactly the same failure as the unit chart: a reporting line that loops
  // back round hangs every renderer that walks it, and "A reports to B reports to A" is something a
  // practitioner can type in two edits without noticing.
  /** ⚠ `question.from` HAD NO VALIDATION OF ANY KIND — not existence, not self, not cycles — while
   *  `unit.parent` and `person.reportsTo` have had all three since they were added. The drawer now
   *  refuses all three, but a form is a courtesy to the typist, not the guard on the record: an MCP
   *  session writes straight past it. A follow-up chain that loops has no honest reading, and a
   *  question that followed from itself is a claim about nothing. */
  /** ⚠ THE FIRST VERSION OF THIS BRICKED RECORDS. It refused any edit whose `from` did not resolve,
   *  and a `from` stops resolving on its own: ids are content hashes, so rewording a parent or
   *  moving it to another pillar re-mints its id and orphans every child. A practitioner who
   *  re-pillared one question then could not save an unrelated typo on the next one, and an MCP
   *  session got a hard refusal with no way past it. Two changes: a re-minted question now CARRIES
   *  its referrers (see the edit branch), and this guard refuses only what the edit in hand is
   *  responsible for. An already-dangling link is an honest state the record can hold and the
   *  drawer already labels; it is not a reason to lock the record.
   *  @param was  the `from` as stored before this operation, or undefined on an add. */
  const checkFollows = (item, kind, was) => {
    if (kind !== 'question' || !item.from) return item;
    const byId = new Map();
    for (const g of p.QUESTIONS || []) for (const q of g.items || []) byId.set(q.id, q);
    byId.set(item.id, item);
    if (item.from === item.id) throw new Error('A question cannot have followed from itself.');
    if (!byId.has(item.from)) {
      // Untouched and already broken: not this edit's doing, and refusing here would mean the only
      // way to correct the record is an edit the record refuses.
      if (was !== undefined && item.from === was) return item;
      // ⚠ `byId` holds the item under edit, so `size > 1` once read "no other questions yet" over a
      // record that plainly had one. Count what is actually there beside it.
      const others = [...byId.keys()].filter((k) => k !== item.id).length;
      throw new Error(others
        ? `No question "${item.from}" in this record for it to have followed from.`
        : 'This record has no other questions yet, so this one cannot have followed from any.');
    }
    const seen = new Set([item.id]);
    let cur = byId.get(item.from);
    while (cur) {
      if (seen.has(cur.id)) throw new Error('That chain of follow-up questions loops back round.');
      seen.add(cur.id);
      // A link that does not resolve ends the walk. It is a broken chain, not a loop, and the two
      // must not share a message.
      cur = cur.from ? byId.get(cur.from) : null;
    }
    return item;
  };

  /** What must exist before this can. Same three refusals as every other reference in the record:
   *  it has to exist, it cannot be itself, and a ring of them has no honest reading. A dependency
   *  loop is not a strange edge case here: two builds that each need the other is precisely what a
   *  sequencing conversation produces when nobody writes the order down. */
  const checkDepends = (item, kind, was) => {
    if (kind !== 'build' || !(item.dependsOn || []).length) return item;
    const byId = new Map((p.BUILDS || []).map((b) => [b.id, b]));
    byId.set(item.id, item);
    if (item.dependsOn.includes(item.id)) throw new Error('A build cannot depend on itself.');
    const wasSet = new Set(was || []);
    for (const d of item.dependsOn) {
      // Tolerate a reference this edit did not touch, for the same reason `from` is tolerated: an
      // already-broken link must not make the record unwritable.
      if (!byId.has(d) && !wasSet.has(d)) {
        throw new Error(`No proposed build "${d}" in this record for this one to depend on.`);
      }
    }
    const seen = new Set();
    const walk = (id, trail) => {
      if (trail.has(id)) throw new Error('Those builds depend on each other in a ring, so nothing could be built first.');
      if (seen.has(id)) return;
      seen.add(id);
      const b = byId.get(id);
      if (!b) return;
      for (const d of b.dependsOn || []) walk(d, new Set([...trail, id]));
    };
    walk(item.id, new Set());
    return item;
  };

  const checkPeople = (item, kind) => {
    const people = new Map((p.PEOPLE || []).map((n) => [n.id, n]));
    if (kind === 'person') people.set(item.id, item);
    const must = (id, what) => {
      if (!id) return;
      if (!people.has(id)) throw new Error(`No person "${id}" in this record for ${what}.`);
    };
    if (kind === 'person') {
      if (item.reportsTo === item.id) throw new Error('Somebody cannot report to themselves.');
      must(item.reportsTo, 'them to report to');
      for (const w of item.worksWith) {
        if (w === item.id) throw new Error('Somebody cannot be listed as working with themselves.');
        must(w, 'them to work with');
      }
      const seen = new Set([item.id]);
      let cur = item.reportsTo ? people.get(item.reportsTo) : null;
      while (cur) {
        if (seen.has(cur.id)) throw new Error(`That reporting line loops back round to ${item.name}.`);
        seen.add(cur.id);
        cur = cur.reportsTo ? people.get(cur.reportsTo) : null;
      }
    }
    if (kind === 'session') must(item.personId, 'this session to be with');
    if (kind === 'task') must(item.personId, 'this task to belong to');
    if (kind === 'unit') must(item.leadId, 'this unit to be led by');
    // ⚠ EVERY NAME THE RECORD CAN FOLLOW. Who runs a process, who to speak to inside it, who owns
    // a source and whose number a KPI is: all of them were free text, so a person's own page could
    // not show what they are actually responsible for. The words are still there; these are the
    // links that let the record answer "what is this person on the hook for?"
    if (kind === 'process') {
      must(item.whoRunsId, 'this process to be run by');
      for (const id of item.speakToIds) must(id, 'this process to be walked with');
    }
    // ⚠ Nested inside the steps array, so it is not a top-level field and nothing that walks
    // FIELDS will find it. Checked explicitly, or a step could name somebody the record does not
    // hold and no guard would notice.
    if (kind === 'process') for (const st of item.steps || []) must(st.whoId, `step ${st.n} to be done by`);
    if (kind === 'source') must(item.ownerId, 'this source to be owned by');
    if (kind === 'kpi') must(item.ownerId, 'this number to belong to');
    return item;
  };

  // A number assigned to a team that does not exist is a number nobody owns.
  const checkUnit = (item, kind) => {
    if (!item.unitId) return item;
    if (!(p.UNITS || []).some((u) => u.id === item.unitId)) {
      throw new Error((p.UNITS || []).length
        ? `No unit "${item.unitId}" in this record.`
        : 'This record has no organisation mapped yet, so nothing can be assigned to a team. Add the units first.');
    }
    return item;
  };

  const checkRefs = (item, kind) => {
    // THE TIE. A session exists to answer particular questions, and the answer to "did we cover
    // it?" has to be a fact about the record rather than a practitioner's memory. A session that
    // names a question the record does not hold is a session nobody can run against the plan.
    if (kind === 'session' && item.covers.length) {
      const qs = new Set(p.QUESTIONS.flatMap((g) => (g.items || []).map((x) => x.id)));
      const stray = item.covers.filter((x) => !qs.has(x));
      if (stray.length) {
        throw new Error(qs.size
          ? `No question in this record with id ${stray.join(', ')}.`
          : 'This record has no questions yet, so a session cannot cover any. Add the questions first.');
      }
    }
    // Both sides of the offering link. This relationship is stored twice, and two unvalidated
    // mirrors drift the first time either side is edited: an offering naming a process that does
    // not exist renders as a workflow with a hole in it that nobody can explain.
    if (kind === 'offering' && item.processes.length) {
      const nums = new Set(p.PROCESSES.map((x) => x.num));
      const stray = item.processes.filter((x) => !nums.has(x));
      if (stray.length) {
        throw new Error(nums.size
          ? `No process numbered ${stray.join(', ')} in this record. It has: ${[...nums].join(', ')}.`
          : `This record has no processes yet, so ${stray.join(', ')} refers to nothing. Add the process first.`);
      }
      return item;
    }
    // A proposal is ABOUT an existing chain. One that names a process the record does not hold is a
    // proposal nobody can place, and it renders as a build with a hole where its context should be.
    if (kind === 'build' && item.processes.length) {
      const nums = new Set(p.PROCESSES.map((x) => x.num));
      const stray = item.processes.filter((x) => !nums.has(x));
      if (stray.length) {
        throw new Error(nums.size
          ? `No process numbered ${stray.join(', ')} in this record. It has: ${[...nums].join(', ')}.`
          : `This record has no processes yet, so ${stray.join(', ')} refers to nothing. Add the process first.`);
      }
    }
    // What it should move. A build claiming a KPI the record does not hold cannot be checked against
    // anything later, which is the whole reason for naming one.
    if (kind === 'build' && item.kpis.length) {
      const ks = new Set((p.KPIS || []).map((x) => x.id));
      const stray = item.kpis.filter((x) => !ks.has(x));
      if (stray.length) {
        throw new Error(ks.size
          ? `No KPI with id ${stray.join(', ')} in this record.`
          : 'This record has no KPIs yet, so a build cannot name one it would move. Add the KPI first.');
      }
    }
    if (kind === 'process' && (item.offerings || []).length) {
      const refs = new Set((p.OFFERINGS || []).map((x) => x.ref).filter(Boolean));
      const stray = item.offerings.filter((x) => !refs.has(x));
      if (stray.length) {
        throw new Error(refs.size
          ? `No offering ${stray.join(', ')} in this record. It has: ${[...refs].join(', ')}.`
          : `This record has no offerings yet, so ${stray.join(', ')} refers to nothing. Add the offering first.`);
      }
      return item;
    }
    // Every kind that names a process gets the same check, so a link can never point at nothing.
    if ((kind === 'question' || kind === 'session') && item.processes.length) {
      const nums = new Set(p.PROCESSES.map((x) => x.num));
      const stray = item.processes.filter((x) => !nums.has(x));
      if (stray.length) {
        throw new Error(nums.size
          ? `No process numbered ${stray.join(', ')} in this record. It has: ${[...nums].join(', ')}.`
          : `This record has no processes yet, so ${stray.join(', ')} refers to nothing.`);
      }
      return item;
    }
    if (kind === 'task' && item.processes.length) {
      const nums = new Set(p.PROCESSES.map((x) => x.num));
      const stray = item.processes.filter((x) => !nums.has(x));
      if (stray.length) throw new Error(`No process numbered ${stray.join(', ')} in this record.`);
      return item;
    }
    if (kind !== 'evidence' || !item.processes.length) return item;
    const known = new Set(p.PROCESSES.map((x) => x.num));
    // The Plan writes ranges as well as single numbers ("01 to 07"), because some evidence bears on
    // the whole delivery chain. Expanding here rather than refusing keeps that item writable.
    const expand = (v) => {
      const m = /^\s*(\d+)\s*(?:to|-|–|—)\s*(\d+)\s*$/i.exec(String(v));
      if (!m) return [String(v).trim().padStart(2, '0')];
      const [a, b] = [Number(m[1]), Number(m[2])];
      if (b < a || b - a > 99) return [String(v).trim()];
      return Array.from({ length: b - a + 1 }, (_, i) => String(a + i).padStart(2, '0'));
    };
    const wanted = item.processes.flatMap(expand);
    const stray = wanted.filter((x) => !known.has(x));
    if (stray.length) {
      throw new Error(known.size
        ? `No process numbered ${stray.join(', ')} in this record. It has: ${[...known].join(', ')}.`
        : `This record has no processes yet, so ${stray.join(', ')} refers to nothing. Add the process first.`);
    }
    return { ...item, processes: [...new Set(wanted)] };
  };

  if (op.type === 'add') {
    const item = checkDepends(checkFollows(checkPeople(checkUnit(checkTree(checkFeeds(checkLinks(checkRefs(buildItem(op.kind, op.fields || {}, id), op.kind), op.kind), op.kind), op.kind), op.kind), op.kind), op.kind), op.kind);
    // A follow-up must point at a question that exists, or the link is a dead end nobody notices.
    if (op.kind === 'question' && item.from && !findItem(p, item.from)) {
      throw new Error(`No question "${item.from}" in this record for this to follow from.`);
    }
    if (allIds(p).includes(item.id)) throw new Error('That already exists in this record. Edit it instead of adding it again.');
    if (op.kind === 'process') {
      p.PROCESSES.push(item);
      p.PROCESSES.sort((a, b) => String(a.num).localeCompare(String(b.num)));
    } else if (op.kind === 'evidence') p.EVIDENCE.push(item);
    else if (op.kind === 'kpi') { p.KPIS = p.KPIS || []; p.KPIS.push(item); }
    else if (op.kind === 'hypothesis') { p.HYPOTHESES = p.HYPOTHESES || []; p.HYPOTHESES.push(item); }
    else if (op.kind === 'competitor') { p.COMPETITORS = p.COMPETITORS || []; p.COMPETITORS.push(item); }
    else if (op.kind === 'offering') { p.OFFERINGS = p.OFFERINGS || []; p.OFFERINGS.push(item); }
    else if (op.kind === 'unit') { p.UNITS = p.UNITS || []; p.UNITS.push(item); }
    else if (op.kind === 'person') { p.PEOPLE = p.PEOPLE || []; p.PEOPLE.push(item); }
    else if (op.kind === 'task') { p.TASKS = p.TASKS || []; p.TASKS.push(item); }
    else if (op.kind === 'build') { p.BUILDS = p.BUILDS || []; p.BUILDS.push(item); }
    else if (op.kind === 'opportunity') { p.OPPORTUNITIES = p.OPPORTUNITIES || []; p.OPPORTUNITIES.push(item); }
    else if (op.kind === 'complexity') { p.COMPLEXITY = p.COMPLEXITY || []; p.COMPLEXITY.push(item); }
    else if (op.kind === 'session') p.SESSIONS.push(item);
    else if (op.kind === 'source') p.SOURCES.push(item);
    else {
      const pillar = op.fields.pillar;
      let g = p.QUESTIONS.find((x) => x.pillar === pillar);
      if (!g) { g = { pillar, group: PILLAR_GROUP[pillar], items: [] }; p.QUESTIONS.push(g); }
      g.items.push(item);
      p.QUESTIONS.sort((a, b) => PILLARS.indexOf(a.pillar) - PILLARS.indexOf(b.pillar));
    }
    return p;
  }

  if (op.type === 'edit') {
    const found = findItem(p, op.id);
    if (!found) throw new Error(`Nothing in this record with id "${op.id}".`);
    const merged = { ...found.item, ...(op.fields || {}) };
    if (found.kind === 'question') merged.pillar = op.fields?.pillar || found.pillar;
    const rebuilt = checkDepends(checkFollows(checkPeople(checkUnit(checkTree(checkFeeds(checkLinks(checkRefs(buildItem(found.kind, merged, id || op.id), found.kind), found.kind), found.kind), found.kind), found.kind), found.kind), found.kind, found.item.from), found.kind, found.item.dependsOn);
    // The add branch refuses a duplicate; the edit branch did not, so editing one row to match
    // another put two items under a single id and made the second unreachable.
    if (rebuilt.id !== op.id && allIds(p).includes(rebuilt.id)) {
      throw new Error('Another item in this record already has that identity. Change the wording, or edit that one instead.');
    }
    // ⚠ THIS ONCE CARRIED `question.from` AND NOTHING ELSE, which fixed one of thirteen referrer
    // fields. Rewording a question still left `session.covers` and `kpi.affectedBy` pointing at the
    // old id, and since both are hard-validated on the next edit of the REFERRING item, fixing a
    // typo in a question made the session that covers it unwritable, with no way to clear the bad
    // reference because clearing it needs an edit the record refuses. All thirteen now, from a
    // table, so a fourteenth is a change to one list rather than a bug nobody sees.
    carryRefs(p, op.id, rebuilt.id);
    // Moving a question to a different pillar moves it between groups, not just fields.
    if (found.kind === 'question' && merged.pillar !== found.pillar) {
      const from = p.QUESTIONS.find((g) => g.pillar === found.pillar);
      from.items = from.items.filter((q) => q.id !== op.id);
      let to = p.QUESTIONS.find((g) => g.pillar === merged.pillar);
      if (!to) { to = { pillar: merged.pillar, group: PILLAR_GROUP[merged.pillar], items: [] }; p.QUESTIONS.push(to); }
      to.items.push(rebuilt);
      p.QUESTIONS = p.QUESTIONS.filter((g) => g.items.length)
        .sort((a, b) => PILLARS.indexOf(a.pillar) - PILLARS.indexOf(b.pillar));
      return p;
    }
    const swap = (list) => list.map((x) => (x.id === op.id ? rebuilt : x));
    if (found.kind === 'process') p.PROCESSES = swap(p.PROCESSES).sort((a, b) => String(a.num).localeCompare(String(b.num)));
    else if (found.kind === 'evidence') p.EVIDENCE = swap(p.EVIDENCE);
    else if (found.kind === 'session') p.SESSIONS = swap(p.SESSIONS);
    else if (found.kind === 'source') p.SOURCES = swap(p.SOURCES || []);
    else if (found.kind === 'kpi') p.KPIS = swap(p.KPIS || []);
    else if (found.kind === 'hypothesis') p.HYPOTHESES = swap(p.HYPOTHESES || []);
    else if (found.kind === 'competitor') p.COMPETITORS = swap(p.COMPETITORS || []);
    else if (found.kind === 'offering') p.OFFERINGS = swap(p.OFFERINGS || []);
    else if (found.kind === 'unit') p.UNITS = swap(p.UNITS || []);
    else if (found.kind === 'person') p.PEOPLE = swap(p.PEOPLE || []);
    else if (found.kind === 'task') p.TASKS = swap(p.TASKS || []);
    else if (found.kind === 'build') p.BUILDS = swap(p.BUILDS || []);
    else if (found.kind === 'opportunity') p.OPPORTUNITIES = swap(p.OPPORTUNITIES || []);
    else if (found.kind === 'complexity') p.COMPLEXITY = swap(p.COMPLEXITY || []);
    else if (found.kind === 'source') p.SOURCES = swap(p.SOURCES);
    else p.QUESTIONS = p.QUESTIONS.map((g) => ({ ...g, items: swap(g.items) }));
    return p;
  }

  if (op.type === 'remove') {
    const found = findItem(p, op.id);
    if (!found) throw new Error(`Nothing in this record with id "${op.id}".`);
    const drop = (list) => list.filter((x) => x.id !== op.id);
    if (found.kind === 'process') p.PROCESSES = drop(p.PROCESSES);
    else if (found.kind === 'evidence') p.EVIDENCE = drop(p.EVIDENCE);
    else if (found.kind === 'session') p.SESSIONS = drop(p.SESSIONS);
    else if (found.kind === 'source') p.SOURCES = drop(p.SOURCES || []);
    else if (found.kind === 'kpi') p.KPIS = drop(p.KPIS || []);
    else if (found.kind === 'hypothesis') p.HYPOTHESES = drop(p.HYPOTHESES || []);
    else if (found.kind === 'competitor') p.COMPETITORS = drop(p.COMPETITORS || []);
    else if (found.kind === 'offering') p.OFFERINGS = drop(p.OFFERINGS || []);
    else if (found.kind === 'unit') p.UNITS = drop(p.UNITS || []);
    else if (found.kind === 'person') p.PEOPLE = drop(p.PEOPLE || []);
    else if (found.kind === 'task') p.TASKS = drop(p.TASKS || []);
    else if (found.kind === 'build') p.BUILDS = drop(p.BUILDS || []);
    else if (found.kind === 'opportunity') p.OPPORTUNITIES = drop(p.OPPORTUNITIES || []);
    else if (found.kind === 'complexity') p.COMPLEXITY = drop(p.COMPLEXITY || []);
    else p.QUESTIONS = p.QUESTIONS.map((g) => ({ ...g, items: drop(g.items) })).filter((g) => g.items.length);
    return p;
  }

  throw new Error(`Unknown operation "${op.type}".`);
}

// ── coverage ──────────────────────────────────────────────────────────────────────────────────
export function summaryOf(plan, state = {}) {
  const p = normalisePlan(plan);
  const ids = allIds(p);
  const g = (id) => state[id] || {};
  return {
    slug: p.engagement?.slug || null,
    client: p.engagement?.client || null,
    processes: p.PROCESSES.length,
    questions: p.QUESTIONS.reduce((n, q) => n + (q.items?.length || 0), 0),
    evidence: p.EVIDENCE.length,
    sessions: p.SESSIONS.length,
    items: ids.length,
    examined: ids.filter((id) => g(id).status === 'done').length,
    underWay: ids.filter((id) => g(id).status === 'active').length,
    blocked: ids.filter((id) => g(id).status === 'blocked').length,
    shared: ids.filter((id) => g(id).visibility === 'shared').length,
    pillarsCovered: p.PILLAR_ORDER.filter((x) => p.QUESTIONS.some((q) => q.pillar === x && q.items.length)).length,
    pillarsTotal: p.PILLAR_ORDER.length,
  };
}

/** The coverage findings the Standard treats as findings in themselves. Never a read failure:
 *  an empty record is a record nobody has filled in yet, and saying so is the point. */
/** Every question, with the sessions meant to answer it. This is the spine of the Sessions area:
 *  a practitioner running a session needs the questions in front of them, and a plan needs to show
 *  which questions no session will reach. Pillar coverage was always too coarse to answer that. */
/** Routes that put a QUESTION in front of a PERSON. Everything else on ROUTES is gathered without
 *  anyone's time (a document, a system, desk research, watching the work run), and the Standard's
 *  first gathering rule (4.3) is that those are never asked of a person. An UNDECIDED route stays
 *  in the needs-a-session count, because nobody has yet said it can be had any other way. */
export const PERSON_ROUTES = ['session', 'parallel interview', 'client of client', 'respondent research'];

export function questionCoverage(plan) {
  const p = normalisePlan(plan);
  const bySession = new Map();
  p.SESSIONS.forEach((s) => (s.covers || []).forEach((qid) => {
    if (!bySession.has(qid)) bySession.set(qid, []);
    bySession.get(qid).push(s);
  }));
  const rows = [];
  p.QUESTIONS.forEach((g) => (g.items || []).forEach((q) => {
    rows.push({ pillar: g.pillar, question: q, sessions: bySession.get(q.id) || [] });
  }));
  /* ⚠ A DOCUMENT-ROUTED QUESTION IS NOT UNANSWERED, IT IS ANSWERED WITHOUT A DIARY.
     Counting it as "nobody set to answer" told a practitioner to book a meeting for the exact
     things the plan routes around people, and made the gap stat read 78 when the honest number
     was the handful of person-routed questions still untied. */
  const needsSession = (r) => r.question.certainty !== 'known'
    && (!r.question.route || PERSON_ROUTES.includes(r.question.route));
  const needing = rows.filter(needsSession);
  return {
    rows,
    unanswerable: needing.filter((r) => !r.sessions.length),
    answered: needing.filter((r) => r.sessions.length).length,
    total: needing.length,
    gathered: rows.length - needing.length,   // known, or reachable without a person
    all: rows.length,
  };
}

/** What one session has to get through, resolved from ids to the real questions. */
export function sessionBrief(plan, session) {
  const p = normalisePlan(plan);
  const byId = new Map();
  p.QUESTIONS.forEach((g) => (g.items || []).forEach((q) => byId.set(q.id, { ...q, pillar: g.pillar })));
  const questions = (session.covers || []).map((id) => byId.get(id)).filter(Boolean);
  const byPillar = [];
  questions.forEach((q) => {
    let row = byPillar.find((x) => x.pillar === q.pillar);
    if (!row) { row = { pillar: q.pillar, group: PILLAR_GROUP[q.pillar], questions: [] }; byPillar.push(row); }
    row.questions.push(q);
  });
  byPillar.sort((a, b) => PILLARS.indexOf(a.pillar) - PILLARS.indexOf(b.pillar));
  return {
    questions, byPillar,
    // Known is stated, not asked (4.2). Counting it as something to get through in the room would
    // send a practitioner in to re-ask what the client already told us.
    toAsk: questions.filter((q) => q.certainty !== 'known'),
    toState: questions.filter((q) => q.certainty === 'known'),
    processes: p.PROCESSES.filter((pr) => (pr.pillars || []).some((x) => (session.pillars || []).includes(x))),
    evidence: p.EVIDENCE.filter((e) => e.state !== 'held' && (session.pillars || []).length),
  };
}

export function gapsOf(plan, state = {}) {
  const p = normalisePlan(plan);
  const out = [];
  const spoken = new Set(p.SESSIONS.flatMap((s) => s.pillars || []));
  const touched = new Set(p.PROCESSES.flatMap((x) => x.pillars || []));
  const asked = new Set(p.QUESTIONS.filter((q) => q.items.length).map((q) => q.pillar));
  for (const pillar of p.PILLAR_ORDER) {
    if (!asked.has(pillar)) out.push({ pillar, kind: 'questions', say: `No questions set for ${pillar}.` });
    if (!spoken.has(pillar)) out.push({ pillar, kind: 'session', say: `No session covers ${pillar}.` });
    if (!touched.has(pillar)) out.push({ pillar, kind: 'process', say: `No process names ${pillar}.` });
  }
  // The sharpest gap of all, and the reason the tie exists: a question nobody is scheduled to answer.
  questionCoverage(p).unanswerable.forEach((r) => out.push({
    pillar: r.pillar, kind: 'unanswerable', id: r.question.id,
    say: `No session is set to answer: ${r.question.q}`,
  }));
  const ids = new Set(allIds(p));
  const orphans = Object.keys(state).filter((id) => !ids.has(id));
  if (orphans.length) out.push({ pillar: null, kind: 'orphan', say: `${orphans.length} status record(s) point at items no longer in the record.`, ids: orphans });
  return out;
}
