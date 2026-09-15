// What a finding IS, shared by the browser and the MCP so neither can drift.
//
// A finding is the substance the record exists to accumulate: not "this question is done" but what
// somebody actually said, where they said it, and how far we would stand behind it.
//
// THE CHANGE-MANAGEMENT RULE, and it is the important one: a finding is NEVER overwritten. An update
// is a NEW finding that SUPERSEDES the old one, and the old one stays. That is what makes the history
// on a question real rather than a claim, and it is what lets a practitioner see exactly what an
// agent proposed against what they themselves typed, and go back.

// How far we would stand behind an answer. Deliberately not high/medium/low: these are the states
// evidence actually passes through in an investigation, and "disputed" is a finding in itself
// rather than a failure, because two accounts disagreeing is usually where the truth is.
export const CONFIDENCE = {
  single:       { label: 'Single account',  blurb: 'One person said it. Nothing corroborates it yet.', rank: 1 },
  corroborated: { label: 'Corroborated',    blurb: 'Two or more independent accounts agree.',          rank: 2 },
  evidenced:    { label: 'Evidenced',       blurb: 'Backed by a document or system we have seen.',     rank: 3 },
  disputed:     { label: 'Disputed',        blurb: 'Accounts disagree. The disagreement is the finding.', rank: 0 },
};
export const CONFIDENCE_IDS = ['single', 'corroborated', 'evidenced', 'disputed'];
export const DEFAULT_CONFIDENCE = 'single';

// Practitioner validation. Nothing an agent writes is treated as established until a person has
// said so, which is the whole point of a practitioner-led method.
export const FINDING_STATE = {
  proposed:  { label: 'Proposed',  blurb: 'Written but not yet confirmed by a practitioner.' },
  validated: { label: 'Validated', blurb: 'A practitioner has confirmed this.' },
  superseded:{ label: 'Superseded', blurb: 'Replaced by a later finding. Kept so the change is visible.' },
  rejected:  { label: 'Rejected',  blurb: 'A practitioner judged this wrong. Kept so the judgement is visible.' },
};
export const FINDING_STATE_IDS = ['proposed', 'validated', 'superseded', 'rejected'];

/** The same judgement in the instruments' vocabulary, for anything rendered against the Finding
 *  Record rather than against the portal.
 *
 *  The instrument asks for High / Moderate / Limited. We keep the four above, because they say WHY
 *  we would stand behind something rather than only how far: "one person said it" and "a document
 *  we have seen" are both Limited-to-High judgements that a reader can check, and a bare "Moderate"
 *  is not. `disputed` has no level at all on purpose. Ben's own record treats contradiction as an
 *  investigative signal and gives it a finding STATE (Challenged), not a confidence, and collapsing
 *  it into a level would say we are merely less sure when what we actually have is two accounts
 *  that cannot both be true. */
export const BEN_CONFIDENCE = {
  evidenced: 'High', corroborated: 'Moderate', single: 'Limited', disputed: null,
};

export const MAX_FINDING = 4000;

/** Anything a practitioner typed in the Portal is theirs and starts validated. Anything an agent
 *  wrote starts proposed and waits for a person. */
export const initialState = (by) => (by === 'mcp' ? 'proposed' : 'validated');

export function normaliseFinding(f) {
  return {
    id: f.id,
    questionId: f.questionId || null,
    sessionId: f.sessionId || null,
    text: String(f.text || ''),
    source: String(f.source || ''),            // where it came from, in words
    sourceId: f.sourceId || null,              // a SOURCES item, when it is one we hold
    confidence: CONFIDENCE[f.confidence] ? f.confidence : DEFAULT_CONFIDENCE,
    state: FINDING_STATE[f.state] ? f.state : initialState(f.by),
    supersedes: f.supersedes || null,
    by: f.by === 'mcp' ? 'mcp' : 'portal',
    at: f.at || null,
    validatedAt: f.validatedAt || null,
    note: String(f.note || ''),                // the practitioner's remark when validating or rejecting

    // ── the Finding Record proper ───────────────────────────────────────────────────────────
    // A finding was a sentence with a confidence on it, which is the answer to "what did they say"
    // and not to "what does Greatstone conclude". These are the fields that make it a conclusion:
    // what it means, why it is happening, and what would have to become better.
    evidenceIds: list(f.evidenceIds),          // evidence that SUPPORTS the conclusion
    // ⚠ CHALLENGING EVIDENCE IS A FIELD, NOT AN OMISSION. A record that can only hold what agrees
    // with it will quietly become a case for a conclusion rather than a test of one, and the
    // contradiction is usually where the truth is.
    challengedBy: list(f.challengedBy),
    rootCause: String(f.rootCause || ''),      // why it happens, not what it looks like
    impact: String(f.impact || ''),            // why it matters
    desiredOutcome: String(f.desiredOutcome || ''),  // what has to get better, NOT the solution
    opportunityId: f.opportunityId || null,    // the opportunity this finding points at
    baselineRequired: !!f.baselineRequired,
  };
}

