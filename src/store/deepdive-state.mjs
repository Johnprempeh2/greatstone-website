// Per-item working state for the Deep Dive Portal: what Greatstone has done with each item, and
// whether the client sees it.
//
// The Investigation Plan says what the investigation IS. This says where it has GOT TO. Keeping them
// apart is what lets the plan be regenerated from the document without losing a week of status, and
// what lets one item be worked internally for a fortnight before anyone outside sees it.
//
// Items are addressed by the content-derived ids the exporter stamps on them, so status survives a
// reordering of the plan and detaches from an item whose wording has actually changed.
//
// PERSISTENCE, in order:
//
//   1. Netlify Database through an authenticated Function, with row-level security.
//   2. The dev server's own `.deepdive/<slug>.state.json`, read and written over the middleware in
//      vite.config.js. Shared with the Deep Dive MCP, so an edit made in the browser and an edit made
//      by a Claude session are the same bytes. Development only.
//   3. This browser's localStorage. Last resort, per-machine, invisible to anyone else.
//
// The Portal shows which of these is in force rather than letting an admin believe a colleague can
// see their edits.

import { supabase } from '../lib/supabase.mjs';
import { deepdiveStateRequest } from './deepdive-api.mjs';
import { normaliseFinding, validateFindingInput, initialState, canValidate, stateAfterConclusion, AGREEMENT } from '../data/deepdive-findings.mjs';

// what has happened to an item. `blocked` carries a reason, because "blocked" with no reason is noise.
export const STATUS = {
  open:    { label: 'Not started', client: 'Not started', tone: 'idle' },
  active:  { label: 'Under way',   client: 'Under way',   tone: 'active' },
  done:    { label: 'Examined',    client: 'Complete',    tone: 'done' },
  blocked: { label: 'Blocked',     client: 'Waiting',     tone: 'blocked' },
};
export const STATUS_ORDER = ['open', 'active', 'done', 'blocked'];
export const DEFAULT_STATUS = 'open';

// John's rule for this Portal: Greatstone works the whole investigation, and publishes deliberately.
// Internal is therefore the default, and nothing reaches the client by omission.
export const VISIBILITY = {
  internal: { label: 'Internal', blurb: 'Greatstone only. The client does not see this item.' },
  shared:   { label: 'Shared',   blurb: 'Visible to the client in their view of the Portal.' },
};
export const DEFAULT_VISIBILITY = 'internal';

const KEY = (slug) => `gs:deepdive:${slug}`;
const stateUrl = (slug) => `${import.meta.env.BASE_URL || '/'}deepdive/${encodeURIComponent(slug)}.state.json`;

// An append-only record of what changed and when. Section 4.10 asks for status logging so both sides
// can see what has been examined; a status field alone answers "where is it now" but not "when did
// that happen", which is the half that makes a Portal a record rather than a dashboard.
const MAX_LOG = 500;
const norm = (r) => ({
  status: STATUS[r?.status] ? r.status : DEFAULT_STATUS,
  visibility: VISIBILITY[r?.visibility] ? r.visibility : DEFAULT_VISIBILITY,
  note: typeof r?.note === 'string' ? r.note : '',
  // Whether independent accounts of this question agree. Null until somebody judges: "nobody has
  // compared them yet" is a different state from "everyone said the same thing", and collapsing the
  // two would quietly retire a question that was never actually checked.
  agreement: AGREEMENT[r?.agreement] ? r.agreement : null,
  updated: r?.updated || null,
});

export const stateOf = (map, id) => norm(map?.[id]);
export const isShared = (map, id) => stateOf(map, id).visibility === 'shared';

/** What an Examined session left behind (John, 10 Sep: "a session ending, accounted for").
 *
 *  A leftover is a question the session was set to answer that is still not Examined, judged
 *  against the record NOW: a question answered later by another route stops being a leftover,
 *  because the point is the gap, not the history of the meeting. A cover id the record no longer
 *  holds is skipped here; the live run surface is where a dead tie is shown for repair.
 *  Only an EXAMINED session has leftovers: an open one still has its meeting ahead of it. */
