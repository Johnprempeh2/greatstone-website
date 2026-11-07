// Pure logic shared by the interview pages (GRE-2612). Lifted out of the source components unchanged so
// `node --test` covers it; the components import from here.
import { QUOTE_OPTIONS } from '../interview-notice.mjs';

// ─── PhaseDots (source components/PhaseDots.tsx) ─────────────────────────────

/** Participant-facing phase labels, in interview order, per the mockup. */
export const PHASE_LABELS = {
  warmup: 'Warm-up',
  day_in_life: 'Your role',
  pain_mapping: 'Pain mapping',
  automation: 'Ideas',
  sign_off: 'Wrap-up',
};

export const PHASE_ORDER = ['warmup', 'day_in_life', 'pain_mapping', 'automation', 'sign_off'];

/** Per-dot state and tooltip for a phase, as PhaseDots renders them. */
export function phaseDots(phase) {
  const activeIndex = PHASE_ORDER.indexOf(phase);
  return {
    activeIndex,
    label: PHASE_LABELS[phase],
    ariaLabel: `Conversation progress, phase ${activeIndex + 1} of ${PHASE_ORDER.length}`,
    dots: PHASE_ORDER.map((p, i) => ({
      phase: p,
      state: i < activeIndex ? 'done' : i === activeIndex ? 'current' : '',
      tip: i === activeIndex ? `${PHASE_LABELS[p]}, where we are now` : PHASE_LABELS[p],
    })),
  };
}

// ─── ChatShell (source components/ChatShell.tsx) ─────────────────────────────

/**
 * What the composer says while voice is running. Deliberately plain: someone
 * mid-sentence should not have to decode a status, and "Listening" is a
 * promise about privacy as much as it is about state.
 */
export const VOICE_HINT = {
  connecting: 'Connecting, one moment.',
  listening: 'Listening. Take your time.',
  thinking: 'Thinking.',
  speaking: 'Speaking. Just talk over me if you want to jump in.',
  ended: 'Voice mode has ended.',
  idle: 'Short answers are fine. There are no wrong answers here.',
};

/** The id of the latest agent turn (current-question emphasis). */
export const lastAgentTurnId = (turns) => [...turns].reverse().find((t) => t.role === 'agent')?.id;

/** Kickoff and crash recovery: no turns yet, or the last persisted turn is from the user. */
export function needsKickoff(turns) {
  const last = turns[turns.length - 1];
  return !last || last.role === 'user';
}

/** A stable id for one message, reused on auto-retry so a stutter never writes the turn twice. */
export function newClientTurnId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `ct-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

// ─── SignOffPanel (source components/SignOffPanel.tsx) ───────────────────────

// GRE-2687: the quote part is one of the three QUOTE_OPTIONS labels; no choice yet reads as "No quotes", which is
// what leaving without choosing means.
export function selectionSummary(quotes, memory) {
  const label = QUOTE_OPTIONS.find((o) => o.value === quotes)?.label ?? 'No quotes';
  return `${label} · ${memory ? 'conversation remembered' : 'no memory kept'}`;
}

// ─── JoinForm (source app/join/[token]/JoinForm.tsx and page.tsx) ────────────

export function domainHint(domains = []) {
  return domains.length > 0
    ? `Use your work email${domains.length === 1 ? ` (a ${domains[0]} address)` : ` (${domains.join(' or ')})`}.`
    : null;
}

/**
 * Optional team-targeted link (?team=<unitId>): honoured only when it is a real team of THIS engagement;
 * anything else silently falls back to the company-wide join (the enrol op re-validates server-side).
 */
export const teamUnitFor = (teams = [], team) => (team ? teams.find((t) => t.id === team) ?? null : null);

// ─── Released synthesis (source app/(portal)/deliverable/[engagementId]/page.tsx) ─

export function hoursLabel(h) {
  return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)} h/week`;
}

/**
 * Port: a copy of bandFor from the source lib/synthesis/invariants.ts (contract 6.2). The renderer needs it in
 * the browser and the server module is not bundled into the site; the thresholds must stay identical.
 */
