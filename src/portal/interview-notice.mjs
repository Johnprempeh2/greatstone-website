// GRE-2653: the short interview privacy notice and the consent box, shown on the interview welcome screen before
// "I agree to take part". Text: the `privacy-notice` document (v1) on GRE-2639; Mikey reviews the tone, the facts do
// not change. Claims C1 to C8 of its register depend on the GRE-2653 build (retention, self-service, quote choice).
// Pure data, so the page and its tests read the same words.

export const FULL_NOTICE_HREF = '#privacy/interviews';

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** "4 February 2027" from YYYY-MM-DD (or an ISO time); null when there is no date yet. */
export function formatDeletionDate(value) {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return DATE.format(new Date(String(value).length === 10 ? `${value}T00:00:00Z` : value));
}

/**
 * The notice for one round. clientName: the round's client. retentionDays: default 90. deletionDate: YYYY-MM-DD from
 * the server, or null before the readout is booked (then the sentence names the rule, not a date).
 */
export function interviewNotice({ clientName, retentionDays = 90, deletionDate = null }) {
  const client = String(clientName || 'Your organisation').trim();
  const days = Number.isInteger(retentionDays) && retentionDays >= 0 ? retentionDays : 90;
  const by = formatDeletionDate(deletionDate);
  return {
    title: 'Your answers, your data',
    intro: `${client} has asked Greatstone International to learn how work really gets done here. Greatstone runs `
      + `these conversations independently and processes your answers for ${client} under a data processing agreement.`,
    points: [
      { label: 'What we collect.', text: 'Your answers, typed or spoken. If you use voice, your speech is turned into text as '
        + 'you talk; we keep the text, not the recording. We also use your name, work email, role and team from your account.' },
      { label: 'Why.', text: 'Only to find the slow and repetitive parts of the work so they can be fixed. We never use your '
        + 'answers to train AI models.' },
      { label: 'Who sees what.', text: `${client} sees themes across the whole team, never your transcript or your individual `
        + 'answers. A short quote from you is shared only if you agree at the end, and carries your name only if you choose that.' },
      { label: 'How long.', text: `We delete your answers and transcripts ${days} days after we present the findings`
        + `${by ? ` (by ${by})` : ''}. After that only anonymous themes remain.` },
      { label: 'Your rights.', text: 'At any time, in your account, you can see your interview data or delete it. Deleting it '
        + 'takes you out of the findings. You can also ask us to correct it, or complain to the ICO.' },
    ],
    fullNoticeLabel: 'Read the full interview privacy notice',
    fullNoticeHref: FULL_NOTICE_HREF,
    deletionDate: by,
    consent: 'I agree to take part. I understand my answers will be recorded and analysed as described above, and that I '
      + 'can skip anything, stop at any time, and delete my data from my account.',
    // GRE-2653 fact (b): "Stop and discard" hard-deletes the session, but a person who just leaves after the pain
    // questions is closed out and included as a partial interview. So the old "If you stop, nothing is kept" is reworded.
    stopping: 'If you stop, you can delete what you said from your account.',
  };
}

/** The welcome-screen line that replaced "Managers see themes and quotes, not transcripts". */
export const whoSeesLine = (clientName) =>
  `${String(clientName || 'Your organisation').trim()} sees themes, not your answers. Only the patterns across the whole team. `
  + 'A short quote is shared only if you agree.';

/** The sign-off question. None is pre-selected; leaving without choosing means no quotes. */
export const QUOTE_OPTIONS = Object.freeze([
  { value: 'none', label: 'No quotes', help: 'Your words never appear. What you said still counts in the themes.' },
  { value: 'anonymous', label: 'Anonymous quotes', help: 'Your words may appear, without your name. In a small team people may guess.' },
  { value: 'named', label: 'Quotes with my name', help: 'Your words may appear with your name.' },
]);