export function sessionLeftovers(plan, map, session) {
  if (stateOf(map, session.id).status !== 'done') return [];
  const out = [];
  for (const id of session.covers || []) {
    if (stateOf(map, id).status === 'done') continue;
    for (const g of plan.QUESTIONS || []) {
      const q = (g.items || []).find((x) => x.id === id);
      if (q) { out.push({ id, q, pillar: g.pillar }); break; }
    }
  }
  return out;
}

/** An Examined session whose record can be opened by nobody. A finding traced to "the session
 *  with X" is only checkable if somebody can open the session, and this is the flag that says
 *  they cannot. */
export const sessionNeedsRecord = (map, session) =>
  stateOf(map, session.id).status === 'done'
  && !String(session.record || '').trim()
  && !String(session.recordNote || '').trim();


function readLocal(slug) {
  try { return JSON.parse(localStorage.getItem(KEY(slug)) || '{}') || {}; } catch { return {}; }
}
function writeLocal(slug, map) {
  try { localStorage.setItem(KEY(slug), JSON.stringify(map)); return true; } catch { return false; }
}

async function readFileState(slug) {
  try {
    const res = await fetch(stateUrl(slug), { cache: 'no-store' });
    if (!res.ok) return null;
    if (!/\bjson\b/i.test(res.headers.get('content-type') || '')) return null;
    const d = await res.json();
    // The version this page's copy is based on. A full-document PUT without it silently erased any
    // change the MCP or a second tab had made in the meantime.
    return {
      map: d?.items && typeof d.items === 'object' ? d.items : {},
      log: Array.isArray(d?.log) ? d.log : [],
      findings: Array.isArray(d?.findings) ? d.findings : [],
      files: Array.isArray(d?.files) ? d.files : [],
      version: res.headers.get('etag') || null,
    };
  } catch { return null; }
}

async function writeFileState(slug, map, log, version, findings = undefined, files = undefined) {
  try {
    const res = await fetch(stateUrl(slug), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: map, log: log.slice(-MAX_LOG), findings, files, _version: version }),
    });
    if (res.status === 409 || res.status === 428) {
      const e = new Error('The status changed while you were working. Reload before saving again.');
      e.conflict = true; throw e;   // rethrown below, NOT swallowed: see the catch
    }
    // Same fail-closed check the read side uses: a host that answers PUT with an SPA rewrite returns
    // 200 and HTML, and reporting that as "saved" is worse than reporting a failure.
    if (!res.ok) return false;
    if (!/\bjson\b/i.test(res.headers.get('content-type') || '')) return false;
    try { return (await res.json()).version || true; } catch { return true; }
  } catch (e) {
    // A conflict is NOT "the file backend is unavailable". Swallowing it here made the caller fall
    // through to localStorage and report a clean save, so a rejected write showed as "Shared with
    // the client" while the server had refused it and nobody was shared with anything.
    if (e && e.conflict) throw e;
    return false;
  }
}

// The trail, as the rest of this module shapes it. Kept next to the writer below so the two cannot
// drift into writing one shape and reading another.
const logRowToEntry = (r) => ({
  at: r.at, id: r.item_id, label: r.label, by: r.by || 'portal', actor: r.actor || null,
  ...(r.finding_id ? { findingId: r.finding_id } : {}), changed: r.changed || {},
});
const findingRowToEntry = (r) => ({
  id: r.id, questionId: r.question_id, sessionId: r.session_id, text: r.text || '',
  source: r.source || '', sourceId: r.source_id, confidence: r.confidence, state: r.state,
  supersedes: r.supersedes, by: r.by, at: r.at, validatedAt: r.validated_at, note: r.note || '',
});
const fileRowToEntry = (r) => ({
  id: r.id, label: r.label, mime: r.mime, ext: r.ext, bytes: r.bytes,
  attachedTo: r.attached_to || [], visibility: r.visibility || 'internal', note: r.note || '',
  by: r.by || 'portal', actor: r.actor || null, at: r.at,
});
export async function loadState(slug) {
  if (supabase) {
    const data = await deepdiveStateRequest('load', { slug });
    if (data) {
      const map = {};
      data.items.forEach((r) => { map[r.item_id] = norm({ ...r, updated: r.updated_at }); });
      return { map, log: data.log.map(logRowToEntry), files: data.files.map(fileRowToEntry),
        findings: data.findings.map(findingRowToEntry), durable: true, backend: 'netlify' };
    }
  }
  const file = await readFileState(slug);
  if (file) return { ...file, durable: false, backend: 'file' };
  return { map: readLocal(slug), log: [], durable: false, backend: 'local' };
}