const list = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean)
  : String(v || '').split('\n').map((x) => x.trim()).filter(Boolean));

/** What actually stands behind a finding: a session it was said in, a source we hold, evidence
 *  records tied to it, or at minimum a stated origin in words. */
export function evidenceBehind(f) {
  return {
    session: !!f.sessionId,
    source: !!f.sourceId,
    evidence: (f.evidenceIds || []).length,
    stated: !!String(f.source || '').trim(),
    challenged: (f.challengedBy || []).length,
  };
}

/** ⚠ THE ENGINE MAY SUGGEST. IT MUST NEVER VALIDATE.
 *
 *  A material finding must not reach Validated with nothing identifiable behind it. Without this a
 *  conclusion typed in a hurry is indistinguishable, one week later, from one drawn from a
 *  transcript and a system export: both read as Validated and neither can be checked. That is the
 *  precise failure the three-layer split exists to prevent, and a comment saying so is not a check.
 *
 *  "Identifiable" is deliberately generous: a session, a source we hold, an evidence record, or a
 *  stated origin in words all qualify. What does not qualify is nothing at all. */
export function canValidate(f) {
  const e = evidenceBehind(f);
  if (e.session || e.source || e.evidence || e.stated) return { ok: true, why: null };
  return {
    ok: false,
    why: 'Nothing identifiable stands behind this yet. Name the session, the source, an evidence '
       + 'record, or at minimum where it came from, before validating it.',
  };
}

export function validateFindingInput({ text, confidence, source }) {
  const body = String(text || '').trim();
  if (!body) throw new Error('A finding needs something in it.');
  if (body.length > MAX_FINDING) {
    throw new Error(`A finding is capped at ${MAX_FINDING} characters. Split it, or put the detail in the evidence record.`);
  }
  if (confidence && !CONFIDENCE[confidence]) {
    throw new Error(`confidence must be one of: ${CONFIDENCE_IDS.join(', ')}`);
  }
  return { text: body, source: String(source || '').trim() };
}

/** What a finding's state becomes once its conclusion has been refined.
 *
 *  ⚠ A CONCLUSION CAN REMOVE THE GROUND UNDER A VALIDATION. Dropping the last piece of supporting
 *  evidence from a finding somebody had already validated would otherwise leave it reading
 *  Validated with nothing behind it, which is the exact state canValidate exists to prevent, now
 *  arrived at by the back door. It returns to `proposed` rather than keeping a status it no longer
 *  earns. Kept here, beside the rule it enforces, so the writer cannot drift from it.
 */
export function stateAfterConclusion(f) {
  return f.state === 'validated' && !canValidate(f).ok ? 'proposed' : f.state;
}

/** The findings that currently stand for a question: the live ones, newest first. A superseded or
 *  rejected finding is history, not an answer, so it never counts toward what we believe. */
export function standing(findings, questionId) {
  return (findings || [])
    .filter((f) => f.questionId === questionId && f.state !== 'superseded' && f.state !== 'rejected')
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
}

/** Everything ever recorded against a question, newest first. This is the per-question history. */
export function historyFor(findings, questionId) {
  return (findings || [])
    .filter((f) => f.questionId === questionId)
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
}

/** How far a question has actually got, from its findings rather than from a status flag. */
export function questionState(findings, questionId) {
  const live = standing(findings, questionId);
  if (!live.length) return { answered: false, awaiting: 0, confidence: null, label: 'Unanswered' };
  const awaiting = live.filter((f) => f.state === 'proposed').length;
  // The weakest live finding governs: one disputed account undoes the comfort of three agreeing ones.
  const best = live.reduce((lo, f) => (CONFIDENCE[f.confidence].rank < CONFIDENCE[lo.confidence].rank ? f : lo), live[0]);
  return {
    answered: true,
    awaiting,
    confidence: best.confidence,
    label: awaiting ? `${awaiting} awaiting validation` : CONFIDENCE[best.confidence].label,
  };
}

