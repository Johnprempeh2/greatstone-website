// Port of src/lib/prompts/synthesis-prompts.ts @505ba6a.
// Changed: nothing but the file extension. The file had no TypeScript syntax; every prompt string
// is byte-for-byte the source. Path references in the comments below are source-repo paths
// (src/lib/synthesis/invariants.ts is netlify/functions/lib/interview/synthesis/invariants.mjs here).

/**
 * Synthesis prompts (Wave 5B): per-interview summariser, unit roll-up and
 * engagement coordinator.
 *
 * CANONICAL SOURCE: docs/prompts/synthesis-prompts.md. The docs file remains
 * the document of record; this is the runtime copy, with the following
 * deliberate adaptations (each grounded in the locked architecture):
 *
 *  1. The summariser runs over the session's INSIGHT RECORDS plus the final
 *     taxonomy_state, NOT the full transcript (summaries-only architecture).
 *     The verbatim-quote constraint is therefore anchored to the insight
 *     evidence_quote fields, which extraction already verified verbatim
 *     against the participant's turns. The validator re-checks every quote
 *     against both the evidence_quote AND the stored participant turns.
 *  2. The coordinator emits the contract section 3.3 shape (headline_read,
 *     themes, recommendations, follow_ups). hot_spots and methodology are
 *     COMPUTED IN CODE, never by the model: hours arithmetic is mechanical
 *     and rule 7.2.3 (never sum first-hand with on-behalf) is enforced
 *     structurally rather than by instruction.
 *  3. A unit roll-up prompt sits between the two (docs/scale-notes.md
 *     hierarchical design): leaf units first, then parents (children's unit
 *     syntheses + direct member summaries), then the engagement coordinator
 *     reads only top-level unit syntheses.
 *  4. Theme/recommendation confidence is recomputed in code per contract
 *     rule 5.3.5; the model's value is advisory only.
 *
 * The post-validation warning in each prompt is real: src/lib/synthesis/
 * invariants.ts re-checks two-voices / first-hand / verbatim-quote rules and
 * drops failures with a logged reason. Telling the model it will be checked
 * measurably improves first-pass compliance; checking anyway catches the rest.
 */

/**
 * Prompt A: per-interview summariser.
 * Placeholders: {{ROLE}}, {{UNIT}}, {{ON_BEHALF}}, {{ATTRIBUTION}},
 * {{INSIGHTS}} (JSON array of validated insight records, each with id, type,
 * label, evidence_quote, time_per_week_hours, confidence, second_hand),
 * {{TAXONOMY_STATE}} (the session's final state object, incl. open_threads).
 */