// ── who made the change ───────────────────────────────────────────────────────────────────────
//
// "Portal" is not an answer to "who changed this". The record is worked by several people and by
// Claude, and an audit trail that cannot name the hand is a list of edits nobody owns.
//
// Set once per session by the portal, from the signed-in staff user, rather than resolved on every
// write: there is exactly one person at a keyboard and asking Supabase who they are eight times
// while they tick eight boxes is a round trip per tick.
//
// IT IS NEVER GUESSED. No session means `actor: null`, which the UI reports as unattributed rather
// than inventing a name. An audit trail that fills in a plausible person is worse than one with a
// gap in it, because the gap is honest.
let ACTOR = null;

/** @param {{id?:string,name?:string,email?:string,role?:string}|null} a */
export function setActor(a) {
  ACTOR = a && (a.name || a.email)
    ? { id: a.id || null, name: a.name || a.email, email: a.email || null, role: a.role || null }
    : null;
}
export const getActor = () => ACTOR;

/** The stamp every log entry carries. `by` says which writer, `actor` says which hand. */
export const madeBy = () => ({ by: 'portal', actor: ACTOR });

/** A person's name for display, from an entry written at any point in this record's life.
 *  Entries written before attribution existed have no actor, and say so. */
export function whoDid(entry) {
  if (!entry) return 'Unattributed';
  if (entry.by === 'mcp') return entry.actor?.name || 'Claude';
  return entry.actor?.name || 'Not signed in';
}

// Returns the new map so the caller updates from what was actually stored, never from what it hoped.
export async function saveItem(slug, id, patch, current = {}, log = [], label = null, version = null) {
  const at = new Date().toISOString();
  const before = norm(current[id]);
  const after = norm({ ...current[id], ...patch, updated: at });
  const next = { ...current, [id]: after };

  // only record what actually moved, so the log stays a history and not a heartbeat
  const changed = ['status', 'visibility', 'note', 'agreement'].filter((k) => before[k] !== after[k]);
  const nextLog = changed.length
    ? [...log, { at, id, label, ...madeBy(), changed: Object.fromEntries(changed.map((k) => [k, [before[k], after[k]]])) }]
    : log;

  if (supabase) {
    await deepdiveStateRequest('items', { slug, items: [{ item_id: id, ...after }], entries: nextLog.slice(log.length) });
    return { map: next, log: nextLog, durable: true, backend: 'netlify' };
  }
  const wrote = await writeFileState(slug, next, nextLog, version);
  if (wrote) return { map: next, log: nextLog, durable: false, backend: 'file', version: wrote };
  const ok = writeLocal(slug, next);
  return {
    map: next, log: nextLog, durable: false, backend: 'local',
    // ⚠ `stored` is the store's own verdict on whether the bytes went ANYWHERE. A caller cannot
    // tell "saved, but the history line did not go with it" from "nothing was written at all" by
    // looking at `warning` alone, and one of those must not close an editor over somebody's typing.
    stored: ok,
    warning: ok ? null : 'This browser refused to store the change.',
  };
}

