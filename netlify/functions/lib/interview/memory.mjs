// Port of SOURCE src/lib/memory.ts @505ba6a. The source already took the data client as its first
// argument, so callers pass an interviewDb client. Port: TypeScript types stripped, imports point at
// sibling .mjs files. Port: memory is per person AND per website organisation (customer_id), so what
// someone said for one client never opens their interview for another: loadActiveMemoryBlob takes the
// customer id, and the person is resolved by Better Auth user id (employee.user_id), not by email.

/**
 * Sign-off consent persistence and per-person memory (Wave 5A).
 *
 * Implements the two consent moments of the read-back screen against the
 * schema in supabase/migrations/0001_init.sql and the MemoryBlob rules in
 * docs/taxonomy-synthesis-contract.md section 1.8:
 *
 *   - consent_event rows are APPEND-ONLY: every confirmation appends a fresh
 *     attribution and memory_opt_in pair; the latest event of each kind wins.
 *   - Attribution is applied to ALL of the session's insight rows:
 *     Anonymised sets attribution_redacted = true, Named sets it back to
 *     false. Application is idempotent — re-running with the same choice is
 *     a no-op in effect.
 *   - Memory is strictly opt-in and SUMMARY-LEVEL ONLY: role title, unit
 *     name, top pains with hours, top automation candidates and
 *     working-style notes from taxonomy_state. Never the transcript, never
 *     verbatim quotes, never the client company's name. Opt-in builds or
 *     merges the person's memory_blob with a 24-month expiry; opt-out
 *     HARD-DELETES the row — the honest reading of "no, start fresh".
 *
 * Memory is keyed by (person_id, customer_id): the identity above the
 * per-engagement employee record, within one website organisation. An
 * employee row claimed at join may not carry a person link yet, so opt-in
 * resolves-or-creates the person row by the Better Auth user id
 * (employee.user_id) and backfills employee.person_id.
 */

import { ensurePersonForUser } from './provision.mjs';
import {
  applySlotUpdates,
  computeCompletionScore,
  normaliseTaxonomyState,
} from './interview.mjs';
import { attributionRedacted, parseQuoteChoice } from './quotes.mjs';

/** @typedef {'named' | 'anonymised'} AttributionChoice */
/**
 * GRE-2653: quotes is the three-way choice ('none' | 'anonymous' | 'named'); nothing is pre-selected, so it is
 * required. The source's two-way `attribution` is still read ('anonymised' = 'anonymous') when quotes is absent.
 * @typedef {{ quotes?: 'none' | 'anonymous' | 'named', attribution?: AttributionChoice, memory: boolean }} SignOffChoice
 */

/** Retention window for an opted-in memory blob. */
export const MEMORY_RETENTION_MONTHS = 24;

// ─── MemoryBlob shape (summary-level, contract section 1.8) ──────────────────

/**
 * @typedef {{ version: 1, source_session_id: string, role_title: string | null, unit_name: string | null,
 *   top_pains: Array<{ label: string, hours_per_week: number | null }>, automation_candidates: string[],
 *   working_style_notes: string[], summarised_at: string }} MemoryBlobContent
 */

/**
 * Distil one session into the summary-level blob. Inputs are insight LABELS
 * (the extractor's neutral summaries) and taxonomy_state fields — never the
 * transcript and never evidence quotes, per contract 1.8.
 *
 * @param {{ sessionId: string, roleTitle: string | null, unitName: string | null,
 *   insights: Array<{ type: string, label: string, time_per_week_hours: number | null, confidence: number | null }>,
 *   state: import('./types.mjs').TaxonomyState | null }} params
 * @returns {MemoryBlobContent}
 */
