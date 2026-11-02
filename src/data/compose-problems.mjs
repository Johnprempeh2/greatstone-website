// ComposeExplorer source (GRE-3407): the business problems a visitor can pick, and the catalogue services that
// compose the answer to each. Lives next to service-catalog.mjs and refers to its services by slug only, so names,
// categories and copy always come from the catalogue. The block reads the database copy at runtime
// (compose_problems via /api/compose-problems) and uses this file only for first paint and offline. To change a
// problem: edit here, run `node scripts/gen-compose-seed.mjs`, and apply netlify/database/seed/compose-problems.sql to
// the site database; a test fails if the seed and this file drift.
//
// `source` says where a problem came from. `placeholder: true` marks wording we have not yet matched to a client
// transcript: John to confirm or replace before the page is published.
// Shape: [{ id, title, subline, services: [slug], source, placeholder }]

export const problems = [
  {
    id: 'manual-admin',
    title: 'Too much manual admin',
    subline: 'The same details typed into three systems, every week.',
    services: ['workflow-process-automation', 'app-tool-integration', 'digital-forms-intake', 'automated-inbox-request-triage', 'automated-invoicing-chasing', 'internal-team-ai-copilot'],
    source: 'GRE-3407 brief; Deep Dive canon (Automation & Integration)',
    placeholder: true,
  },
  {
    id: 'no-visibility',
    title: "Can't see what's happening across the business",
    subline: 'The numbers live in five places and arrive a month late.',
    services: ['live-operations-dashboard', 'daily-operations-brief', 'plain-english-finance-brief', 'app-tool-integration', 'board-accreditation-reporting'],
    source: 'GRE-3407 brief; Deep Dive canon (Intelligence & Reporting)',
    placeholder: true,
  },
  {
    id: 'customers-wait',
    title: 'Customers wait too long',
    subline: 'Calls go unanswered and people chase you for updates.',
    services: ['ai-customer-service-chat-agent', 'ai-phone-answering-agent', 'customer-order-status-tracking', 'automated-inbox-request-triage', 'whatsapp-sales-support-agent'],
    source: 'GRE-3407 brief; Deep Dive canon (AI Agents & Assistants)',
    placeholder: true,
  },
  {
    id: 'research-bottleneck',
    title: 'Preparing for a client session takes days',
    subline: 'The research before each workshop or board meeting is done by hand.',
    services: ['on-demand-market-research', 'automated-meeting-pre-briefs', 'live-market-intelligence-hub', 'ai-meeting-notes-recaps'],
    source: 'Client meeting, 9 Oct 2026 (GRE-1128): pre-workshop research bottleneck',
    placeholder: false,
  },
  {
    id: 'knowledge-leaves',
    title: 'Knowledge leaves when people do',
    subline: "The answer sits in one person's head or a meeting nobody wrote up.",
    services: ['company-knowledge-ai-search', 'ai-meeting-notes-recaps', 'searchable-decision-log', 'new-hire-onboarding-ai', 'notion-m365-workspace-build'],
    source: 'Deep Dive canon (Meetings & Knowledge)',
    placeholder: true,
  },
  {
    id: 'getting-paid',
    title: 'Chasing payments and renewals',
    subline: 'Invoices go out late and lapsed members are not followed up.',
    services: ['automated-invoicing-chasing', 'automated-membership-renewals', 'stripe-checkout-setup', 'online-deposits-patient-payments'],
    source: 'Deep Dive canon (Automation & Integration, Commerce & Storefronts)',
    placeholder: true,
  },
];