/** Log a change to the PLAN, as distinct from a change to where an item has got to.
 *
 *  Adding a process, rewording a question and deleting an item were the largest changes anybody
 *  could make to a record and NONE of them was logged: the History tab showed status and visibility
 *  moves only, so "every change over time" was not something this record could actually produce.
 *
 *  Same entry shape as a state change, so one renderer draws both and an item page's own history
 *  shows the two interleaved in the order they happened.
 */
export async function logOp(slug, entry, log = [], map = {}, version = null) {
  const row = { at: new Date().toISOString(), ...madeBy(), ...entry };
  const nextLog = [...log, row];
  const wrote = await replaceState(slug, map, nextLog, version, [row]);
  return { log: nextLog, version: wrote?.version ?? version, entry: row };
}

/** What actually moved between two versions of an item, as {field: [before, after]}.
 *  Only fields that changed, so the log stays a history rather than a snapshot. */
export function diffItem(before, after) {
  const out = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) {
    if (k === 'id') continue;
    const a = before ? before[k] : undefined;
    const b = after ? after[k] : undefined;
    const norm = (v) => (Array.isArray(v) ? JSON.stringify(v) : v === undefined || v === null ? '' : String(v));
    if (norm(a) !== norm(b)) out[k] = [a, b];
  }
  return out;
}

/** Move many items at once. One write, one version check and one log entry per item that actually
 *  changed, rather than N round trips: a staff member closing out a pillar should not pay for
 *  sixteen sequential saves, and sixteen sequential saves against a versioned store would fail on
 *  the second one anyway. */
export async function saveMany(slug, ids, patch, current = {}, log = [], labelOf = () => null, version = null) {
  const at = new Date().toISOString();
  const next = { ...current };
  const entries = [];
  for (const id of ids) {
    const before = norm(current[id]);
    const after = norm({ ...current[id], ...patch, updated: at });
    const changed = ['status', 'visibility', 'note', 'agreement'].filter((k) => before[k] !== after[k]);
    if (!changed.length) continue;
    next[id] = after;
    entries.push({ at, id, label: labelOf(id), ...madeBy(),
      changed: Object.fromEntries(changed.map((k) => [k, [before[k], after[k]]])) });
  }
  if (!entries.length) return { map: current, log, durable: null, backend: null, changed: 0 };
  const nextLog = [...log, ...entries];

  if (supabase) {
    const rows = Object.keys(next).filter((id) => ids.includes(id)).map((id) => ({
      item_id: id, status: next[id].status, visibility: next[id].visibility, note: next[id].note,
      agreement: next[id].agreement ?? null,
    }));
    await deepdiveStateRequest('items', { slug, items: rows, entries });
    return { map: next, log: nextLog, durable: true, backend: 'netlify', changed: entries.length };
  }
  const wrote = await writeFileState(slug, next, nextLog, version);
  if (wrote) return { map: next, log: nextLog, durable: false, backend: 'file', version: wrote, changed: entries.length };
  const ok = writeLocal(slug, next);
  return { map: next, log: nextLog, durable: false, backend: 'local', changed: entries.length,
           stored: ok,   // the store's own verdict: see the note on saveItem's local return
           warning: ok ? null : 'This browser refused to store the change.' };
}

/** Write a state map wholesale. Used for RELEASING an id whose item has left the record: that is a
 *  deletion, not a patch, so it has no place in saveItem's per-item diffing. Kept narrow on purpose. */
/** @param added   the log entries THIS call is adding, so the trail is written on Supabase too.
 *  @param release  true only when the caller means to drop ids that have left the record. */
/** Drop the state of ONE id, and only that one.
 *
 *  ⚠ The alternative — replaceState(release: true) — deletes every row NOT in the browser's map,
 *  and that map is a snapshot from page load. With a second writer on the record (an MCP session is
 *  the normal case here) it deletes their work. That is acceptable-ish for a deliberate "this item
 *  left the record", where the map was just derived from the same read; it is completely wrong for a
 *  rename, which fires on an ordinary typo fix. Naming the one id is right in both cases. */