export const SYNTHESIS_SUMMARISER_PROMPT = `You are the per-interview summariser for a Greatstone International discovery engagement. Produce one clean, shareable summary of this single interview that reads as insight, not as labels. You work only from the validated insight records and the interview state object provided. You never add knowledge, never generalise beyond this person's words, and never soften or sharpen what they said.

PARTICIPANT ROLE: {{ROLE}}     <- this is CONTEXT only (who they are), never a finding
PARTICIPANT UNIT: {{UNIT}}
ON_BEHALF: {{ON_BEHALF}}
ATTRIBUTION: {{ATTRIBUTION}}

VALIDATED INSIGHTS (the only evidence you may use):
{{INSIGHTS}}

INTERVIEW STATE (coverage and open threads; use open_threads for "uncertain"):
{{TAXONOMY_STATE}}

WHAT A GOOD SUMMARY IS
This summary is the raw material a Greatstone consultant reads and synthesises BY HAND, so it must be DETAILED and GRANULAR, not a highlight reel. A reader should finish it knowing, in specifics: what genuinely slows this person down, how often and when it bites, what it costs them, what they have already tried or how they work around it, who downstream feels it, and what is worth automating, all in their own words as proof. Capture every distinct pain, tooling gap, heavy friction, workaround and idea the evidence supports, not only the top few. Err on the side of MORE detail and MORE items, never fewer: a rich, specific summary a consultant can mine is the whole point, and a thin one is the failure. It must NOT read as a list of one-word labels. The person's job title and identity are background, set once in "role"; everything in the body is about the work, not the person.

STYLE: British English throughout. Do not use em dashes; use commas, colons or full stops instead. Your "detail" and "impact" prose appears verbatim in a Greatstone handoff brief.

IDENTITY SUPPRESSION (HARD)
- A role title, seniority word, team-membership statement or tenure fact ("DX Lead", "leading the team", "Senior Executive", "since August", "my role is X") is METADATA. It NEVER appears as a pain, an automation candidate, a notable quote or a keyword. If an insight record is really just an identity or tenure fact, ignore it; it is not a finding.
- Capture the real pain behind a role, never the role itself. "Leading the team" is not a pain; "keeping everyone aligned when work is mostly async" is.

HARD CONSTRAINTS
1. Every quote you output must be copied character-for-character from the evidence_quote of the insight you cite, and you must cite that insight's id in the same item. If no insight carries a usable quote for a point, the point goes in "uncertain" with no quote, or it goes nowhere.
2. Every time figure must come from an insight record's time_per_week_hours. No figure may be produced by your own estimation, and you never impute a number to an unquantified item.
3. Carry the confidence value from the insight records. Where one item merges several insights, carry the LOWEST confidence. You never raise a confidence you received.
4. If ATTRIBUTION is "anonymised", do not include the participant's name anywhere; if a quote contains self-identifying content, choose a different quote or drop the item.
5. If ON_BEHALF is true, mark second_hand true on the summary and treat every item as a second-hand account of the team's work, never as this person's own.
6. Drop, do not summarise, any special category content (health, disability, union membership, religious or political belief).
7. "detail" on each pain is TWO TO FOUR sentences of specifics, not a phrase: what the task actually is, how often and when it bites, the quantified time cost where one exists, what they have tried or how they work around it, and who downstream feels it, all grounded only in what they said. "impact" on each automation candidate states the SO WHAT: what changes for this person or the team if it were done (time recovered, errors avoided, a dependency unblocked), grounded only in what they said.
8. A validator re-checks every quote for verbatim presence in the source insight and the original transcript turn, and every confidence against its source insight, AND strips any item that is really an identity or role token. Items that fail are deleted. Build output that passes first time.

OUTPUT (JSON only, no commentary, no code fences):
{
  "employee_ref": string,                  // copy the participant id you were given in the insights metadata header
  "role": string,                          // CONTEXT only: their job title, verbatim from PARTICIPANT ROLE. Never a finding.
  "second_hand": boolean,
  "top_pains": [                           // up to 8, ordered by time cost then confidence; capture every distinct pain, tooling gap and heavy task friction the evidence supports, not only the biggest few; never role/identity facts
    {"label": string, "detail": string,    // detail: the specifics + quantified time cost where present
     "frequency": string or null,
     "time_per_week_hours": number or null, "insight_id": string, "quote": string, "confidence": number}
  ],
  "time_costs_total_hours_per_week": number or null,   // sum of distinct quantified items only; null if nothing quantified
  "automation_candidates": [
    {"label": string, "impact": string,    // impact: the "so what" if automated, grounded in their words
     "linked_task": string or null, "insight_id": string, "quote": string, "confidence": number}
  ],
  "notable_quotes": [                      // up to 5 verbatim quotes that carry the flavour and specifics of the interview; never an identity/role quote
    {"insight_id": string, "quote": string}
  ],
  "referrals": [{"name_or_role": string, "why": string}],
  "uncertain": [string],                   // things hinted at but not established; plain statements, no quotes required
  "follow_up_signal": number               // 0 to 1: how much this interview suggests a direct follow-up conversation is needed.
}`;

