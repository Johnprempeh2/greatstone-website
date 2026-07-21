// Content for The Method archetype.
//
// This category is not a tool, it is how the work starts and how it keeps running. Three kinds:
//
//   assess    answer a few questions, watch the read build, and get a plan that RE-RANKS itself. The
//             ranking changing with your answers is the whole point: it is a diagnostic, not a brochure
//             with your name at the top (3 services)
//   worklog   a period, what got done in it, and what was deliberately parked for a human (2 services)
//   adoption  the thing that decides whether any of it mattered: did people actually use it (1 service)
//
// The eight pillars and their one-liners are the canonical set from the live methodology explorer
// (src/blocks/PillarExplorer.jsx), not a parallel invention.
//
// HONESTY RULE: this is a short prototype, not the assessment. The real thing is a structured walkthrough
// of the whole operating week. The demo says so, names how many pillars it leaves unread, and every figure
// it shows is derived from the answers actually given.

const PILLARS = [
  { id: 'people', name: 'People', line: 'Know who moves what, and set them up to move it well.' },
  { id: 'comms', name: 'Communication', line: 'Make the value land, inside the business and out.' },
  { id: 'innovation', name: 'Innovation', line: 'A repeatable way to find the next worthwhile change.' },
  { id: 'data', name: 'Data', line: 'Map the lifecycle so the right decision is the easy one.' },
  { id: 'customer', name: 'Customer', line: 'See the whole relationship, not just the last ticket.' },
  { id: 'competition', name: 'Competition', line: 'Know the field, and where your edge actually is.' },
  { id: 'technology', name: 'Technology', line: 'A stack that earns its keep and bends when you need it to.' },
  { id: 'value', name: 'Value', line: 'Tie every move back to money, time or risk.' },
];

// Five questions across five pillars. Each option carries a score (0 to 3) and the minutes a week that
// answer implies are being lost, so both the read and the cost come from the same click.
const PILLAR_QUESTIONS = [
  {
    axis: 'data', q: 'When leadership wants a number, where does it come from?',
    options: [
      { label: 'Someone builds it in a spreadsheet', score: 0, mins: 240 },
      { label: 'An export, then a bit of cleaning', score: 1, mins: 120 },
      { label: 'A report someone set up once', score: 2, mins: 40 },
      { label: 'A live view everyone already trusts', score: 3, mins: 0 },
    ],
  },
  {
    axis: 'customer', q: 'A client asks where their job is. What happens?',
    options: [
      { label: 'Someone rings round to find out', score: 0, mins: 300 },
      { label: 'We check two systems and reply', score: 1, mins: 150 },
      { label: 'One system has it, we copy it over', score: 2, mins: 60 },
      { label: 'They can see it themselves', score: 3, mins: 0 },
    ],
  },
  {
    axis: 'technology', q: 'How do your tools talk to each other?',
    options: [
      { label: 'A person retypes between them', score: 0, mins: 420 },
      { label: 'A weekly export and import', score: 1, mins: 180 },
      { label: 'Some are wired, some are not', score: 2, mins: 90 },
      { label: 'They are integrated and stay in step', score: 3, mins: 0 },
    ],
  },
  {
    axis: 'people', q: 'When the person who knows how it works is away?',
    options: [
      { label: 'It waits for them', score: 0, mins: 200 },
      { label: 'Someone muddles through it', score: 1, mins: 100 },
      { label: 'There is a doc, mostly current', score: 2, mins: 30 },
      { label: 'Anyone on the team can pick it up', score: 3, mins: 0 },
    ],
  },
  {
    axis: 'value', q: 'Do you know what the manual work actually costs you?',
    options: [
      { label: 'No, it has never been counted', score: 0, mins: 160 },
      { label: 'A rough feel, no number', score: 1, mins: 90 },
      { label: 'Counted once, a while ago', score: 2, mins: 40 },
      { label: 'Tracked, and it informs what we build', score: 3, mins: 0 },
    ],
  },
];

// What we would do about each pillar, and roughly what it buys back. Shown ranked by the score you gave.
const PILLAR_FIXES = {
  data: { fix: 'One live view, built from the sources you already pay for.', back: 'Most of a day a week, back' },
  customer: { fix: 'A tracking page the client can open themselves.', back: 'The where-is-it calls, gone' },
  technology: { fix: 'Wire the two systems doing the most re-keying, first.', back: 'The retyping, gone' },
  people: { fix: 'Write down the three processes only one person can run.', back: 'The bus factor, fixed' },
  value: { fix: 'Count the manual hours once, properly, then sequence by cost.', back: 'A basis for every later decision' },
};