export async function releaseItem(slug, id, entry = null) {
  if (supabase) {
    await deepdiveStateRequest('release', { slug, id, entries: entry ? [entry] : [] });
    return { durable: true, backend: 'netlify' };
  }
  return null;   // the file backend has no single-row delete; the caller falls back to replaceState
}

export async function replaceState(slug, map, log, version = null, added = [], release = false) {
  if (supabase) {
    await deepdiveStateRequest('replace', { slug, release, keepIds: Object.keys(map), entries: added });
    return { durable: true, backend: 'netlify' };
  }
  const wrote = await writeFileState(slug, map, log, version);
  if (wrote) return { durable: false, backend: 'file', version: wrote };
  writeLocal(slug, map);
  return { durable: false, backend: 'local' };
}

// ── progress, which is the thing the client is actually shown ─────────────────────────────────
// Counted over a set of ids, so the same function serves "this pillar", "this process" and "overall".
// ── findings: what a session actually established ─────────────────────────────────────────────
//
// A question is not answered by a status flag. It is answered by something somebody said, and the
// value of that answer depends on knowing WHO said it and IN WHICH SESSION, which is the whole
// reason sessions are the instrument rather than a diary. So a finding is a first-class record:
// text, the question it answers, and the session it came out of.
//
// Findings live in the STATE file, not the plan. The plan is regenerated from the Investigation
// Plan document; a finding written in a room three weeks in must not be destroyed by that, and the
// separation has already been proven to survive a full restructure of the source.
//
// Several findings per question is deliberate. Two people give different accounts of the same
// process more often than not, and the disagreement is usually the finding.

const FIND_MAX = 4000;
// ── findings ──────────────────────────────────────────────────────────────────────────────────
//
// See ../data/deepdive-findings.mjs for what a finding is and why it is NEVER overwritten. This is
// the storage half: findings live in the STATE file, not the plan, so regenerating the plan from the
// Investigation Plan document cannot destroy an answer somebody was given in a room.

export { standing, historyFor, questionState } from '../data/deepdive-findings.mjs';

export const findingsFor = (findings, questionId) => (findings || []).filter((f) => f.questionId === questionId);
export const findingsFromSession = (findings, sessionId) => (findings || []).filter((f) => f.sessionId === sessionId);
export const answeredQuestionIds = (findings) => new Set((findings || []).map((f) => f.questionId));

const stamp = (findings) => `f:${new Date().toISOString().replace(/\D/g, '').slice(0, 17)}${String((findings || []).length + 1).padStart(2, '0')}`;
const shorten = (t) => (String(t).length > 90 ? String(t).slice(0, 90) + '\u2026' : String(t));

/** Record a finding. `supersedes` makes this an UPDATE to an earlier one: the earlier finding is
 *  marked superseded rather than edited away, so the change stays visible on the question. */
export async function addFinding(slug, input, current = {}, log = [], findings = [], version = null) {
  const { questionId, sessionId = null, supersedes = null, confidence, by = 'portal', label = null } = input;
  if (!questionId) throw new Error('A finding has to be against a question.');
  const { text, source } = validateFindingInput(input);

  const at = new Date().toISOString();
  const draft = normaliseFinding({
    id: stamp(findings), questionId, sessionId, text, source,
    sourceId: input.sourceId || null, confidence, supersedes, by, at,
    state: initialState(by),
    // The Finding Record fields: what it means, why it happens, what has to get better, and what
    // stands behind it or against it.
    evidenceIds: input.evidenceIds, challengedBy: input.challengedBy,
    rootCause: input.rootCause, impact: input.impact, desiredOutcome: input.desiredOutcome,
    opportunityId: input.opportunityId || null, baselineRequired: input.baselineRequired,
  });
  // ⚠ A PRACTITIONER'S OWN FINDING STILL NEEDS SOMETHING BEHIND IT. Anything typed in the Portal
  // used to start Validated unconditionally, so a conclusion written in a hurry with no session, no
  // source and no stated origin was indistinguishable a week later from one drawn from a transcript
  // and a system export. It is not rejected: it simply waits as `proposed` until somebody says
  // where it came from, which is the least disruptive way to make the gap visible.
  const state = draft.state === 'validated' && !canValidate(draft).ok ? 'proposed' : draft.state;
  const row = { ...draft, state, validatedAt: state === 'validated' ? at : null };

  let next = [...(findings || [])];
  let priorText = '';
  if (supersedes) {
    const prior = next.find((f) => f.id === supersedes);
    if (!prior) throw new Error('The finding this replaces is not in this record.');
    if (prior.questionId !== questionId) throw new Error('A finding can only supersede one on the same question.');
    priorText = prior.text;
    next = next.map((f) => (f.id === supersedes ? { ...f, state: 'superseded' } : f));
  }
  next.push(row);

  // ⚠ ...madeBy() — every sibling has it and this one did not, so the single most important event
  // in the record, a practitioner writing down what somebody said, was logged with no actor and
  // rendered as "Not signed in", while their later validation of the same finding named them.
  const nextLog = [...log, { at, id: questionId, label, ...madeBy(), by, findingId: row.id,
    changed: { finding: [shorten(priorText), shorten(text)] } }];
  return persist(slug, current, nextLog, next, version, nextLog.slice(log.length));
}

