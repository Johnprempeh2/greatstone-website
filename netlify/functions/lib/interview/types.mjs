// Port of SOURCE src/lib/types.ts @505ba6a.
// Port: the source is almost entirely TypeScript types. Pure types are dropped; the key shapes are kept
// as JSDoc typedefs below for editor hints. The only runtime export, createInitialTaxonomyState, is
// ported unchanged.

/**
 * Shared types for the Parallel Discovery Agent.
 *
 * Enums mirror supabase/migrations/0001_init.sql exactly (the database is
 * the source of truth for stored values). TaxonomyState mirrors section 3.2
 * of docs/taxonomy-synthesis-contract.md (the contract is the source of
 * truth for the JSON the interview agent maintains). Note the two phase
 * vocabularies differ deliberately: the DB enum is the storage value
 * (`warmup`, `day_in_life`, `automation`); the contract's taxonomy_state uses
 * its own labels (`warm_up`, `day_in_the_life`, `automation_surfacing`).
 */

/** @typedef {'gs_admin' | 'client_admin' | 'team_leader' | 'employee'} PortalRole */
/** @typedef {'invited' | 'started' | 'completed' | 'declined'} EmployeeStatus */
/** @typedef {'warmup' | 'day_in_life' | 'pain_mapping' | 'automation' | 'sign_off'} SessionPhase */
/** @typedef {'agent' | 'user'} TurnRole */
/** @typedef {'task' | 'pain' | 'automation_candidate' | 'escalation'} InsightType */
/** @typedef {'participation' | 'attribution' | 'memory_opt_in' | 'withdrawal'} ConsentKind */
/** @typedef {'empty' | 'partial' | 'filled'} SlotStatus */
/** @typedef {'warm_up' | 'day_in_the_life' | 'pain_mapping' | 'automation_surfacing' | 'sign_off'} TaxonomyPhase */
/** @typedef {'ask_open' | 'probe_deeper' | 'quantify_time' | 'request_example' | 'propose_candidate' | 'advance_phase' | 'read_back' | 'ask_memory_opt_in' | 'close'} NextAction */
/** @typedef {'on_pace' | 'running_long' | 'running_short'} PaceFlag */
/** @typedef {{ id: string, client_name: string, status: string, created_at: string, [k: string]: any }} Engagement */
/** @typedef {{ id: string, engagement_id: string, parent_id: string | null, name: string, kind: string, path: string, seat_allocation: number | null, created_at: string }} OrgUnit */
/** @typedef {{ id: string, engagement_id: string, person_id: string | null, unit_id: string | null, name: string, email: string, role_title: string | null, portal_role: PortalRole, status: EmployeeStatus, [k: string]: any }} Employee */
/** @typedef {{ id: string, session_id: string, role: TurnRole, content: string, ts: string, seq: number, client_turn_id: string | null, extracted_fields: object | null }} Turn */
/** @typedef {{ id: string, session_id: string, type: InsightType, label: string, evidence_quote: string | null, time_per_week_hours: number | null, confidence: number | null, attribution_redacted: boolean, second_hand: boolean }} Insight */
/** @typedef {Record<TaxonomyPhase, Record<string, SlotStatus>>} TaxonomySlots */
/**
 * The interview agent's live state object, persisted to session.taxonomy_state.
 * @typedef {{ phase: TaxonomyPhase, slots: TaxonomySlots, completion_score: number, next_action: NextAction,
 *   open_threads?: string[], insights_extracted?: number, escalation_pending?: boolean, elapsed_minutes: number,
 *   pace_flag?: PaceFlag, prefilled_from_invite?: { source: 'invite', name: string, role_title: string | null, unit_name: string | null } }} TaxonomyState
 */

/**
 * A fresh taxonomy_state for a brand-new session, initialised per the
 * contract shape: warm_up phase, every slot empty, nothing scored yet.
 *
 * When the invitation record carries known facts (`prefill`), the warm-up
 * role_confirmed slot starts at `partial` if a role title is on file — the
 * fact is known but not yet confirmed in conversation; the extractor
 * ratchets it to `filled` once the participant confirms. The provenance
 * lands in state.prefilled_from_invite so a prefilled slot is always
 * explainable after the fact.
 *
 * @param {{ name: string, role_title: string | null, unit_name: string | null }} [prefill]
 * @returns {TaxonomyState}
 */
export function createInitialTaxonomyState(prefill) {
  const state = {
    phase: 'warm_up',
    slots: {
      warm_up: {
        role_confirmed: 'empty',
        tenure_and_team: 'empty',
        rapport_established: 'empty',
        mode_confirmed: 'empty',
      },
      day_in_the_life: {
        daily_tasks: 'empty',
        weekly_monthly_cycles: 'empty',
        tools_inventory: 'empty',
        handoffs_in_out: 'empty',
      },
      pain_mapping: {
        top_pains_named: 'empty',
        time_costs_quantified: 'empty',
        severity_probed: 'empty',
        dependencies_mapped: 'empty',
      },
      automation_surfacing: {
        candidates_proposed: 'empty',
        candidates_reacted: 'empty',
        feasibility_signals: 'empty',
      },
      sign_off: {
        insights_read_back: 'empty',
        corrections_taken: 'empty',
        attribution_preference: 'empty',
        memory_opt_in_asked: 'empty',
      },
    },
    completion_score: 0,
    next_action: 'ask_open',
    open_threads: [],
    insights_extracted: 0,
    escalation_pending: false,
    elapsed_minutes: 0,
    pace_flag: 'on_pace',
  };

  if (prefill) {
    state.prefilled_from_invite = {
      source: 'invite',
      name: prefill.name,
      role_title: prefill.role_title,
      unit_name: prefill.unit_name,
    };
    if (prefill.role_title?.trim()) {
      // Known from the invite but unconfirmed in conversation: partial, so
      // the warm-up still confirms it naturally before the slot fills.
      state.slots.warm_up.role_confirmed = 'partial';
    }
  }

  return state;
}