export const METHOD = {
  '8-pillar-digital-assessment': {
    kind: 'assess',
    assess: {
      title: 'The 8-pillar read', unit: 'pillars',
      intro: 'Five questions here. The real assessment walks your whole operating week and reads all eight.',
      axes: PILLARS, questions: PILLAR_QUESTIONS, fixes: PILLAR_FIXES,
      foot: 'The ranking is not ours to decide. It falls out of what you answered, which is why a real assessment is a walkthrough rather than a form.',
    },
  },

  'operations-command-centre-build': {
    kind: 'assess',
    assess: {
      title: 'Where the founders’ week goes', unit: 'pillars',
      intro: 'The same read, pointed at one question: what are the founders still doing by hand?',
      axes: PILLARS, questions: PILLAR_QUESTIONS, fixes: PILLAR_FIXES,
      buildNote: 'Then we build the cockpit that takes the top of that list off you, and we run it. Not a report, a foundation.',
      foot: 'Assessment-led, because building before you have read the week is how people end up with a tool nobody opens.',
    },
  },

  'website-audit-rebuild': {
    kind: 'assess',
    assess: {
      title: 'The audit', unit: 'dimensions',
      intro: 'Five dimensions, scored on what is actually there. Fixed scope, and the safe wins land inside the engagement.',
      axes: [
        { id: 'speed', name: 'Speed', line: 'What it costs a real phone on a real connection.' },
        { id: 'seo', name: 'SEO', line: 'Whether you can be found for what you actually do.' },
        { id: 'a11y', name: 'Accessibility', line: 'Whether everyone can use it, including on a keyboard.' },
        { id: 'conversion', name: 'Conversion', line: 'Whether a visitor knows what to do next.' },
        { id: 'brand', name: 'Brand', line: 'Whether it looks like the company you have become.' },
      ],
      questions: [
        {
          axis: 'speed', q: 'How does it feel on a mid-range phone?',
          options: [
            { label: 'Slow enough that people leave', score: 0, mins: 0 },
            { label: 'Sluggish, but it gets there', score: 1, mins: 0 },
            { label: 'Fine on wifi, heavy on mobile data', score: 2, mins: 0 },
            { label: 'Quick everywhere', score: 3, mins: 0 },
          ],
        },
        {
          axis: 'seo', q: 'Search for what you do. Where are you?',
          options: [
            { label: 'Not on the first few pages', score: 0, mins: 0 },
            { label: 'Only if you search our name', score: 1, mins: 0 },
            { label: 'Page one for some of it', score: 2, mins: 0 },
            { label: 'Found for the things that matter', score: 3, mins: 0 },
          ],
        },
        {
          axis: 'a11y', q: 'Can the site be used without a mouse?',
          options: [
            { label: 'We have never checked', score: 0, mins: 0 },
            { label: 'Partly, some things are unreachable', score: 1, mins: 0 },
            { label: 'Mostly, with rough edges', score: 2, mins: 0 },
            { label: 'Yes, and it has been tested', score: 3, mins: 0 },
          ],
        },
        {
          axis: 'conversion', q: 'What do you want a visitor to do?',
          options: [
            { label: 'We have not decided', score: 0, mins: 0 },
            { label: 'Several things, all competing', score: 1, mins: 0 },
            { label: 'One thing, but it is buried', score: 2, mins: 0 },
            { label: 'One thing, and it is obvious', score: 3, mins: 0 },
          ],
        },
        {
          axis: 'brand', q: 'Does it look like the company you are now?',
          options: [
            { label: 'It is years out of date', score: 0, mins: 0 },
            { label: 'The logo is right, nothing else is', score: 1, mins: 0 },
            { label: 'Close, but inconsistent page to page', score: 2, mins: 0 },
            { label: 'Yes, and it holds together', score: 3, mins: 0 },
          ],
        },
      ],
      fixes: {
        speed: { fix: 'Images, fonts and the render path. Measured before and after.', back: 'Usually the cheapest win on the list' },
        seo: { fix: 'Structure, metadata and the pages you are missing entirely.', back: 'Found for what you sell' },
        a11y: { fix: 'Keyboard path, contrast and labels. Fixed inside the engagement.', back: 'Everyone can use it' },
        conversion: { fix: 'One call to action, above the fold, repeated where it earns it.', back: 'The traffic you already have, converting' },
        brand: { fix: 'One system applied across every page, not a reskin of the homepage.', back: 'It looks like you again' },
      },
      noTime: true,
      foot: 'A fixed-scope audit first, so the rebuild decision is made on evidence rather than on a feeling that the site looks tired.',
    },
  },

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
    },
  },
};

// Anything else in this category gets the assessment, which is where every engagement starts anyway.
export function methodFor(svc) {
  if (!svc) return null;
  return METHOD[svc.slug] || METHOD['8-pillar-digital-assessment'];
}

export default METHOD;
