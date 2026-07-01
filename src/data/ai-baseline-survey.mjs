// Content for the AI Readiness Baseline lead magnet (src/blocks/AiBaselineSurvey.jsx).
//
// Eight questions, one per Greatstone pillar (order + keys mirror maturity-seed.mjs PILLARS). Each
// question has four graded answers scored 1..4 (Laggard..Pioneer); the overall average maps to a phase
// band. The benchmark is an illustrative mid-market industry average per pillar, shown as a marker on the
// result chart. Written in the Greatstone house voice (senior operator to a C-suite reader, no em dashes,
// British English). Kept as data, separate from the block, so the copy can be tuned without touching logic.

export const SURVEY = {
  title: 'AI readiness baseline',
  intro:
    'Eight questions, one per pillar of the Greatstone method. Answer for how things actually run today, not how the deck says they should. It takes about five minutes, and the result is a defensible read on where AI will pay off first and where it will stall.',
  questions: [
    {
      pillarKey: 'people',
      question: 'When a decision about adopting or funding an AI tool needs a yes, who actually gives it, and does that person own the outcome afterwards?',
      options: [
        { label: 'No one owns it. Tools get bought in pockets of the business and nobody is accountable for whether they work.', score: 1 },
        { label: 'IT signs off on the purchase, but no named person owns the result once it is live.', score: 2 },
        { label: 'A named sponsor owns each AI initiative and is measured on its outcome, though the bench is thin if they leave.', score: 3 },
        { label: 'Ownership is explicit and distributed. Several people can sponsor, run, and be held to the numbers on an AI initiative.', score: 4 },
      ],
    },
    {
      pillarKey: 'communication',
      question: 'Can a manager two levels down explain, in one sentence, what a given AI project is meant to change and by how much?',
      options: [
        { label: 'No. The rationale lives in a few heads at the top and does not travel.', score: 1 },
        { label: 'Leadership can state the aim, but it is lost or garbled by the time it reaches the people doing the work.', score: 2 },
        { label: 'Most managers can state the intended change and roughly the target, though the number is directional rather than agreed.', score: 3 },
        { label: 'The intended change and its target metric are written down, quoted consistently across levels, and reviewed against actuals.', score: 4 },
      ],
    },
    {
      pillarKey: 'innovation',
      question: "How does a new AI idea get from someone's head to a funded, time-boxed test?",
      options: [
        { label: 'It does not. Ideas surface in meetings and die there, or depend entirely on one person pushing.', score: 1 },
        { label: 'Ad hoc. The occasional pilot happens, but there is no route and no budget set aside for it.', score: 2 },
        { label: 'There is a route: ideas get triaged and some are given a small budget and a deadline, though it runs informally.', score: 3 },
        { label: 'A standing process funds time-boxed tests with clear kill or scale criteria, and most close on schedule with a decision.', score: 4 },
      ],
    },
    {
      pillarKey: 'data',
      question: 'For the data an AI use case would depend on, do you know where it lives, who owns it, and whether it is clean enough to trust?',
      options: [
        { label: 'No. Data is scattered across systems and spreadsheets, ownership is unclear, and quality is a running assumption.', score: 1 },
        { label: 'The critical systems are known, but ownership and quality are patchy and only get checked when something breaks.', score: 2 },
        { label: 'Key datasets have named owners and documented quality, and the gaps are known and being worked through.', score: 3 },
        { label: 'The lifecycle is mapped end to end: source, owner, quality, access, and retention are documented and maintained.', score: 4 },
      ],
    },
    {
      pillarKey: 'customer',
      question: 'How well do you actually know which customers drive the value, and could an AI tool act on that knowledge without guessing?',
      options: [
        { label: 'Customer knowledge is anecdotal and sits with individual account holders, not in any system.', score: 1 },
        { label: 'You have basic segments, but the data is stale or incomplete and would not support an automated decision.', score: 2 },
        { label: 'Segments are current and reasonably complete. A tool could use them, with a human checking the edge cases.', score: 3 },
        { label: 'Customer value and behaviour are modelled on live, reliable data that an AI system can act on directly.', score: 4 },
      ],
    },
    {
      pillarKey: 'competition',
      question: 'Do you know what your competitors are doing with AI, and are you deciding your pace deliberately or reacting to theirs?',
      options: [
        { label: 'No view of the field. AI moves are made on gut or on whatever a vendor pitched last.', score: 1 },
        { label: 'You hear about competitor moves after the fact, usually from a customer or the press.', score: 2 },
        { label: 'You track the field informally and factor it in, though the response tends to be reactive.', score: 3 },
        { label: 'You watch the field deliberately and set your own pace against it, choosing where to lead and where to wait.', score: 4 },
      ],
    },
    {
      pillarKey: 'technology',
      question: 'If you added an AI tool to your stack tomorrow, how confident are you it would integrate, scale, and stay secure?',
      options: [
        { label: 'Low. The stack is a patchwork of legacy systems and manual joins, and anything new is a fight to connect.', score: 1 },
        { label: 'It depends on the tool. Some things integrate, others need workarounds, and security is reviewed late.', score: 2 },
        { label: 'The core stack is documented with clear integration points, and security review happens, though not always early.', score: 3 },
        { label: 'The stack is pressure-tested: integration, scaling, and security are assessed up front as standard, not after the fact.', score: 4 },
      ],
    },
    {
      pillarKey: 'value',
      question: 'For AI spend already made, can you show the return, and does the value flow to the customer as well as the P&L?',
      options: [
        { label: 'No. Spend is justified on faith and never revisited against a number.', score: 1 },
        { label: 'Cost is tracked, but the return is assumed rather than measured, and customer benefit is rarely part of the case.', score: 2 },
        { label: 'Return is measured for the larger initiatives, and the two-way value to customer and business is considered case by case.', score: 3 },
        { label: 'Every AI initiative carries a value case measured after the fact, with benefit to both the business and the customer made explicit.', score: 4 },
      ],
    },
  ],
  phases: [
    { key: 'laggard', label: 'Laggard', min: 1, max: 1.75, headline: 'Ahead of the tools, the basics need setting.', read: 'The groundwork is not in place yet: ownership, data, and a route for ideas are all thin. That is common and fixable. Start with one pillar, usually people or data, before buying anything.' },
    { key: 'follower', label: 'Follower', min: 1.76, max: 2.5, headline: 'Foundations exist, but they are uneven.', read: 'Some pillars are solid and others are held together informally. The risk is buying tools that outrun the weakest pillar. Firm up the two lowest scores before you scale spend.' },
    { key: 'leader', label: 'Leader', min: 2.51, max: 3.25, headline: 'Ready to scale what works.', read: 'The method is largely in place and AI investment has a fair chance of paying off. The next move is to sequence deliberately: pick the two or three use cases where the pillars are strongest and go deep.' },
    { key: 'pioneer', label: 'Pioneer', min: 3.26, max: 4, headline: 'Setting the pace others follow.', read: 'Ownership, data, and value tracking are working together, which is rare. The task now is to hold the discipline as you scale and to keep watching the field so the lead does not narrow.' },
  ],
  benchmark: { people: 2.2, communication: 2.1, innovation: 2.2, data: 2.2, customer: 2.5, competition: 2.3, technology: 2.5, value: 2.1 },
  strongestLead: 'Your strongest pillar is {pillar}. This is where AI investment has the best odds today, so build the first use case here.',
  weakestLead: 'Your weakest pillar is {pillar}. Left as is, it will cap the return on everything else, so address it before you scale spend.',
  ctaLabel: 'Book a diagnostic',
  surveyDownloadNote:
    'Download the survey as a CSV to adapt into Google Forms, Typeform, or Formstack and send round your leadership team. It carries the questions, graded answers, and scores as plain rows. It does not do the scoring or the phase bands for you, so you will wire those into your tool, or send us the results to read.',
};

export default SURVEY;