/** ⚠ TWO CLAIMS ABOUT THE SAME QUESTION, AND NOTHING COMPARED THEM.
 *
 *  `certainty` is what a practitioner SAYS about a question: known, indicated, or unknown. The
 *  findings are what the record can actually SHOW. Both were displayed, counted in five places and
 *  never once set against each other, so a question marked Unknown with three validated answers on
 *  it still counted toward "to investigate" and still read as work outstanding. Over a long
 *  engagement that is how the plan slowly stops describing the investigation.
 *
 *  It SUGGESTS and never changes anything. Certainty is a professional judgement and the drift is a
 *  prompt to look, not an instruction: the same rule that stops the Engine validating a finding
 *  stops it re-rating a question.
 *
 *  ⚠ `known` WITH NO FINDING IS NOT DRIFT. Known means established through Discovery, the GITA or a
 *  prior deliverable and carried in, so having nothing in THIS record behind it is the definition
 *  rather than a defect. Flagging it would fire on every carried-in question and train everyone to
 *  ignore the signal. */
export function certaintyDrift(question, findings) {
  const live = standing(findings, question.id);
  const disputed = live.filter((f) => f.confidence === 'disputed');
  // ⚠ A DISPUTED ACCOUNT IS NOT AN ANSWER. It was counted as one here, so a question we had marked
  // unknown, on which two people flatly contradicted each other, reported back as "answered" and
  // suggested promoting it to Known. Accounts disagreeing is the investigation working, not the
  // question being settled.
  const settled = live.filter((f) => f.state === 'validated' && f.confidence !== 'disputed');
  const evidenced = settled.filter((f) => f.confidence === 'evidenced');
  const onlySingle = settled.length > 0 && settled.every((f) => f.confidence === 'single');

  // A contradiction outranks everything else: it is the one case where carrying on as before is
  // actively wrong rather than merely out of date.
  if (disputed.length && question.certainty !== 'unknown') {
    return {
      kind: 'contradicted',
      says: question.certainty,
      why: `Marked ${CERTAINTY_WORD[question.certainty]}, but ${disputed.length === 1 ? 'an account contradicts' : `${disputed.length} accounts contradict`} it.`,
      suggest: 'Resolve the disagreement, or record it as the finding.',
    };
  }
  if (question.certainty === 'unknown' && settled.length) {
    return {
      kind: 'answered',
      says: 'unknown',
      why: `Marked as still to investigate, but ${settled.length} validated ${settled.length === 1 ? 'answer stands' : 'answers stand'} on it.`,
      suggest: evidenced.length ? 'This looks established. Consider Known.' : 'Consider Indicated, or Known if the accounts are strong enough.',
    };
  }
  if (question.certainty === 'indicated' && evidenced.length) {
    return {
      kind: 'evidenced',
      says: 'indicated',
      why: `Marked as believed but not evidenced, and ${evidenced.length === 1 ? 'an answer is' : `${evidenced.length} answers are`} backed by something we have seen.`,
      suggest: 'Consider Known.',
    };
  }
  if (question.certainty === 'known' && onlySingle) {
    return {
      kind: 'thin',
      says: 'known',
      why: 'Carried as established, but everything standing on it is a single uncorroborated account.',
      suggest: 'Corroborate it, or drop it to Indicated.',
    };
  }
  return null;
}
const CERTAINTY_WORD = { known: 'established', indicated: 'believed', unknown: 'unknown' };

/** Every question whose stated certainty disagrees with what its findings show. */
export function certaintyDriftRollup(plan, findings) {
  const rows = [];
  for (const g of plan.QUESTIONS || []) {
    for (const q of g.items || []) {
      const drift = certaintyDrift(q, findings);
      if (drift) rows.push({ question: q, pillar: g.pillar, ...drift });
    }
  }
  return rows;
}

// ── asking the same question of several people ────────────────────────────────────────────────
//
// A question is asked more than once ON PURPOSE: to find out whether the accounts agree. If they do,
// there is no reason to keep asking. If they do not, the disagreement is usually the finding.
//
// AGREEMENT IS A JUDGEMENT, NOT A COMPUTATION. Two free-text answers cannot be compared reliably by
// software, and pretending otherwise would put a number on something nobody measured. So the shape
// of the evidence is computed and the verdict is a person's, which an agent may propose.
export const AGREEMENT = {
  uniform:       { label: 'They agree',      blurb: 'Independent accounts say the same thing. No reason to keep asking.' },
  varied:        { label: 'Varies',          blurb: 'Accounts differ by role, site or team. The variation is itself the answer.' },
  contradictory: { label: 'They contradict', blurb: 'Accounts cannot both be true. This is a finding, not a failure.' },
  unclear:       { label: 'Not yet comparable', blurb: 'Too few accounts, or they answer different parts of the question.' },
};
export const AGREEMENT_IDS = ['uniform', 'varied', 'contradictory', 'unclear'];