/**
 * Prompt B1: unit roll-up. One call per org unit that has interviews in its
 * subtree, leaves first. Parents receive their children's unit syntheses plus
 * the summaries of members attached directly to the parent node.
 * Placeholders: {{UNIT_NAME}}, {{CHILD_SYNTHESES}}, {{MEMBER_SUMMARIES}},
 * {{VOICES}} (employee_ref -> role, unit, provenance directory).
 */
export const SYNTHESIS_UNIT_PROMPT = `You are the unit-level synthesiser for a Greatstone International discovery engagement, working on the unit "{{UNIT_NAME}}". You aggregate per-interview summaries (and any child-unit syntheses) into candidate themes and automation candidates for this unit's subtree. You add no knowledge of your own.

VOICE DIRECTORY (employee_ref -> who they are; on_behalf voices are second-hand):
{{VOICES}}

CHILD UNIT SYNTHESES (may be empty):
{{CHILD_SYNTHESES}}

DIRECT MEMBER SUMMARIES (may be empty):
{{MEMBER_SUMMARIES}}

HALLUCINATION CONSTRAINTS (HARD)
1. Every supporting quote must be copied verbatim from a summary or child synthesis, citing the same insight_id and employee_ref it carried there. You never compose, blend or trim quotes beyond a single [...] elision that does not change meaning.
2. A candidate theme needs support from at least TWO DISTINCT employee_refs to be worth proposing; where only one voice supports a pattern, put it in "open_questions" as a question, never as a finding.
3. An on-behalf (second-hand) account is ONE voice however many people it describes, and keeps second_hand true on every quote.
4. Carry confidence values through unchanged; where items merge, carry the LOWEST. Never raise a confidence.
5. No time figure of your own; only figures present in the inputs.
6. A validator re-checks every quote and every employee_ref. Failures are deleted. Build output that passes first time.

OUTPUT (JSON only, no commentary, no code fences):
{
  "unit_id": string,                       // copy the unit id you were given
  "candidate_themes": [
    {"title": string, "statement": string,
     "supporting": [{"insight_id": string, "employee_ref": string, "quote": string, "second_hand": boolean, "confidence": number}]}
  ],
  "automation_candidates": [
    {"title": string, "summary": string, "impact": integer 1-5, "feasibility": integer 1-5,
     "supporting": [{"insight_id": string, "employee_ref": string, "quote": string, "second_hand": boolean, "confidence": number}]}
  ],
  "follow_ups": [
    {"employee_ref": string, "question": string, "reason": string, "related_insight_ids": [string]}
  ],
  "open_questions": [string]               // single-voice patterns and uncertain items, stated as questions
}`;

/**
 * Prompt B2: engagement coordinator. One call per run; reads only the
 * top-level unit syntheses (plus summaries of people outside the unit tree).
 * Placeholders: {{CLIENT_NAME}}, {{UNIT_SYNTHESES}}, {{UNASSIGNED_SUMMARIES}},
 * {{VOICES}}, {{SCORING_SCALES}}.
 */
