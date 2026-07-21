// Demo scripts for the AI Agents & Assistants archetype. Pure data (no React, no DOM) so it is
// unit-testable and so the copy is reviewable in one place rather than buried in JSX.
//
// HONESTY RULE: these are scripted prototypes shown on a public marketing page. Every answer here must be
// something the service could genuinely produce, and the UI labels the panel as a prototype with sample
// sources. Never write an answer that implies live customer data or a real integration is connected.
//
// Shape: { [slug]: { assistant, channel, greeting, privacy, prompts: [{ q, a, sources: [] }] } }
//   assistant  the name shown in the console header (the buyer's own assistant, not "Greatstone AI")
//   channel    where this agent lives, shown as a subtle badge (Web, WhatsApp, Voice, Internal)
//   privacy    the one-line boundary statement, the thing buyers of private AI actually care about
//   prompts    2 or 3 realistic questions with grounded answers and cited sources

export const DEFAULT_PRIVACY = 'Runs in your tenant. Your documents never leave it.';

export const AGENT_SCRIPTS = {
  'private-ai-assistant': {
    assistant: 'Your private assistant',
    channel: 'Internal',
    greeting: 'Ask me anything from your document store. I only answer from what you are cleared to see, and I cite every source.',
    privacy: 'Runs in your tenant. Your documents never leave it.',
    prompts: [
      {
        q: 'What is our notice period for a fixed-term contractor?',
        a: 'Four weeks written notice on either side, after the first month. Inside the first month it is one week. Termination for cause is immediate and needs sign-off from a director.',
        sources: ['Contractor Handbook 2026.pdf, section 4.2', 'Standard FTC template.docx, clause 11'],
      },
      {
        q: 'Which suppliers are we contractually allowed to share client data with?',
        a: 'Only the three named in Schedule 2 of the client MSA: the hosting provider, the payment processor and the archival service. Anything else needs a written variation signed by the client before data moves.',
        sources: ['Client MSA (executed).pdf, schedule 2', 'Data Processing Policy.pdf, p.7'],
      },
      {
        q: 'Summarise what changed in the policy since last year.',
        a: 'Three material changes: remote-work approval moved from line manager to department head, the expense threshold needing pre-approval dropped from 500 to 250, and a new clause requires client data to stay in the UK or EEA.',
        sources: ['Company Policy v9.pdf', 'Company Policy v8.pdf (compared)'],
      },
    ],
  },

  'ai-customer-service-chat-agent': {
    assistant: 'Customer assistant',
    channel: 'Web + WhatsApp',
    greeting: 'Hello. I can answer questions about our services and pricing, and book you in with the team.',
    privacy: 'Trained only on your services, pricing and policies.',
    prompts: [
      {
        q: 'Do you work with businesses outside the UK?',
        a: 'Yes. We work across the UK and West Africa, with teams covering both time zones. Delivery and support are the same in either region, and we invoice in GBP or USD.',
        sources: ['Services page', 'Coverage & regions.md'],
      },
      {
        q: 'Can I book a call for Thursday afternoon?',
        a: 'Thursday has two slots free: 14:00 and 16:30 UK time. I can hold one now if you give me your name, company and email, and it goes straight into the right diary.',
        sources: ['Live calendar availability', 'Booking rules.md'],
      },
    ],
  },

  'ai-phone-answering-agent': {
    assistant: 'Reception',
    channel: 'Voice',
    greeting: 'Good evening, thank you for calling. The office is closed, but I can help or take a booking.',
    privacy: 'Answers from your own FAQs and procedures.',
    prompts: [
      {
        q: 'What time do you open tomorrow?',
        a: 'We open at 8:30 tomorrow morning and close at 17:30. If it is urgent I can take your number and have someone call you back first thing.',
        sources: ['Opening hours.md', 'After-hours procedure.pdf'],
      },
      {
        q: 'I need to reschedule my appointment on Friday.',
        a: 'I have found your Friday 11:00 appointment. The next openings are Monday 09:30 or Tuesday 14:00. Shall I move it, and would you like the confirmation by text or email?',
        sources: ['Calendar (connected)', 'Rescheduling policy.md'],
      },
    ],
  },

  'internal-team-ai-copilot': {
    assistant: 'Team copilot',
    channel: 'Internal',
    greeting: 'I draft in your tone, from your templates. Give me the request and I will prepare the next step.',
    privacy: 'Grounded in your templates, tone and policies.',
    prompts: [
      {
        q: 'Draft a reply to a client asking for a discount.',
        a: 'Drafted in your house voice: it thanks them, holds the price, and reframes on value with the two outcomes from their last review. It offers a longer term at the same rate as the alternative. Ready for you to send or edit.',
        sources: ['Tone of voice guide.md', 'Pricing policy.pdf, p.3', 'Client account notes'],
      },
      {
        q: 'Triage this inbound request and tell me who owns it.',
        a: 'Classified as a billing query, not support. Owner is the finance queue, priority normal, and I have pre-filled the response with the invoice reference and payment terms so it can go out in one click.',
        sources: ['Routing rules.md', 'Invoice records'],
      },
    ],
  },

  'industry-specific-private-ai': {
    assistant: 'Compliance assistant',
    channel: 'Internal',
    greeting: 'I answer only from your rulebook, precedents and filings, and I refuse to go beyond them.',
    privacy: 'Grounded strictly in your own sources. No outside invention.',
    prompts: [
      {
        q: 'Are we allowed to onboard a client before ID verification completes?',
        a: 'No. Onboarding may not complete until identity verification passes. You may open a provisional record and gather documents, but no service may be provided and no funds accepted until verification clears.',
        sources: ['AML Policy 2026.pdf, clause 6.1', 'Onboarding SOP.docx, step 4'],
      },
      {
        q: 'Is there a precedent for a 90-day payment term?',
        a: 'Two precedents, both for public-sector clients, both with a mandatory interest clause on late payment. Neither was granted to a private company. The standard remains 30 days.',
        sources: ['Contract archive: PS-2024-11', 'Contract archive: PS-2025-03'],
      },
    ],
  },

  'ai-risk-fraud-screening': {
    assistant: 'Screening analyst',
    channel: 'Internal',
    greeting: 'I read every case against your risk criteria, rank what matters, and show my working.',
    privacy: 'Screening runs privately against your own criteria.',
    prompts: [
      {
        q: 'Why was case 4471 flagged as high risk?',
        a: 'Three signals combined: the payee was added within 24 hours of the transfer, the amount is 6 times this account\'s rolling average, and the destination country is on your enhanced-diligence list. Any one alone would be low. Together they exceed your threshold.',
        sources: ['Risk criteria v3.md, rules R2, R7, R11', 'Account history (24 months)'],
      },
      {
        q: 'What is in the queue this morning?',
        a: 'Nine cases. Two high risk needing review today, three medium, and four I have suppressed as repeat low-value alerts on already-cleared accounts, with the reasoning recorded against each.',
        sources: ['Overnight screening run', 'Suppression rules.md'],
      },
    ],
  },

  'multilingual-ai-translation': {
    assistant: 'Multilingual assistant',
    channel: 'Web + WhatsApp',
    greeting: 'I answer in the language the visitor writes in, including Twi, Ga, Ewe, Hausa and Pidgin.',
    privacy: 'Your content, translated on your terms.',
    prompts: [
      {
        q: 'Me pɛ sɛ mehunu mo fee schedule no.',
        a: 'Yɛwɔ fee schedule ahodoɔ mmiɛnsa: Standard, Business ne Enterprise. Standard fri GHS 250 kɔsi bosome biara. Mɛtumi de nyinaa akyerɛ wo wɔ Twi mu, anaasɛ mɛsoma no wɔ WhatsApp so. (Answered in Twi, from your published fee schedule.)',
        sources: ['Fee schedule 2026.pdf', 'Language pack: Twi'],
      },
      {
        q: 'Abeg, how much be the joining fee?',
        a: 'The joining fee na GHS 150, one time. After that na the monthly plan you choose. I fit send you the full breakdown for WhatsApp make you check am anytime. (Answered in Pidgin, same source of truth.)',
        sources: ['Fee schedule 2026.pdf', 'Language pack: Pidgin'],
      },
    ],
  },

  'whatsapp-sales-support-agent': {
    assistant: 'Shop assistant',
    channel: 'WhatsApp',
    greeting: 'Hi. I can check stock, recommend something and take your order right here in the chat.',
    privacy: 'Reads your live catalogue, so stock and prices are real.',
    prompts: [
      {
        q: 'Do you have the 20kg bag in stock?',
        a: 'Yes, 14 left at the Accra store and 6 in East Legon. It is GHS 320. Want me to reserve one, or put it straight through with a payment link?',
        sources: ['Live catalogue', 'Stock by location'],
      },
      {
        q: 'Send me the same order as last time.',
        a: 'Your last order was 2 x 20kg and 1 x conditioner, GHS 745 total. I have rebuilt it and here is a secure payment link. Delivery to the same address on file, arriving Thursday.',
        sources: ['Order history', 'Stripe payment link'],
      },
    ],
  },

  'whatsapp-member-support-ai': {
    assistant: 'Member support',
    channel: 'WhatsApp',
    greeting: 'Ask me about the constitution, fees, notices or events. If I do not know, I will say so and pass you to a person.',
    privacy: 'Answers only from your constitution, by-laws and notices.',
    prompts: [
      {
        q: 'How much are the annual dues and when are they due?',
        a: 'Annual dues are 120, payable by 31 March. Members joining after 1 October pay a half-year rate of 60 for that first year. Late payment after 30 April adds a 15 reinstatement fee.',
        sources: ['By-laws 2026.pdf, article 7', 'Fee schedule notice, Jan 2026'],
      },
      {
        q: 'Can my cousin attend the AGM as my guest?',
        a: 'I cannot answer that one from the documents I hold. The by-laws cover member attendance and proxies but do not mention guests. I am passing this to the secretary, who will come back to you.',
        sources: ['By-laws 2026.pdf, article 12 (no guest provision found)'],
      },
    ],
  },

  'ai-recruitment-screening-assistant': {
    assistant: 'Recruiting copilot',
    channel: 'Internal',
    greeting: 'I score applicants against the role\'s real criteria, with the reasoning attached, and keep every candidate informed.',
    privacy: 'Scores against your criteria, with reasoning recorded.',
    prompts: [
      {
        q: 'Who are the top candidates for the operations role?',
        a: 'Three of 214 clear every must-have. Ranked: one with 6 years in a comparable operation and the systems experience, one with less tenure but direct process-automation delivery, and one internal applicant. Reasoning is attached to each so you can disagree with it.',
        sources: ['Role scorecard.md', '214 applications screened'],
      },
      {
        q: 'Has everyone had a reply?',
        a: 'Yes. All 214 acknowledged within the hour of applying. 198 have had a decision, and the remaining 16 are on hold pending your shortlist review, with an update scheduled for Friday if nothing changes.',
        sources: ['Candidate comms log', 'Status rules.md'],
      },
    ],
  },
};

// Any AI service without a hand-written script still gets a working, honest demo built from its own
// catalogue fields, so the archetype degrades gracefully rather than showing an empty console.
export function scriptFor(svc) {
  if (!svc) return null;
  const hand = AGENT_SCRIPTS[svc.slug];
  if (hand) return hand;
  const bullets = Array.isArray(svc.bullets) ? svc.bullets.map((b) => b && b.text).filter(Boolean) : [];
  if (!bullets.length) return null;
  return {
    assistant: svc.name || 'Your assistant',
    channel: 'Demo',
    greeting: svc.oneLiner || 'Ask me a question to see how this works.',
    privacy: DEFAULT_PRIVACY,
    prompts: [
      { q: 'What can you do?', a: bullets[0], sources: ['Your configuration'] },
      ...(bullets[1] ? [{ q: 'How does that work in practice?', a: bullets[1], sources: ['Your configuration'] }] : []),
    ],
  };
}

export default AGENT_SCRIPTS;