export function bandFor(confidence) {
  if (confidence >= 0.75) return 'well evidenced';
  if (confidence >= 0.5) return 'evidenced';
  return 'indicative';
}

export const BOARD_GROUPS = [
  {
    label: 'Do first',
    blurb: 'High impact and high feasibility: the evidence says start here.',
    match: (r) => r.impact >= 4 && r.feasibility >= 4,
  },
  {
    label: 'Plan properly',
    blurb: 'High impact but harder to land: worth a scoped design phase.',
    match: (r) => r.impact >= 4 && r.feasibility < 4,
  },
  {
    label: 'Easy relief',
    blurb: 'Smaller wins that are cheap to deliver.',
    match: (r) => r.impact < 4 && r.feasibility >= 4,
  },
  {
    label: 'Park for now',
    blurb: 'Neither easy nor decisive on current evidence.',
    match: (r) => r.impact < 4 && r.feasibility < 4,
  },
];

const longDate = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * The client_admin holding screen's figures, from the engagement meta, the people and the synthesis count
 * (the same three reads the source page made). Never any cost.
 */
export function holdingProgress({ people = [], synthesisCount = 0, readoutAt = null, endDate = null } = {}) {
  const interviewees = people.filter((p) => p.portal_role === 'employee' || p.portal_role === 'team_leader');
  const total = interviewees.length;
  const completed = interviewees.filter((p) => p.status === 'completed').length;
  const started = interviewees.filter((p) => p.status === 'started').length;
  const invited = interviewees.filter((p) => p.status === 'invited').length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const hasSynthesis = (synthesisCount ?? 0) > 0;
  const readoutRaw = (readoutAt ?? endDate) || null;
  const targetDate = readoutRaw ? longDate(readoutRaw) : null;
  const statusLine = hasSynthesis
    ? 'Your read-out has been drafted and is with the Greatstone team for review. It appears here the moment it is released.'
    : completed + started > 0
      ? 'The conversations are under way. Once enough are complete, the Greatstone team draws the findings together and reviews them before sharing anything.'
      : total > 0
        ? 'Your team has been invited and the conversations are getting started. Progress will show here as people take part.'
        : 'The engagement is being set up. Progress will show here once your team is invited.';
  return { total, completed, started, invited, pct, hasSynthesis, targetDate, statusLine };
}

/**
 * Renderer invariants, client half: the server re-derives voices and re-verifies quotes (verifyForRender) and
 * sends the ids that failed; anything in that set is refused, never rendered. Same filters as the source page.
 */
export function visibleSynthesis(synthesis, failedIds = []) {
  const failed = new Set(failedIds);
  const themes = (synthesis.themes ?? []).filter((t) => !failed.has(t.theme_id));
  const crossThemes = themes.filter((t) => t.scope === 'cross_team');
  const hotSpots = (synthesis.hot_spots ?? []).map((h) => ({
    ...h,
    local_themes: (h.local_themes ?? []).filter((t) => !failed.has(t.theme_id)),
  }));
  const recommendations = (synthesis.recommendations ?? []).filter((r) => !failed.has(r.rec_id));
  const followUps = synthesis.follow_ups ?? [];
  const openQuestions = (synthesis.validation_log ?? []).filter((l) => l.kind === 'open_question');
  const suppressed = (synthesis.validation_log ?? []).filter(
    (l) => l.kind === 'theme_dropped' || l.kind === 'theme_demoted'
  );
  const methodology = synthesis.methodology;
  const maxHours = Math.max(1, ...hotSpots.map((h) => h.first_hand_hours_per_week));
  const generated = longDate(synthesis.generated_at);
  const interviewsIncluded = (methodology?.sessions_complete ?? 0) + (methodology?.sessions_partial ?? 0);
  const sparse = interviewsIncluded < 3;
  return {
    themes, crossThemes, hotSpots, recommendations, followUps, openQuestions, suppressed, methodology,
    maxHours, generated, interviewsIncluded, sparse, failedCount: failed.size,
  };
}
