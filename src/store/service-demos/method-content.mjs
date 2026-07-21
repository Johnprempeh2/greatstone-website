// Content for The Method archetype.
//
// This category is not a tool, it is how the work starts and how it keeps running. Two kinds:
//
//   worklog   a period, what got done in it, and what was deliberately parked for a human (2 services)
//   adoption  the thing that decides whether any of it mattered: did people actually use it (1 service)
//
// NO ASSESSMENT DEMO, DELIBERATELY. The 8-pillar assessment, the command-centre build and the website
// audit are consultative engagements: a structured walkthrough of an entire operating week, or a measured
// audit of a real site. A few questions and a score would make them look like a lead-gen quiz, which is
// smaller than the work actually is. Those three services render no prototype at all (see NO_DEMO in
// index.jsx), because underselling is worse than silence.
//
// HONESTY RULE: the logs and figures below are invented for the demonstration. What is real is that they
// describe artefacts these engagements genuinely produce: the overnight agent's morning brief and the
// retainer's monthly cycle are both named deliverables in the catalogue copy, and the adoption dashboard
// is listed on the training service itself.

export const METHOD = {
  // ── worklog ────────────────────────────────────────────────────────────────────────────────────────
  'overnight-ai-agent': {
    kind: 'worklog',
    worklog: {
      title: 'The morning brief', periodLabel: 'Night',
      periods: [
        {
          id: 'p1', label: 'Last night', stamp: 'Ran 23:00 to 04:40',
          done: [
            { t: 'Triaged 38 support tickets', d: 'Tagged, prioritised and routed. 19 answered outright from the knowledge base.' },
            { t: 'Reconciled 214 Stripe payments', d: 'Matched to invoices. Two mismatches isolated rather than guessed at.' },
            { t: 'Chased 11 overdue invoices', d: 'First reminders only, in your tone, nothing past day 30.' },
            { t: 'Drafted 6 follow-ups from yesterday’s calls', d: 'Waiting in drafts. None sent.' },
          ],
          parked: [
            { t: 'Refund request, £2,400', d: 'Above the auto-approve limit you set. Needs a person, and the customer has been told it is being looked at.' },
            { t: 'Two Stripe payments with no matching invoice', d: 'Could be a duplicate charge. Guessing here would be worse than waiting.' },
          ],
        },
        {
          id: 'p2', label: 'The night before', stamp: 'Ran 23:00 to 03:10',
          done: [
            { t: 'Triaged 22 support tickets', d: 'Quieter night. 14 answered outright.' },
            { t: 'Reconciled 180 Stripe payments', d: 'All matched, nothing to look at.' },
            { t: 'Rebuilt the weekly ops brief', d: 'In your inbox before 07:00.' },
          ],
          parked: [
            { t: 'A ticket in French', d: 'Outside the languages you have approved it to answer in. Routed to Priya.' },
          ],
        },
      ],
      metric: { label: 'Started the day on', value: 'the exceptions' },
      closer: 'It runs on your schedule against a queue you define. We monitor and tune it, so what you see is results rather than maintenance.',
      foot: 'It does the safe work end to end and parks the rest with a reason. Every action is permissioned and logged, so the morning brief is auditable rather than just reassuring.',
    },
  },

  'outsourced-web-team-retainer': {
    kind: 'worklog',
    worklog: {
      title: 'The standing cycle', periodLabel: 'Month',
      periods: [
        {
          id: 'm1', label: 'July', stamp: 'Sprint 14 and 15',
          done: [
            { t: 'Checkout rebuilt on the new payment flow', d: 'Requested by you. Live on the 9th.' },
            { t: 'Cut the homepage to under a second on 3G', d: 'Not requested. We found it, so we fixed it.', proactive: true },
            { t: 'Closed 14 accessibility issues', d: 'Not requested. Keyboard path and contrast across the whole estate.', proactive: true },
            { t: 'Monthly patching, backups verified', d: 'Restore tested, not just taken.' },
          ],
          parked: [
            { t: 'Moving to the new domain', d: 'Needs your DNS decision before we touch it. Ready when you are.' },
          ],
        },
        {
          id: 'm2', label: 'June', stamp: 'Sprint 12 and 13',
          done: [
            { t: 'Client portal shipped', d: 'Requested. Two weeks, from brief to live.' },
            { t: 'Rewrote the services pages in the house voice', d: 'Not requested. They read like three different companies.', proactive: true },
            { t: 'Uptime 100%, no incidents', d: 'Monitored, so we would have known before you did.' },
          ],
          parked: [],
        },
      ],
      metric: { label: 'Requests you had to raise', value: 'fewer than the fixes we found' },
      closer: 'No assessment required to start. We pick the estate up as it is, and it gets better every cycle whether or not you raise anything.',
      foot: 'A ticket queue waits to be told. We critique the whole estate every cycle, which is why half of what ships each month was never asked for.',
    },
  },

  // ── adoption ───────────────────────────────────────────────────────────────────────────────────────
  'ai-training-adoption-support': {
    kind: 'adoption',
    adoption: {
      title: 'Is anyone actually using it?',
      weeks: [
        { id: 'w1', label: 'Week 1', note: 'Straight after the build. The keen few, and nobody else.' },
        { id: 'w4', label: 'Week 4', note: 'After role-based onboarding and the first office hours.' },
        { id: 'w12', label: 'Week 12', note: 'Once the plays were written down and owned by the team.' },
      ],
      teams: [
        { id: 't1', name: 'Operations', use: { w1: 62, w4: 88, w12: 94 }, hours: { w1: 6, w4: 22, w12: 31 } },
        { id: 't2', name: 'Finance', use: { w1: 18, w4: 54, w12: 86 }, hours: { w1: 1, w4: 9, w12: 24 } },
        { id: 't3', name: 'Sales', use: { w1: 45, w4: 71, w12: 79 }, hours: { w1: 3, w4: 12, w12: 18 } },
        { id: 't4', name: 'Field crews', use: { w1: 8, w4: 31, w12: 68 }, hours: { w1: 0, w4: 4, w12: 14 } },
      ],
      lens: {
        w1: 'This is where most AI investments quietly die. The tool works, and four people use it.',
        w4: 'Finance moved once somebody sat with them for an hour. Field crews are still behind, and it is a phone problem rather than a willingness problem.',
        w12: 'Every team is over two thirds, and the hours are real. The quarterly review now goes looking for the next thing worth automating.',
      },
      foot: 'The build is the easy half. This is the half that decides whether the hours actually come back.',
      closer: 'We do not hand over and leave. We stay until the tools are part of the working week.',
    },
  },
};

// No generic fallback here on purpose. The three consultative engagements in this category have no
// prototype, and inventing one for a service we have not thought about would repeat exactly that mistake.
export function methodFor(svc) {
  if (!svc) return null;
  return METHOD[svc.slug] || null;
}

export default METHOD;
