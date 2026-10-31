-- GRE-3407. The ComposeExplorer mapping: business problems and the catalogue services that compose the answer.
-- Services are referenced by slug (the Managed Services catalogue is CMS content, keyed by slug, as in
-- service_popularity), so there is no foreign key to a services table. Public read; staff edit through the
-- source file and the generated seed (netlify/database/seed/compose-problems.sql), never from the browser.
CREATE TABLE IF NOT EXISTS public.compose_problems (
  id          text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{1,80}$'),
  title       text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  subline     text NOT NULL DEFAULT '' CHECK (char_length(subline) <= 200),
  source      text NOT NULL DEFAULT '' CHECK (char_length(source) <= 300),
  placeholder boolean NOT NULL DEFAULT true,
  sort        integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compose_problem_services (
  problem_id   text NOT NULL REFERENCES public.compose_problems(id) ON DELETE CASCADE,
  service_slug text NOT NULL CHECK (service_slug ~ '^[a-z0-9-]{1,120}$'),
  sort         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (problem_id, service_slug)
);

ALTER TABLE public.compose_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compose_problem_services ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compose_problems, public.compose_problem_services FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.compose_problems, public.compose_problem_services TO anon, authenticated;
CREATE POLICY public_read ON public.compose_problems FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY public_read ON public.compose_problem_services FOR SELECT TO anon, authenticated USING (true);

-- Initial rows, as generated from src/data/compose-problems.mjs on 31 Oct 2026. Later edits go through the seed.
INSERT INTO public.compose_problems (id, title, subline, source, placeholder, sort) VALUES
  ('manual-admin', 'Too much manual admin', 'The same details typed into three systems, every week.', 'GRE-3407 brief; Deep Dive canon (Automation & Integration)', true, 0),
  ('no-visibility', 'Can''t see what''s happening across the business', 'The numbers live in five places and arrive a month late.', 'GRE-3407 brief; Deep Dive canon (Intelligence & Reporting)', true, 1),
  ('customers-wait', 'Customers wait too long', 'Calls go unanswered and people chase you for updates.', 'GRE-3407 brief; Deep Dive canon (AI Agents & Assistants)', true, 2),
  ('research-bottleneck', 'Preparing for a client session takes days', 'The research before each workshop or board meeting is done by hand.', 'Client meeting, 9 Oct 2026 (GRE-1128): pre-workshop research bottleneck', false, 3),
  ('knowledge-leaves', 'Knowledge leaves when people do', 'The answer sits in one person''s head or a meeting nobody wrote up.', 'Deep Dive canon (Meetings & Knowledge)', true, 4),
  ('getting-paid', 'Chasing payments and renewals', 'Invoices go out late and lapsed members are not followed up.', 'Deep Dive canon (Automation & Integration, Commerce & Storefronts)', true, 5)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.compose_problem_services (problem_id, service_slug, sort) VALUES
  ('manual-admin', 'workflow-process-automation', 0),
  ('manual-admin', 'app-tool-integration', 1),
  ('manual-admin', 'digital-forms-intake', 2),
  ('manual-admin', 'automated-inbox-request-triage', 3),
  ('manual-admin', 'automated-invoicing-chasing', 4),
  ('manual-admin', 'internal-team-ai-copilot', 5),
  ('no-visibility', 'live-operations-dashboard', 0),
  ('no-visibility', 'daily-operations-brief', 1),
  ('no-visibility', 'plain-english-finance-brief', 2),
  ('no-visibility', 'app-tool-integration', 3),
  ('no-visibility', 'board-accreditation-reporting', 4),
  ('customers-wait', 'ai-customer-service-chat-agent', 0),
  ('customers-wait', 'ai-phone-answering-agent', 1),
  ('customers-wait', 'customer-order-status-tracking', 2),
  ('customers-wait', 'automated-inbox-request-triage', 3),
  ('customers-wait', 'whatsapp-sales-support-agent', 4),
  ('research-bottleneck', 'on-demand-market-research', 0),
  ('research-bottleneck', 'automated-meeting-pre-briefs', 1),
  ('research-bottleneck', 'live-market-intelligence-hub', 2),
  ('research-bottleneck', 'ai-meeting-notes-recaps', 3),
  ('knowledge-leaves', 'company-knowledge-ai-search', 0),
  ('knowledge-leaves', 'ai-meeting-notes-recaps', 1),
  ('knowledge-leaves', 'searchable-decision-log', 2),
  ('knowledge-leaves', 'new-hire-onboarding-ai', 3),
  ('knowledge-leaves', 'notion-m365-workspace-build', 4),
  ('getting-paid', 'automated-invoicing-chasing', 0),
  ('getting-paid', 'automated-membership-renewals', 1),
  ('getting-paid', 'stripe-checkout-setup', 2),
  ('getting-paid', 'online-deposits-patient-payments', 3)
ON CONFLICT (problem_id, service_slug) DO NOTHING;
