// Port of src/lib/synthesis/types.ts @505ba6a.
// Changed: TypeScript interfaces stripped (JavaScript has no runtime types); only the runtime export
// RULES_VERSION remains. The row and output shapes are documented in the source file and in
// docs/taxonomy-synthesis-contract.md section 3.3 of the source repository.
//
// Source header, kept:
// Synthesis pipeline types (Wave 5B). The output shapes mirror docs/taxonomy-synthesis-contract.md
// section 3.3 (the contract is the source of truth); the row shapes mirror the 0001_init and
// 0005_synthesis migrations (on the website: schema `interview`, migration 057_interview_engine).
//
// Port: the source rules for this directory (explicit `.ts` specifiers, `import type`, no
// `server-only`) become: explicit `.mjs` specifiers, no type imports, no `server-only`. Callers are
// responsible for only using it server-side; the data client (`db`) is injected by the caller.
//
// Shapes in brief (see source for field docs):
//   EngagementRow { id, client_name, status, seat_total }
//   OrgUnitRow { id, engagement_id, parent_id, name, kind, path }
//   EmployeeRow { id, engagement_id, person_id, unit_id, name, role_title, portal_role, status, leader_track }
//   SessionRow { id, employee_id, started_at, ended_at, phase, completion_score, taxonomy_state, is_test }
//   InsightRow { id, session_id, type, label, evidence_quote, time_per_week_hours, confidence,
//                attribution_redacted, second_hand }
//   EligibleSession { session, employee, complete, partial, relaxed, fingerprint, insightCount }
//   PreparedInsight { row, employee, session, unitId, unitName, voiceKey, secondHand, confidence, quoteEligible }
//   InterviewSummary, UnitSynthesis, SupportingQuote (model-stage intermediates)
//   SynthesisOutput { headline_read, themes, hot_spots, recommendations, follow_ups, methodology, validation_log }
//   ValidationEntry { kind: theme_dropped | theme_demoted | quote_dropped | recommendation_dropped |
//                     follow_up_dropped | headline_dropped | open_question | note, subject, reason }
//   StepUsage { calls, inputTokens, outputTokens, costPence }
//   StepResult { done, phase: no_input | summaries | units | final | written, message, summariesTotal,
//                summariesReady, unitsTotal, unitsReady, usage, synthesisId?, version?, report? }
//   StepOptions { maxModelCalls?, relaxEligibility? }
//   SynthesisRow (the stored synthesis row)

export const RULES_VERSION = 'taxonomy-v0.9';