export function buildMemoryBlob(params) {
  const { sessionId, roleTitle, unitName, insights, state } = params;

  const seen = new Set();
  const dedupe = (items) =>
    items.filter((i) => {
      const key = i.label.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const pains = dedupe(
    insights
      .filter((i) => i.type === 'pain')
      .sort(
        (a, b) =>
          (b.time_per_week_hours ?? -1) - (a.time_per_week_hours ?? -1) ||
          (b.confidence ?? 0) - (a.confidence ?? 0)
      )
  )
    .slice(0, 3)
    .map((i) => ({ label: i.label, hours_per_week: i.time_per_week_hours }));

  seen.clear();
  const candidates = dedupe(
    insights
      .filter((i) => i.type === 'automation_candidate')
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
  )
    .slice(0, 3)
    .map((i) => i.label);

  // Working-style notes: the open threads the interviewer was still holding
  // (short, neutral phrases) — the only prose-like signal in taxonomy_state.
  const notes = (state?.open_threads ?? [])
    .filter((t) => typeof t === 'string' && t.trim().length > 0)
    .slice(0, 5);

  return {
    version: 1,
    source_session_id: sessionId,
    role_title: roleTitle,
    unit_name: unitName,
    top_pains: pains,
    automation_candidates: candidates,
    working_style_notes: notes,
    summarised_at: new Date().toISOString(),
  };
}

/**
 * Merge a fresh session blob over an existing one: the new role/unit win,
 * pains and candidates are unioned (new first, deduped by label) and
 * re-capped at three, notes likewise. A second conversation refines the
 * memory rather than wiping it.
 *
 * @param {Partial<MemoryBlobContent> | null} existing
 * @param {MemoryBlobContent} fresh
 * @returns {MemoryBlobContent}
 */
export function mergeMemoryBlob(existing, fresh) {
  if (!existing || typeof existing !== 'object') return fresh;

  const painSeen = new Set();
  const pains = [...fresh.top_pains, ...(existing.top_pains ?? [])]
    .filter((p) => {
      const key = (p?.label ?? '').trim().toLowerCase();
      if (!key || painSeen.has(key)) return false;
      painSeen.add(key);
      return true;
    })
    .slice(0, 3);

  const candSeen = new Set();
  const candidates = [
    ...fresh.automation_candidates,
    ...(existing.automation_candidates ?? []),
  ]
    .filter((label) => {
      const key = (label ?? '').trim().toLowerCase();
      if (!key || candSeen.has(key)) return false;
      candSeen.add(key);
      return true;
    })
    .slice(0, 3);

  const noteSeen = new Set();
  const notes = [...fresh.working_style_notes, ...(existing.working_style_notes ?? [])]
    .filter((n) => {
      const key = (n ?? '').trim().toLowerCase();
      if (!key || noteSeen.has(key)) return false;
      noteSeen.add(key);
      return true;
    })
    .slice(0, 5);

  return {
    ...fresh,
    top_pains: pains,
    automation_candidates: candidates,
    working_style_notes: notes,
  };
}

// ─── Memory read-back (interview hydration, Wave 5B) ─────────────────────────

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Load the person's memory blob for interview hydration: only an opted-in,
 * unexpired row for THIS organisation counts. Returns null when there is no
 * valid blob (or no organisation), in which case the interviewer uses the
 * cold opening.
 *
 * @param {any} db interviewDb client
 * @param {string} personId
 * @param {string} customerId the round's website organisation (engagement.customer_id)
 * @returns {Promise<Partial<MemoryBlobContent> | null>}
 */
export async function loadActiveMemoryBlob(db, personId, customerId) {
  if (!personId || !customerId) return null;
  const { data, error } = await db
    .from('memory_blob')
    .select('blob')
    .eq('person_id', personId)
    .eq('customer_id', customerId)
    .eq('opted_in', true)
    .gt('expires_at', new Date().toISOString())
    .limit(1);
  if (error) {
    // Memory is an enhancement, never a gate: a failed lookup degrades to
    // the cold opening rather than failing the turn.
    console.warn(`memory blob lookup failed: ${error.message}`);
    return null;
  }
  const blob = data?.[0]?.blob;
  return blob && typeof blob === 'object' ? blob : null;
}

/**
 * Render a blob as the short plain-text block substituted for the
 * {{MEMORY_BLOB}} template variable. Summary-level fields only, per contract
 * section 1.8: the block never contains the client company's name, quotes or
 * anything about colleagues, so the prompt's person-level rules hold by
 * construction. The participant's own name comes from their employee row
 * (the blob itself stores none) so the memory-hydrated opening can fill its
 * [name] placeholder. The first line tells the interviewer plainly that the
 * blob is present; without it the model tends to fall back to the cold
 * opening. Returns null for a blob with nothing usable in it.
 *
 * @param {Partial<MemoryBlobContent>} blob
 * @param {{ participantName?: string | null }} [opts]
 * @returns {string | null}
 */
export function renderMemoryBlob(blob, opts) {
  const pains = (blob.top_pains ?? []).filter((p) => p?.label?.trim());
  const candidates = (blob.automation_candidates ?? []).filter((c) => c?.trim());
  const notes = (blob.working_style_notes ?? []).filter((n) => n?.trim());
  if (!blob.role_title && pains.length === 0 && candidates.length === 0) return null;

  const lines = [
    'A memory blob IS present: this is a returning participant who opted in to memory ' +
      'last time. Use the memory-hydrated opening, NOT the cold opening.',
  ];

  if (opts?.participantName?.trim()) {
    lines.push(`Their name: ${opts.participantName.trim()}.`);
  }
  const summarised = blob.summarised_at ? new Date(blob.summarised_at) : null;
  if (summarised && !Number.isNaN(summarised.getTime())) {
    lines.push(
      `Last conversation: ${MONTH_NAMES[summarised.getUTCMonth()]} ${summarised.getUTCFullYear()}.`
    );
  }
  if (blob.role_title) {
    lines.push(
      `Role then: ${blob.role_title}${blob.unit_name ? `, in ${blob.unit_name}` : ''}.`
    );
  } else if (blob.unit_name) {
    lines.push(`Unit then: ${blob.unit_name}.`);
  }
  if (pains.length > 0) {
    lines.push(
      'Pains they raised last time, most significant first (verify, do not rediscover):'
    );
    for (const p of pains) {
      const hours =
        p.hours_per_week !== null && p.hours_per_week !== undefined
          ? ` (about ${p.hours_per_week} hours/week)`
          : '';
      lines.push(`- ${p.label}${hours}`);
    }
  }
  if (candidates.length > 0) {
    lines.push('Automation candidates they suggested:');
    for (const c of candidates) lines.push(`- ${c}`);
  }
  if (notes.length > 0) {
    lines.push('Working-style notes:');
    for (const n of notes) lines.push(`- ${n}`);
  }
  return lines.join('\n');
}

// ─── Person resolution ───────────────────────────────────────────────────────

/**
 * Resolve the person_id for an employee, creating the person row (and
 * backfilling employee.person_id) when the link is missing. Matching is by
 * the Better Auth user id (employee.user_id) — the identity rule from the
 * schema. An unclaimed invitation (no user_id) has no person.
 *
 * @param {any} db interviewDb client
 * @param {{ id: string, person_id: string | null, user_id: string | null, email: string, name: string }} employee
 * @returns {Promise<string>}
 */
export async function ensurePersonForEmployee(db, employee) {
  if (employee.person_id) return employee.person_id;
  if (!employee.user_id) throw new Error('person lookup failed: the employee row has not been claimed by a signed-in user');

  const personId = await ensurePersonForUser(db, {
    userId: employee.user_id,
    email: employee.email,
    name: employee.name,
  });

  const { error: linkError } = await db
    .from('employee')
    .update({ person_id: personId })
    .eq('id', employee.id);
  if (linkError) throw new Error(`person link failed: ${linkError.message}`);

  return personId;
}

// ─── The sign-off application ────────────────────────────────────────────────

/**
 * @typedef {{ attributionRedacted: boolean, memoryOptedIn: boolean, personId: string | null }} SignOffApplication
 * personId: person_id touched by the memory decision, when one was resolved.
 */

/**
 * Persist one confirmed sign-off: append the consent_event pair, apply the
 * attribution choice to every insight row of the session, apply the memory
 * decision (build/merge blob on opt-in, hard-delete on opt-out) and ratchet
 * the session's sign-off slots. Idempotent in effect: confirming the same
 * choices twice leaves the database in the same state (plus the append-only
 * consent trail, which is the point of a trail).
 *
 * @param {any} db interviewDb client
 * @param {{ employee: { id: string, person_id: string | null, user_id: string | null, customer_id: string,
 *     email: string, name: string, role_title: string | null },
 *   unitName: string | null, sessionId: string, choice: SignOffChoice }} params
 * @returns {Promise<SignOffApplication>}
 */
export async function applySignOffConsent(db, params) {
  const { employee, unitName, sessionId, choice } = params;
  // GRE-2653: one of three quote choices must be made; there is no default at confirm time.
  const quotes = parseQuoteChoice(choice?.quotes ?? choice?.attribution);
  if (!quotes) throw Object.assign(new Error('Choose how your quotes may be used.'), { code: 'QUOTE_CHOICE_REQUIRED' });
  const anonymised = attributionRedacted(quotes);
  const customerId = employee.customer_id;
  if (!customerId) throw new Error('sign-off failed: the employee row carries no organisation');

  // 1. Append-only consent trail: one event per question, every confirm.
  const { error: consentError } = await db.from('consent_event').insert([
    { employee_id: employee.id, kind: 'quotes', value: quotes !== 'none', choice: quotes },
    { employee_id: employee.id, kind: 'attribution', value: !anonymised },
    { employee_id: employee.id, kind: 'memory_opt_in', value: choice.memory },
  ]);
  if (consentError) {
    throw new Error(`consent events failed: ${consentError.message}`);
  }
  const { error: choiceError } = await db.from('employee').update({ quote_choice: quotes }).eq('id', employee.id);
  if (choiceError) throw new Error(`quote choice failed: ${choiceError.message}`);

  // 2. Attribution applied to ALL the session's insights, both directions.
  const { error: redactError } = await db
    .from('insight')
    .update({ attribution_redacted: anonymised })
    .eq('session_id', sessionId);
  if (redactError) {
    throw new Error(`attribution apply failed: ${redactError.message}`);
  }

  // 3. Memory decision.
  let personId = null;
  if (choice.memory) {
    personId = await ensurePersonForEmployee(db, employee);

    const { data: insightRows, error: insightError } = await db
      .from('insight')
      .select('type, label, time_per_week_hours, confidence')
      .eq('session_id', sessionId);
    if (insightError) {
      throw new Error(`insight load for memory failed: ${insightError.message}`);
    }

    const { data: sessionRows, error: sessionError } = await db
      .from('session')
      .select('taxonomy_state')
      .eq('id', sessionId)
      .limit(1);
    if (sessionError) {
      throw new Error(`session load for memory failed: ${sessionError.message}`);
    }
    const rawState = sessionRows?.[0]?.taxonomy_state;
    const state = rawState ? normaliseTaxonomyState(rawState) : null;

    const fresh = buildMemoryBlob({
      sessionId,
      roleTitle: employee.role_title,
      unitName,
      insights: insightRows ?? [],
      state,
    });

    const { data: existingBlobRows, error: blobLookupError } = await db
      .from('memory_blob')
      .select('blob')
      .eq('person_id', personId)
      .eq('customer_id', customerId)
      .limit(1);
    if (blobLookupError) {
      throw new Error(`memory lookup failed: ${blobLookupError.message}`);
    }
    const existing = existingBlobRows?.[0]?.blob ?? null;

    const now = new Date();
    const expires = new Date(now);
    expires.setMonth(expires.getMonth() + MEMORY_RETENTION_MONTHS);

    const { error: upsertError } = await db.from('memory_blob').upsert(
      {
        person_id: personId,
        customer_id: customerId,
        blob: mergeMemoryBlob(existing, fresh),
        opted_in: true,
        opted_in_at: now.toISOString(),
        expires_at: expires.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: 'person_id,customer_id' }
    );
    if (upsertError) throw new Error(`memory write failed: ${upsertError.message}`);
  } else {
    // Opt-out: delete this organisation's row entirely. Resolve the person
    // WITHOUT creating one — a person who never opted in has nothing to delete.
    personId = employee.person_id;
    if (!personId && employee.user_id) {
      const { data: people } = await db
        .from('person')
        .select('person_id')
        .eq('auth_user_id', employee.user_id)
        .limit(1);
      personId = people?.[0]?.person_id ?? null;
    }
    if (personId) {
      const { error: deleteError } = await db
        .from('memory_blob')
        .delete()
        .eq('person_id', personId)
        .eq('customer_id', customerId);
      if (deleteError) throw new Error(`memory delete failed: ${deleteError.message}`);
    }
  }

  // 4. Ratchet the sign-off slots: the read-back happened and both consent
  //    questions now have recorded answers. Slot updates only ever ratchet
  //    upward, so this never regresses anything the interview already set.
  const { data: sessions, error: stateLookupError } = await db
    .from('session')
    .select('taxonomy_state')
    .eq('id', sessionId)
    .limit(1);
  if (!stateLookupError && sessions?.[0]) {
    const state = normaliseTaxonomyState(sessions[0].taxonomy_state);
    state.slots = applySlotUpdates(state.slots, {
      sign_off: {
        insights_read_back: 'filled',
        attribution_preference: 'filled',
        memory_opt_in_asked: 'filled',
      },
    });
    state.completion_score = computeCompletionScore(state.slots);
    const { error: stateError } = await db
      .from('session')
      .update({ taxonomy_state: state, completion_score: state.completion_score })
      .eq('id', sessionId);
    if (stateError) console.warn(`sign-off state persist failed: ${stateError.message}`);
  }

  return { attributionRedacted: anonymised, quoteChoice: quotes, memoryOptedIn: choice.memory, personId };
}