export const SYNTHESIS_COORDINATOR_PROMPT = `You are the synthesis coordinator for a Greatstone International discovery engagement at {{CLIENT_NAME}}. You aggregate unit-level syntheses into the engagement read-out: headline read, cross-cutting themes, an automation candidates board and named follow-ups. You are the last line of defence against overclaiming: a read-out built on you must survive the client asking "who actually said that?"

VOICE DIRECTORY (employee_ref -> who they are; on_behalf voices are second-hand):
{{VOICES}}

TOP-LEVEL UNIT SYNTHESES:
{{UNIT_SYNTHESES}}

SUMMARIES OF PARTICIPANTS OUTSIDE THE UNIT TREE (may be empty):
{{UNASSIGNED_SUMMARIES}}

SCORING SCALES (impact and feasibility anchors, from the locked taxonomy contract):
{{SCORING_SCALES}}

STYLE: British English. Do not use em dashes; use commas, colons or full stops. Never present a person's role title or name as a theme title or keyword; themes describe the work, not who does it.

HALLUCINATION CONSTRAINTS (HARD)
1. Two-voice rule: a theme may only be promoted if it is supported by quotes from at least TWO DISTINCT employee_refs, at least one of them first-hand. One person saying it twice is one voice. A team leader's on-behalf account is ONE voice however many people it describes, and that voice is second-hand.
2. A theme supported by one first-hand voice plus one second-hand voice may be promoted but must carry includes_second_hand true and should generate a follow_up to verify directly.
3. Every quote must be copied verbatim from the inputs, citing the same insight_id. You never compose, blend or "representative-ise" quotes; one [...] elision is allowed if it does not change meaning.
4. Anything that fails these tests but seems important goes to "to_confirm_in_readout", stated as an open question, never as a finding.
5. No recommendation without supporting insights behind it, and no recommendation that names a vendor or tool not present in the inputs.
6. Impact and feasibility are integers 1 to 5 against the scales provided, scored from the evidence alone.
7. Confidence on every theme and recommendation; never higher than the strongest supporting insight. (The harness recomputes confidence mechanically per the contract; your value is a sanity cross-check.)
8. follow_ups name a specific person by their employee_ref with the exact question Greatstone should ask them and why.
9. POST-VALIDATION (real, not rhetorical): after you respond, a validator re-derives the distinct-voice count of every theme from the cited insights, re-checks every quote for verbatim presence in the source turn, and drops anything that fails. Build output that passes first time.

OUTPUT (JSON only, no commentary, no code fences):
{
  "headline_read": {
    "text": string,                        // 3 to 5 sentences, max 700 chars, naming the most important pattern; honest about thin coverage
    "supporting_insight_ids": [string]     // at least 3
  },
  "themes": [
    {"theme_id": string, "title": string (max 90 chars), "statement": string (max 500 chars),
     "supporting_insight_ids": [string],
     "evidence_quotes": [{"insight_id": string, "employee_ref": string, "quote": string, "second_hand": boolean}],
     "confidence": number}
  ],
  "recommendations": [
    {"rec_id": string, "title": string (max 90 chars), "summary": string (max 400 chars),
     "impact": integer 1-5, "feasibility": integer 1-5,
     "supporting_insight_ids": [string],
     "evidence_quotes": [{"insight_id": string, "employee_ref": string, "quote": string, "second_hand": boolean}],
     "confidence": number}
  ],
  "follow_ups": [
    {"employee_ref": string, "question": string (max 300 chars), "reason": string (max 300 chars), "related_insight_ids": [string]}
  ],
  "to_confirm_in_readout": [string]        // uncertain items, single-voice patterns, second-hand claims awaiting direct confirmation
}`;

/** Impact and feasibility anchors injected into the coordinator prompt. */
export const SCORING_SCALES_TEXT = `IMPACT (time recovered blended with consequence avoided; where they disagree, take the higher):
1 Marginal: under 1 h/week recovered, no error or risk reduction.
2 Useful: roughly 1 to 3 h/week, or removes a minor recurring error source.
3 Significant: roughly 3 to 8 h/week, or removes regular rework or customer-visible mistakes.
4 Major: roughly 8 to 15 h/week, or unblocks a dependency stalling other teams, or removes a severity-4 pain.
5 Transformative: above 15 h/week, or removes a severity-5 risk, or changes what a team can take on.
Hours mean totals evidenced by the linked insights, never extrapolated to people who were not interviewed.

FEASIBILITY (from interview evidence alone; the consultant's prior, not a technical audit):
1 Speculative: paper/phone/tribal-knowledge inputs, mostly judgement, or an unintegratable system.
2 Hard: digital but messy inputs, meaningful judgement in the loop, or a closed legacy system.
3 Plausible: structured-ish inputs, judgement reducible to rules plus human approval, unproven exports/APIs.
4 Strong: structured digital inputs, rule-following with human approval on exceptions, known integration paths.
5 Ready: effectively a template, lookup or transfer between systems with usable APIs; a human checks the output at most.`;
