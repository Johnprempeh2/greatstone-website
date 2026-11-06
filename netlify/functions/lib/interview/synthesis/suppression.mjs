// Port of src/lib/synthesis/suppression.ts @505ba6a.
// Changed: types stripped. Word lists, regexes and log reasons unchanged.
//
// Identity-token suppression (product decision, June 2026).
//
// A person's role title, name and other identity facts are CONTEXT, never an insight, theme or
// keyword. The app once surfaced "DX Lead" (a role title) as a theme token; that is a label, not a
// finding, and it must never reach any aggregated insight, theme keyword or pattern surface again.
//
// This module is the code half of that rule (the prompt half lives in synthesis-prompts.mjs). It is
// pure and dependency-free.
//
// Two responsibilities:
//   1. isIdentityToken(...)  — decide whether a short label/keyword is really an identity fact (a
//      role, a name, a tenure statement) rather than a pain, time cost or automation opportunity.
//   2. suppressIdentityItems(...) — filter a list of summary items, dropping identity facts with a
//      logged reason, so role titles can never be promoted into the aggregated insight groups or the
//      patterns block.

/**
 * Role-shaped suffixes and identity nouns. A label that is essentially one of these (a job title, a
 * seniority word, a team-membership statement) is metadata about who the person is, not what slows
 * them down.
 */
const ROLE_WORDS = [
  'lead',
  'leader',
  'head',
  'manager',
  'director',
  'officer',
  'executive',
  'exec',
  'chief',
  'ceo',
  'cto',
  'coo',
  'cfo',
  'founder',
  'partner',
  'analyst',
  'engineer',
  'developer',
  'designer',
  'consultant',
  'administrator',
  'admin',
  'coordinator',
  'specialist',
  'associate',
  'assistant',
  'intern',
  'president',
  'vp',
  'supervisor',
  'team member',
];

/**
 * Phrases that describe identity or tenure rather than work friction: "I am the X", "my role is",
 * "since August", "I lead the team". These are the shapes the extractor sometimes stored as `task`
 * insights with high confidence; they are context, not insight.
 */
const IDENTITY_PHRASES = [
  /\brole\b/,
  /\btenure\b/,
  /\bsince\s+(january|february|march|april|may|june|july|august|september|october|november|december|\d)/,
  /\bi\s+(am|lead|head|manage|run)\b/,
  /\bmy\s+(role|title|job|position)\b/,
  /\bjoined\b/,
  /\bi'?m\s+the\b/,
  /\bresponsible\s+for\s+the\s+team\b/,
];

function normalise(s) {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * True when `label` is an identity fact (role title, name, tenure) rather than a pain, time cost or
 * automation opportunity. `knownIdentity` carries the person's own role title and name so an
 * exact-ish match is caught even when it does not contain a generic role word.
 */
export function isIdentityToken(label, knownIdentity) {
  const text = normalise(label);
  if (text.length === 0) return true;

  // Match against this person's own role title (substring is safe: a full title rarely appears
  // mid-sentence by accident) and name (WHOLE-WORD only: a short name like "Test" must not match
  // inside "testing").
  const role = knownIdentity?.roleTitle ? normalise(knownIdentity.roleTitle) : '';
  const name = knownIdentity?.name ? normalise(knownIdentity.name) : '';
  if (role && (text === role || text.includes(role) || role.includes(text))) return true;
  if (name && (text === name || containsWord(text, name))) return true;

  const words = text.split(' ').filter(Boolean);

  // A very short label that is dominated by a role word ("DX Lead role", "DX Lead", "Senior
  // Analyst") is identity, not friction.
  if (words.length <= 4 && ROLE_WORDS.some((rw) => containsWord(text, rw))) return true;

  // A role word used as an identity descriptor — "... as DX Lead", "the DX Lead", "work as a senior
  // analyst", "I'm the manager" — is metadata, however long the phrase. Trigger when a role word
  // follows an identity marker ("as", "the", "a/an", "our/their/my", "is/am/are", "i'm"), optionally
  // with one qualifier word in between ("as [a] [DX] lead").
  for (const rw of ROLE_WORDS) {
    const re = new RegExp(
      `\\b(as|the|a|an|our|their|my|is|am|i'?m|are)\\s(\\w+\\s){0,2}${escapeForRegExp(rw)}\\b`
    );
    if (re.test(text)) return true;
  }

  // Role verbs in gerund form at the head of the label ("leading the team", "managing the unit")
  // describe the role, not a pain.
  if (/^(leading|heading|managing|running|directing|overseeing|supervising|coordinating)\b/.test(text)) {
    return true;
  }

  // Tenure / "I am the X" identity phrasing.
  if (IDENTITY_PHRASES.some((re) => re.test(text))) return true;

  return false;
}

function containsWord(haystack, needle) {
  return new RegExp(`\\b${escapeForRegExp(needle)}\\b`).test(haystack);
}

function escapeForRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Filter summary items ({ label, insight_id }), dropping identity facts. Returns the survivors and
 * pushes a `note` entry to the log for each dropped item so the suppression is explainable after the
 * fact. Used by the summariser AFTER the model returns and by the brief aggregator before grouping.
 */
export function suppressIdentityItems(items, knownIdentity, subject, log) {
  const kept = [];
  for (const item of items) {
    if (isIdentityToken(item.label, knownIdentity)) {
      log.push({
        kind: 'note',
        subject,
        reason: `suppressed identity token "${item.label}" (a role/name/tenure fact, never an insight or theme keyword)`,
      });
      continue;
    }
    kept.push(item);
  }
  return kept;
}

/** Convenience: identity lookup straight from an employee row. */
export function identityOf(employee) {
  return { roleTitle: employee.role_title, name: employee.name };
}

/** Identity lookup from a prepared insight (its employee). */
export function identityOfInsight(insight) {
  return identityOf(insight.employee);
}