/** A practitioner's judgement on a proposed finding. Nothing an agent wrote is established until
 *  this happens, which is the point of a practitioner-led method. */
export async function judgeFinding(slug, findingId, verdict, note = '', current = {}, log = [], findings = [], version = null) {
  if (verdict !== 'validated' && verdict !== 'rejected') throw new Error('A verdict is validated or rejected.');
  const f = (findings || []).find((x) => x.id === findingId);
  if (!f) throw new Error('That finding is not in this record.');
  if (f.state === 'superseded') throw new Error('That finding has already been replaced by a later one.');
  // The Engine may suggest a finding. It must never validate one, and neither may a person with
  // nothing identifiable behind it.
  if (verdict === 'validated') {
    const gate = canValidate(f);
    if (!gate.ok) throw new Error(gate.why);
  }
  const at = new Date().toISOString();
  const next = (findings || []).map((x) => (x.id === findingId
    ? { ...x, state: verdict, validatedAt: at, note: String(note || '').trim() } : x));
  const nextLog = [...log, { at, id: f.questionId, label: null, ...madeBy(), findingId,
    changed: { validation: [f.state, verdict] } }];
  return persist(slug, current, nextLog, next, version, nextLog.slice(log.length));
}

/** Refine what Greatstone CONCLUDES from a finding, without touching what was said.
 *
 *  ⚠ THE TEXT IS NOT EDITABLE HERE, AND THAT IS THE WHOLE DISTINCTION. What somebody said is
 *  immutable: changing it means recording a NEW finding that supersedes this one, so the change
 *  stays visible on the question. What Greatstone concludes FROM it, the root cause, the impact,
 *  what would have to get better, is our analysis and is meant to sharpen as evidence accumulates.
 *  Ben's own record carries Draft and Refined states for exactly that.
 *
 *  Refining in place would still be a silent rewrite if nothing recorded it, so every change lands
 *  in the log with the hand that made it, the same as every other write in this record. */
