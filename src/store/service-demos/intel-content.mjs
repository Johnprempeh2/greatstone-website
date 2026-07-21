// Content for the Intelligence & Reporting archetype.
//
// The whole category sells one thing: numbers that explain themselves. Nine services, three ways of doing
// it, so three kinds inside the archetype:
//
//   dash   KPI tiles you drill into, a trend, and a sentence saying what moved and why   (3 services)
//   list   a ranked or tiered list where every row shows its reason, and opens its evidence (3)
//   brief  a written edition that changes with who is reading it, or with what was asked   (3)
//
// HONESTY RULE: every figure here is invented for the demonstration and the frame says so. What is real is
// the behaviour: selecting a tile genuinely recomputes the chart and the commentary from this data, the
// filters genuinely filter, and the evidence genuinely belongs to the row it sits under.
//
// The commentary lines are the point of the category. A number with no sentence attached is a number
// somebody still has to interpret, which is the thing these services exist to stop.

export const PANELS = {
  // ── dash ───────────────────────────────────────────────────────────────────────────────────────────
  'live-operations-dashboard': {
    kind: 'dash',
    dash: {
      roles: [
        { id: 'lead', label: 'Leadership' },
        { id: 'ops', label: 'Operations' },
      ],
      unit: 'This week',
      tiles: [
        {
          id: 'revenue', role: ['lead'], label: 'Revenue booked', value: '£184k', delta: '+12%', good: true,
          series: [131, 139, 128, 152, 147, 163, 171, 184],
          say: 'Up 12% on last week, and the rise is all in one place: three deals that had been sitting in contract since June closed together. Underlying run rate has not moved.',
        },
        {
          id: 'cash', role: ['lead'], label: 'Cash collected', value: '£96k', delta: '-18%', good: false, alert: true,
          series: [140, 132, 128, 121, 118, 109, 117, 96],
          say: 'Sixth straight week down, and now below the alert line. Not a sales problem: invoices are going out and not being paid. Two accounts are 45 days over between them.',
        },
        {
          id: 'jobs', role: ['lead', 'ops'], label: 'Jobs completed', value: '312', delta: '+4%',
          series: [281, 288, 279, 296, 291, 302, 300, 312],
          say: 'Steady growth with no extra headcount, so throughput per engineer is genuinely improving rather than being bought.',
        },
        {
          id: 'sla', role: ['ops'], label: 'SLA breaches', value: '7', delta: '+3', good: false, alert: true,
          series: [2, 1, 3, 2, 4, 3, 4, 7],
          say: 'Seven breaches, up from four. Six of them are on the Tuesday and Wednesday routes, which is when the two newest engineers are both on shift.',
        },
        {
          id: 'queue', role: ['ops'], label: 'Open queue', value: '48', delta: '-9',
          series: [71, 68, 72, 64, 61, 57, 57, 48],
          say: 'The queue is falling faster than jobs are arriving, so the backlog built in June is finally clearing.',
        },
      ],
    },
  },

  'demand-stock-forecasting': {
    kind: 'dash',
    dash: {
      unit: 'Next 8 weeks',
      projected: 3,
      tiles: [
        {
          id: 'demand', label: 'Units forecast', value: '1,340', delta: '+22%',
          series: [880, 940, 910, 1010, 1080, 1150, 1240, 1340],
          say: 'Demand climbs into the seasonal peak your own three years of orders show every August. The last three points are the forecast, not history.',
          rec: 'Order 1,400 units by Friday. Your supplier takes 11 days and the peak starts in 14.',
        },
        {
          id: 'fast', label: 'Fast movers at risk', value: '4 SKUs', delta: '+2', good: false, alert: true,
          series: [1, 1, 2, 2, 2, 3, 3, 4],
          say: 'Four lines will run dry before the reorder lands at current velocity. Two of them are the ones that pull the rest of the basket.',
          rec: 'Split the order: air-freight the four fast movers, sea-freight the rest. The premium is smaller than the lost basket.',
        },
        {
          id: 'capital', label: 'Working capital tied up', value: '£71k', delta: '-14%', good: true,
          series: [96, 94, 89, 88, 84, 79, 74, 71],
          say: 'Falling because the slow lines are no longer being reordered on a fixed cycle. That is £25k released since April without a single stockout.',
          rec: 'Hold. The current buffer is the smallest it can be without risking the peak.',
        },
        {
          id: 'crew', label: 'Crew hours needed', value: '186', delta: '+31',
          series: [140, 144, 138, 151, 158, 166, 174, 186],
          say: 'The same peak that drives units drives shifts. Thirty-one extra hours a week is roughly one additional person from the middle of the month.',
          rec: 'Book the agency cover now. Booked two weeks out it costs about a third less than booked on the day.',
        },
      ],
    },
  },

  'board-accreditation-reporting': {
    kind: 'dash',
    dash: {
      unit: 'Q3 board pack',
      audit: true,
      tiles: [
        {
          id: 'income', label: 'Total income', value: '£2.41m', delta: '+8%',
          series: [1980, 2040, 2110, 2090, 2180, 2260, 2330, 2410],
          say: 'Growth is in unrestricted income, which is the line trustees ask about, because it is the one that pays for the things no funder will fund.',
          from: 'Xero, general ledger, closed 14 July. Reconciled to the bank.',
        },
        {
          id: 'reserves', label: 'Free reserves', value: '4.2 months', delta: '+0.4',
          series: [3.1, 3.2, 3.4, 3.5, 3.6, 3.9, 3.8, 4.2],
          say: 'Above the policy floor of three months for the fourth quarter running, which is the sentence the accreditation panel is looking for.',
          from: 'Xero balance sheet, less restricted funds per the fund register.',
        },
        {
          id: 'learners', label: 'Learners enrolled', value: '1,884', delta: '+11%',
          series: [1490, 1540, 1610, 1655, 1700, 1760, 1810, 1884],
          say: 'Enrolment growth is ahead of headcount growth, so the cost per learner is falling. That ratio is the one the funder tracks.',
          from: 'Student records system, nightly export, 21 July.',
        },
        {
          id: 'completion', label: 'Completion rate', value: '87%', delta: '-2pts', good: false, alert: true,
          series: [91, 90, 91, 89, 90, 88, 89, 87],
          say: 'Down two points and now below the 88% threshold the accreditation standard sets. The whole of the fall sits in one cohort that started late.',
          from: 'Student records system, completions table, excluding deferrals per the standard.',
        },
      ],
    },
  },

  // ── list ───────────────────────────────────────────────────────────────────────────────────────────
  'customer-churn-early-warning': {
    kind: 'list',
    list: {
      what: 'people', filterLabel: 'Risk',
      tiers: [
        { id: 'risk', label: 'At risk', tone: 'bad' },
        { id: 'drift', label: 'Drifting', tone: 'warn' },
        { id: 'ok', label: 'On track', tone: 'good' },
      ],
      // phrased to read correctly after any number, since the count is rendered in front of it
      callToAction: 'to call this week',
      rows: [
        { id: 1, name: 'Adjoa Mensah', meta: 'Level 3 Diploma, cohort B', tier: 'risk', why: 'No submission in 21 days, and stopped opening the weekly email in June.', evidence: ['Last login 21 days ago (was every 2 to 3 days)', 'Two assignments missed, no extension requested', 'Opened 0 of the last 5 emails', 'Attendance fell from 94% to 61% after the timetable moved'], call: true },
        { id: 2, name: 'Meridian Group', meta: 'Enterprise, renews October', tier: 'risk', why: 'Seat usage halved after their champion left, and nobody has been onboarded in her place.', evidence: ['Active seats 40 down to 19 in six weeks', 'Champion’s account deactivated 12 June', 'No admin has logged in since', 'Two support tickets, both unanswered by them'], call: true },
        { id: 3, name: 'Kwesi Owusu', meta: 'Level 2 Certificate', tier: 'drift', why: 'Still submitting, but everything now arrives on the deadline rather than ahead of it.', evidence: ['Submissions moved from 3 days early to same-day', 'Attendance steady at 88%', 'One support contact about fees'] },
        { id: 4, name: 'Northgate Legal', meta: 'Team plan, renews March', tier: 'drift', why: 'Usage is flat while their headcount grew, so the tool is not reaching the new joiners.', evidence: ['Seats unchanged at 12 while the firm hired 5', 'Weekly sessions per seat down from 4.1 to 2.8'] },
        { id: 5, name: 'Ama Serwaa', meta: 'Level 3 Diploma, cohort A', tier: 'ok', why: 'Every signal steady or improving. No action needed.', evidence: ['Attendance 96%', 'All submissions early', 'Booked next term already'] },
        { id: 6, name: 'Bramley Trust', meta: 'Team plan, renews July', tier: 'ok', why: 'Deepening rather than drifting: more people, used more often.', evidence: ['Seats 8 up to 14', 'Two new departments onboarded', 'Weekly sessions per seat up to 5.2'] },
      ],
    },
  },

  'customer-feedback-analysis': {
    kind: 'list',
    list: {
      what: 'themes', filterLabel: 'Sentiment', sortByVolume: true,
      tiers: [
        { id: 'bad', label: 'Hurting', tone: 'bad' },
        { id: 'warn', label: 'Mixed', tone: 'warn' },
        { id: 'good', label: 'Loved', tone: 'good' },
      ],
      callToAction: 'Spiking this month',
      rows: [
        { id: 1, name: 'Waiting on hold', meta: '212 mentions, up 74% this month', tier: 'bad', why: 'The single biggest driver of low scores, and it started spiking the week the phone rota changed.', evidence: ['"Twenty minutes before anyone picked up." Call transcript, 8 July', '"I gave up and drove over." Review, 11 July', '"Third time calling about the same thing." Ticket 4471', 'Mentions per week: 31, 44, 58, 79'], call: true },
        { id: 2, name: 'Billing confusion', meta: '96 mentions, up 12%', tier: 'bad', why: 'Nobody disputes the amount. They dispute not being able to tell what it is for.', evidence: ['"The invoice does not say which site it is for." Ticket 4402', '"Charged twice, turned out it was two jobs." Review, 2 July', '"I just want a breakdown." Survey response'] },
        { id: 3, name: 'Booking online', meta: '154 mentions, down 8%', tier: 'warn', why: 'Improving since the new form went live, but the people who struggle now struggle badly.', evidence: ['"Much easier than ringing." Survey, 14 July', '"Could not find a Saturday slot anywhere." Review, 9 July', '"Worked fine on my laptop, not on my phone." Ticket 4455'] },
        { id: 4, name: 'The engineers', meta: '341 mentions, up 6%', tier: 'good', why: 'The most-mentioned theme in the whole set, and almost entirely positive. It is what people actually buy.', evidence: ['"Danny explained what he was doing the whole way through." Review, 12 July', '"On time, clean, no fuss." Survey', '"Asked for the same engineer again." Call transcript'] },
        { id: 5, name: 'Getting an update', meta: '88 mentions, down 41%', tier: 'good', why: 'Was the second-biggest complaint in April. The tracking page took it out.', evidence: ['"I could see where he was." Review, 6 July', '"Did not need to ring at all." Survey', 'Mentions per week: 44, 31, 19, 12'] },
      ],
    },
  },

  'live-market-intelligence-hub': {
    kind: 'list',
    list: {
      what: 'movers', filterLabel: 'Movement', ranked: true,
      tiers: [
        { id: 'up', label: 'Climbing', tone: 'good' },
        { id: 'flat', label: 'Holding', tone: 'warn' },
        { id: 'down', label: 'Slipping', tone: 'bad' },
      ],
      callToAction: 'Moved this cycle',
      rows: [
        { id: 1, name: 'Frontier Payments', meta: 'Score 84, up 6 places', tier: 'up', why: 'Cleared licensing in two more markets and shipped the merchant app everyone was waiting on.', evidence: ['Bank of Ghana licence granted, 3 July', 'Merchant app out of beta, 9 July', 'Two senior hires from a larger rival', 'Pricing page cut fees on the entry tier'], call: true },
        { id: 2, name: 'Adinkra Mobile', meta: 'Score 79, up 2 places', tier: 'up', why: 'Quietly winning on distribution rather than product: agents, not features.', evidence: ['Agent network grew past 4,000', 'Partnership with a fuel retailer announced', 'No product release this cycle'], call: true },
        { id: 3, name: 'Meridian Bank', meta: 'Score 71, unchanged', tier: 'flat', why: 'Holding position. Everything announced this cycle was a restatement of last cycle.', evidence: ['Annual report published, no new commitments', 'Same three products on the pricing page'] },
        { id: 4, name: 'Coastal Union', meta: 'Score 63, down 1 place', tier: 'flat', why: 'Not slipping so much as standing still while two rivals moved.', evidence: ['No releases since May', 'Careers page down to 2 roles from 11'] },
        { id: 5, name: 'Legacy Trust', meta: 'Score 48, down 7 places', tier: 'down', why: 'The steepest fall in the index. Withdrew from two markets and lost the team that built the app.', evidence: ['Exited Nigeria and Sierra Leone, 28 June', 'Four engineering leads left in one month', 'App store rating fell from 4.1 to 3.2', 'Support response time doubled'], call: true },
      ],
    },
  },

  // ── brief ──────────────────────────────────────────────────────────────────────────────────────────
  'plain-english-finance-brief': {
    kind: 'brief',
    brief: {
      pickerLabel: 'Written for',
      editions: [
        {
          id: 'ceo', label: 'Chief executive', stamp: 'Monday 20 July, 07:00',
          headline: 'Revenue is fine. Cash is not.',
          sections: [
            { h: 'What moved', b: 'Revenue booked £184k, up 12%. Cash collected £96k, down 18% and the sixth fall in a row. Margin held at 41%.' },
            { h: 'Why', b: 'The revenue rise is three contracts that had been stuck since June closing in the same week, so it is timing rather than growth. The cash fall is not a sales problem: invoices are going out on time and sitting unpaid. Two accounts hold £61k between them, both past 45 days.' },
            { h: 'What to watch', b: 'At this collection rate the cash buffer reaches 6 weeks by the end of August. That is the point where the hiring plan would have to move. Chasing the two accounts is worth more this month than any new deal.' },
          ],
        },
        {
          id: 'fin', label: 'Finance lead', stamp: 'Monday 20 July, 07:00',
          headline: 'Two accounts are carrying the whole variance.',
          sections: [
            { h: 'What moved', b: 'Debtor days 38 to 51. Ageing over 45 days up from £18k to £61k. DSO worst since January. Revenue recognition unaffected: all three closures are properly in period.' },
            { h: 'Why', b: 'Meridian (£37k, 52 days) has changed finance system and says the invoice was never received. Bramley (£24k, 47 days) is disputing one line on a job sheet, which is holding the whole invoice rather than the disputed part.' },
            { h: 'What to watch', b: 'Splitting the Bramley invoice releases £21k immediately without settling the dispute. Meridian needs the invoice reissuing to a new address, not chasing. Neither is a credit risk on current evidence.' },
          ],
        },
      ],
    },
  },

  'daily-operations-brief': {
    kind: 'brief',
    brief: {
      pickerLabel: 'Written for',
      editions: [
        {
          id: 'lead', label: 'Leadership', stamp: 'Tuesday 21 July, 06:30',
          headline: 'One decision needed today, and it is about Thursday.',
          sections: [
            { h: 'Needs you today', b: 'The Thursday install at Bramley clashes with the annual service at Meridian, and both are contractual. One has to move, and moving Meridian costs a penalty while moving Bramley costs goodwill. Danny can do neither alone.' },
            { h: 'What happened overnight', b: '38 items arrived across the inbox and WhatsApp. 19 were routine and are already answered. 5 are flagged urgent, 4 of them from the same site. Nothing broke.' },
            { h: 'Worth knowing', b: 'The queue fell below 50 for the first time since April. Two engineers have now completed gas certification, which widens Thursday’s options if you want a third route.' },
          ],
        },
        {
          id: 'ops', label: 'Operations', stamp: 'Tuesday 21 July, 06:30',
          headline: 'Thursday is over-committed by one engineer.',
          sections: [
            { h: 'Today', b: '14 jobs booked, 2 unconfirmed. Priya is on a half-day from 13:00. The Salford van is due its MOT and is currently on the board for a full day.' },
            { h: 'What slipped', b: 'Job 4465 at Didsbury has been held three days waiting on access. The customer has now given a key-safe code, so it can go back on the board today.' },
            { h: 'Watch', b: 'Tuesday and Wednesday routes account for 6 of the 7 SLA breaches this month, and both are the shifts where the two newest engineers overlap. Pairing one of them with Marcus would test whether it is routing or experience.' },
          ],
        },
      ],
    },
  },

  'on-demand-market-research': {
    kind: 'brief',
    brief: {
      pickerLabel: 'Commissioned question', cited: true,
      editions: [
        {
          id: 'q1', label: 'Mobile money in Ghana', stamp: 'Delivered in 40 minutes, 31 sources read',
          headline: 'The market is consolidating around distribution, not product.',
          sections: [
            { h: 'The landscape', b: 'Three operators hold the majority of active wallets, and the gap between them has narrowed for six consecutive quarters. Growth is now coming from agent density in secondary towns rather than from features.', src: ['Bank of Ghana payment systems statistics, Q2', 'Operator annual reports, 2025 and 2026'] },
            { h: 'What changed', b: 'Interoperability made switching cheap, so the moat moved from the wallet to the agent on the corner. The operator that grew fastest this year shipped almost nothing and added 4,000 agents.', src: ['GhIPSS interoperability volumes, June', 'Company press releases, cross-checked against app release notes'] },
            { h: 'What we could not verify', b: 'Two widely-repeated market-share figures trace back to a single unsourced blog post and are excluded here. The claim that a fourth entrant has a banking licence could not be confirmed against the regulator’s register.', src: ['Bank of Ghana licence register, checked 21 July'] },
          ],
        },
        {
          id: 'q2', label: 'Should we enter Kenya?', stamp: 'Delivered in 55 minutes, 44 sources read',
          headline: 'The market is bigger and considerably harder. Enter through a partner or not at all.',
          sections: [
            { h: 'The case for', b: 'Roughly three times the addressable base, an established rail everyone already uses, and regulation that is clearer than Ghana’s on paper.', src: ['Central Bank of Kenya annual payments report', 'Two operator investor decks, 2026'] },
            { h: 'The case against', b: 'The incumbent holds a position no direct entrant has moved in a decade, and the last four foreign entrants either partnered or withdrew inside three years.', src: ['Company filings and press coverage, 2019 to 2026', 'Regulator approval notices'] },
            { h: 'What we could not verify', b: 'Reported customer-acquisition costs vary by a factor of six across sources with no consistent definition, so no figure is quoted. Treat any single CAC number for this market as unsupported.', src: ['Six vendor and press sources, all inconsistent'] },
          ],
        },
      ],
    },
  },
};

// Any reporting service without a hand-built panel still gets an honest one: a brief assembled from its own
// catalogue copy. A brief is the safe default because every service in this category ends in something
// written, even the ones that start as a dashboard.
export function panelFor(svc) {
  if (!svc) return null;
  const hand = PANELS[svc.slug];
  if (hand) return hand;
  const bullets = (Array.isArray(svc.bullets) ? svc.bullets.map((b) => b && b.text).filter(Boolean) : []).slice(0, 3);
  if (bullets.length < 2) return null;
  return {
    kind: 'brief',
    brief: {
      pickerLabel: 'Edition',
      editions: [{
        id: 'only', label: 'Standard', stamp: 'Scheduled delivery',
        headline: svc.oneLiner || svc.name,
        sections: bullets.map((t, i) => ({ h: ['What you get', 'How it works', 'What it changes'][i] || 'Detail', b: t })),
      }],
    },
  };
}

export default PANELS;
