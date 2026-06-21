# DX Engagement Hub — build log & plan (the `/loop`)

> John's brief (21 Jun 2026, voice): critically upgrade the customer **user page** to state-of-the-art
> best practice; add **DX engagement tracking** — a per-company history of meeting recaps (inline HTML
> *or* an external link e.g. a deployed Netlify recap) so a client can track their digital-experience
> journey; give the **organization a hub** that is *separate but linked* from the user page; make the
> **company admin** evident. "Use the whole evening… by the morning you've done incredible stuff."
> Multiple agents allowed; other sessions are live in parallel (AI Intel Hub → `src/intel/`,
> `src/data/ai-intel*`) — **stay out of those paths.**

## The model (locked)
- **company = `customers` row**, **member = `customer_users`**, **company admin = `is_primary` (now also `role='admin'`)**.
- Two surfaces: **`#account`** = the *personal* user page (me); **`#org`** = the *organization* dashboard (the company). Separate, bidirectionally linked.
- **DX Engagement** = new `engagements` table, **staff-curated, customer-read**. Each item is a typed timeline entry (recap/milestone/deliverable/kickoff/review/note) that is EITHER inline `body_html` OR an `external_url` (Netlify recap, Notion, doc). Connects directly to John's existing `meeting-recap` skill (which deploys branded recap pages to Netlify).

## Security (mirrors the established model — see 0004/0008/0009)
- `engagements`: `staff_all` (FOR ALL, `org_id = app_staff_org()`) OR'd with `customer_self` (FOR SELECT, `customer_id = app_customer_id()` AND `status='shared'`). Buyers get **no writes**.
- `customer_users.role` added; the 0009 buyer-guard also blocks `role` changes (no self-promotion).
- "New since last visit" is **localStorage per browser** (no RLS write needed).
- Demo client auth account is a `@greatstone.dev` / `stone` demo (same convention as `seed-demo-staff.mjs`) — **not John's account**, within the standing boundary. No secrets committed; TEST Stripe only; no push to remote; no touch of the live greatstonesoftware.co.uk.

## Plan / cycles
- **Cycle 1 (foundation + customer experience):** migration `0013` (engagements + role); `OrgDashboard.jsx` (#org) with the DX timeline, members directory, company-admin banner, overview stats, company profile + commerce rollup; upgrade `AccountDashboard.jsx` (org link, a11y fix, overview, real last-sign-in); CSS; seed a login-able demo client "Ethical Quest" with a full journey; build + tests + browser-verify; commit.
- **Cycle 2:** staff authoring UI in the admin console (create/edit/share engagements per customer; paste a Netlify recap URL or inline HTML). Members invite affordance honesty.
- **Cycle 3+:** adversarial review (RLS/security, a11y, correctness, UX) via a Workflow → fix; polish; more best-practice features (security trust panel, what's-next, pinned highlights, filters/search, spend analytics).

## Status
- [ ] Cycle 1 in progress.

## Demo creds (to hand John in the morning)
- Demo CLIENT (buyer): `demo-client@greatstone.dev` / `stone` → company **Ethical Quest**, primary contact (company admin). A second member `demo-member@greatstone.dev` / `stone`.
- Sign in at `#account`, then open **Your organization** (`#org`) to see the DX timeline.

## Key references
- Routing recipe + design tokens + audit: see the three research reports captured in the session.
- Token defs `src/site.css` :root; class families `ca-*`/`acct-*`/`pr-*`/`st-*`/`gs-btn` in `src/store/admin.css` + `store.css`.
- Patterns to mirror: `src/store/AccountDashboard.jsx` (gate idiom), `0004_admin_writes.sql` (staff_all), `0008_customer_accounts.sql` (customer_self), `0009_account_guards.sql` (buyer guard).