export async function concludeFinding(slug, findingId, patch = {}, current = {}, log = [], findings = [], version = null) {
  const f = (findings || []).find((x) => x.id === findingId);
  if (!f) throw new Error('That finding is not in this record.');
  if (f.state === 'superseded') throw new Error('That finding has been replaced by a later one. Conclude on the one that stands.');
  const FIELDS = ['rootCause', 'impact', 'desiredOutcome', 'opportunityId', 'baselineRequired',
    'evidenceIds', 'challengedBy'];
  const asked = Object.fromEntries(Object.entries(patch).filter(([k]) => FIELDS.includes(k)));
  if (!Object.keys(asked).length) throw new Error('Nothing to conclude. Pass at least one of: ' + FIELDS.join(', '));

  const at = new Date().toISOString();
  const merged = normaliseFinding({ ...f, ...asked });
  const changed = {};
  for (const k of FIELDS) {
    const a = JSON.stringify(f[k] ?? null); const b = JSON.stringify(merged[k] ?? null);
    if (a !== b) changed[k] = [f[k], merged[k]];
  }
  if (!Object.keys(changed).length) return { current, log, findings, version };

  // ⚠ A CONCLUSION CAN REMOVE THE GROUND UNDER A VALIDATION. Dropping the last piece of supporting
  // evidence from an already-validated finding would leave it Validated with nothing behind it,
  // which is precisely what canValidate exists to prevent. It goes back to proposed rather than
  // silently keeping a status it no longer earns.
  const state = stateAfterConclusion(merged);
  const next = (findings || []).map((x) => (x.id === findingId
    ? { ...merged, state, validatedAt: state === 'validated' ? x.validatedAt : null } : x));
  if (state !== merged.state) changed.validation = [merged.state, state];

  const nextLog = [...log, { at, id: f.questionId, label: null, ...madeBy(), findingId, changed }];
  return persist(slug, current, nextLog, next, version, nextLog.slice(log.length));
}

export async function removeFinding(slug, findingId, current = {}, log = [], findings = [], version = null) {
  const gone = (findings || []).find((f) => f.id === findingId);
  if (!gone) throw new Error('That finding is not in this record.');
  const at = new Date().toISOString();
  const next = (findings || []).filter((f) => f.id !== findingId);
  const nextLog = [...log, { at, id: gone.questionId, label: null, ...madeBy(), findingId,
    changed: { finding: [shorten(gone.text), ''] } }];
  // The ONE caller that means to delete, naming the one row it means to delete.
  return persist(slug, current, nextLog, next, version, nextLog.slice(log.length), [findingId]);
}

/** One write path for anything that changes the state document, so findings, status and the log can
 *  never land in separate versions of the same file. */
async function persist(slug, map, log, findings, version, added = [], removedIds = []) {
  if (supabase) {
    await deepdiveStateRequest('findings', { slug, findings, removedIds, entries: added });
    return { map, log, findings, durable: true, backend: 'netlify' };
  }
  const wrote = await writeFileState(slug, map, log, version, findings);
  if (wrote) return { map, log, findings, durable: false, backend: 'file', version: wrote };
  // ⚠ `stored: ok` WAS A FALSE VERDICT HERE. writeLocal persists the STATUS MAP and nothing else —
  // no findings, no log — and loadState's local branch returns `findings: []` to prove it. This
  // function exists to save a FINDING, so localStorage succeeding says nothing about whether the
  // thing the caller asked to store went anywhere. It did not.
  writeLocal(slug, map);
  // ⚠ ONE STRING SERVED add, judge AND remove, so DELETING a finding announced "Nothing here can
  // store a finding, so it is on this screen only" — true about the store, and it reads as though
  // something had just been created. What a caller needs to know is the same fact either way: this
  // did not reach the record and will not survive a reload.
  return { map, log, findings, durable: false, backend: 'local',
           stored: false,
           warning: 'Nothing here can store findings, so this change is on this screen only and '
             + 'will not survive a reload. Run the dev server, or apply the deepdive migration.' };
}

/** Everything ever logged against one item, newest first: what the practitioner typed, what an agent
 *  proposed, and what was validated, in order. */