/** The shape of what we hold on a question: who was asked, who answered, and how firm it is.
 *  Every number here is counted, never inferred. */
export function comparison(plan, findings, questionId) {
  const askedIn = (plan.SESSIONS || []).filter((s) => (s.covers || []).includes(questionId));
  const live = standing(findings, questionId);

  const bySession = [];
  for (const s of askedIn) {
    const answers = live.filter((f) => f.sessionId === s.id);
    bySession.push({ session: s, answers, answered: answers.length > 0 });
  }
  // Findings recorded without a session (a document, a system, desk research) still count as accounts.
  const unattached = live.filter((f) => !f.sessionId || !askedIn.some((s) => s.id === f.sessionId));

  const accounts = bySession.filter((r) => r.answered).length + unattached.length;
  const spread = {};
  live.forEach((f) => { spread[f.confidence] = (spread[f.confidence] || 0) + 1; });

  return {
    askedIn,
    bySession,
    unattached,
    asked: askedIn.length,
    answered: bySession.filter((r) => r.answered).length,
    outstanding: bySession.filter((r) => !r.answered).map((r) => r.session),
    accounts,
    // Comparison only means anything once more than one account exists.
    comparable: accounts > 1,
    awaiting: live.filter((f) => f.state === 'proposed').length,
    spread,
    anyDisputed: live.some((f) => f.confidence === 'disputed'),
  };
}

/** Across a whole record: where asking again would actually tell us something, and where it would
 *  spend a stakeholder's time to learn nothing. */
export function comparisonRollup(plan, findings, state = {}) {
  const rows = [];
  for (const g of plan.QUESTIONS || []) {
    for (const q of g.items || []) {
      const c = comparison(plan, findings, q.id);
      if (!c.asked && !c.accounts) continue;
      rows.push({ question: q, pillar: g.pillar, ...c, agreement: state[q.id]?.agreement || null });
    }
  }
  return {
    rows,
    multiAccount: rows.filter((r) => r.comparable),
    // Asked of several people, and every one of them has answered, but nobody has said whether the
    // accounts agree. That is the queue this whole idea exists to serve.
    needsVerdict: rows.filter((r) => r.comparable && !r.agreement),
    contradictions: rows.filter((r) => r.agreement === 'contradictory' || r.anyDisputed),
    stillOutstanding: rows.filter((r) => r.outstanding.length),
  };
}

// ── the validation queue ──────────────────────────────────────────────────────────────────────
//
// Everything an agent has proposed, across the whole record, in one place. Validating question by
// question works while there are three findings; after a day of transcripts there are forty, and a
// practitioner who has to hunt for them will simply stop, which quietly turns "proposed" into
// "accepted by default" — the exact thing practitioner validation exists to prevent.
export function validationQueue(plan, findings) {
  const byQuestion = new Map();
  for (const g of plan.QUESTIONS || []) {
    for (const q of g.items || []) byQuestion.set(q.id, { ...q, pillar: g.pillar });
  }
  const sessions = new Map((plan.SESSIONS || []).map((s) => [s.id, s]));

  const rows = (findings || [])
    .filter((f) => f.state === 'proposed')
    .map((f) => ({
      finding: f,
      question: byQuestion.get(f.questionId) || null,
      session: f.sessionId ? sessions.get(f.sessionId) || null : null,
      // A proposal that REPLACES something a practitioner already validated deserves to be looked at
      // first: an agent overwriting a person's judgement is the case with the most at stake.
      replacesValidated: !!(f.supersedes
        && (findings || []).some((x) => x.id === f.supersedes && x.by === 'portal')),
    }))
    .sort((a, b) => (b.replacesValidated - a.replacesValidated)
      || String(a.finding.at || '').localeCompare(String(b.finding.at || '')));

  return {
    rows,
    total: rows.length,
    replacingWork: rows.filter((r) => r.replacesValidated).length,
    byPillar: [...rows.reduce((m, r) => {
      const k = r.question?.pillar || 'Unattached';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
      return m;
    }, new Map())].map(([pillar, items]) => ({ pillar, items })),
  };
}