export async function attachFile(slug, entry, current = {}, log = [], findings = [], files = [], version = null) {
  const { id, label, mime, bytes, attachedTo } = entry;
  if (!id) throw new Error('An attachment needs a stored file.');
  const name = String(label || '').trim();
  if (!name) throw new Error('Give the document a name, so the record says what it is rather than what it was called.');
  const at = new Date().toISOString();
  const already = (files || []).find((f) => f.id === id);
  // The same bytes attached to a second item is one blob and one row with two ties, not a copy.
  const next = already
    ? (files || []).map((f) => (f.id === id
        ? { ...f, attachedTo: [...new Set([...(f.attachedTo || []), ...attachedTo])] } : f))
    : [...(files || []), { id, label: name, mime, bytes, at, ...madeBy(),
                           attachedTo: [...attachedTo], visibility: 'internal', note: '' }];
  const nextLog = [...log, { at, id: attachedTo[0], label: name, ...madeBy(),
                             changed: { document: ['', name] } }];

  if (supabase) {
    const row = next.find((f) => f.id === id);
    const back = await deepdiveStateRequest('attach', { slug,
      file: { ...row, originalName: entry.originalName, ext: entry.ext }, entries: nextLog.slice(log.length) });
    if (!(back || []).some((f) => f.id === id)) throw new Error('The record did not keep that document. Nothing has been attached.');
    return { files: back.map(fileRowToEntry), log: nextLog, version, backend: 'netlify' };
  }

  const wrote = await writeFileState(slug, current, nextLog, version, findings, next);
  if (!wrote) throw new Error('The document was stored but could not be recorded against the item.');
  // Read it back. A PUT that succeeds while silently dropping the payload is the worst outcome
  // available: the row appears on screen, the toast says Attached, and nothing was kept. This has
  // already happened once, because the writer was not sending the field at all.
  const back = await readFileState(slug);
  if (!(back?.files || []).some((f) => f.id === id)) {
    throw new Error('The record did not keep that document. Nothing has been attached.');
  }
  return { files: back.files, log: nextLog, version: back.version || wrote, backend: 'file' };
}

/** Take a document off ONE item.
 *
 *  ⚠ attachFile deliberately supports one blob with many ties: "the same bytes attached to a second
 *  item is one blob and one row with two ties, not a copy". detachFile did the opposite and deleted
 *  the whole row, so removing a spreadsheet from a question also removed it from the evidence item
 *  it was attached to, and the caller then destroyed the stored bytes. The tie is what is being
 *  removed; the document only goes when nothing points at it any more.
 *
 *  @returns {{..., blobUnused: boolean}} blobUnused says whether the caller may delete the bytes. */
export async function detachFile(slug, fileId, current = {}, log = [], findings = [], files = [], version = null, itemId = null) {
  const gone = (files || []).find((f) => f.id === fileId);
  if (!gone) throw new Error('That document is not in this record.');
  const at = new Date().toISOString();
  const ties = (gone.attachedTo || []).filter((x) => x !== itemId);
  // itemId null means "remove it from the record entirely", which is what a caller that does not
  // know the item can honestly ask for.
  const last = !itemId || ties.length === 0;
  const next = last
    ? (files || []).filter((f) => f.id !== fileId)
    : (files || []).map((f) => (f.id === fileId ? { ...f, attachedTo: ties } : f));
  const nextLog = [...log, { at, id: itemId || (gone.attachedTo || [])[0], label: gone.label, ...madeBy(),
                             changed: { document: [gone.label, ''] } }];

  if (supabase) {
    await deepdiveStateRequest('detach', { slug, id: fileId, last, ties, entries: nextLog.slice(log.length) });
    return { files: next, log: nextLog, version, backend: 'netlify', blobUnused: last };
  }

  const wrote = await writeFileState(slug, current, nextLog, version, findings, next);
  if (wrote) return { files: next, log: nextLog, version: wrote, blobUnused: last };
  throw new Error('The document could not be removed from the record.');
}

export const historyOf = (log, itemId) => (log || []).filter((e) => e.id === itemId).slice().reverse();

export function progressOf(map, ids) {
  const counts = { open: 0, active: 0, done: 0, blocked: 0 };
  ids.forEach((id) => { counts[stateOf(map, id).status] += 1; });
  const total = ids.length;
  // Under way counts half: a bar that only moves on completion reads as stalled for weeks at a time,
  // and a bar that counts started work as finished overstates. Half is the honest middle.
  const pct = total ? Math.round(((counts.done + counts.active * 0.5) / total) * 100) : 0;
  return { ...counts, total, pct, complete: counts.done === total && total > 0 };
}
