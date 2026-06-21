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
- [x] **Cycle 1 SHIPPED + browser-verified (21 Jun 2026).** Migration `0013` applied to Supabase (engagements + `customer_users.role`, RLS verified: buyer reads scoped to own company's shared items, buyer writes BLOCKED, no self-promotion). New `#org` route + `OrgDashboard.jsx`: identity, company-admin banner, at-a-glance stats, the **DX engagement timeline** (period-grouped vertical `<ol>`, what's-next, highlights, type filters, search, inline sanitized recap expand + safe external links with host label), members directory (admin chip + "You"), admin-gated company profile, company orders rollup. `AccountDashboard.jsx` upgraded: H1 = the person (not the company), company→`#org` link, "Company admin" chip, fixed the dead-`aria-expanded`-on-`<tr>` a11y bug. Demo client "Ethical Quest" seeded (10 engagements, 2 members, 2 orders, 1 quote). 51 tests green, build clean (OrgDashboard = 19 KB lazy chunk, eager bundle unchanged), 0 console errors, mobile no-overflow.
  - NOTE: a parallel session's `git add -A` swept the foundation files (0013/seed/customerAuth/this doc) into commit `84c6cf3`; the rest committed separately. Functionally intact.
- [x] **Cycle 2 SHIPPED + browser-verified (21 Jun).** Staff authoring UI: new `src/store/ClientsManager.jsx` surfaced as a **"Clients & DX" tab** in CatalogueAdmin (#catalogue/clients). Staff pick a client company → see its members (admin identified) → full engagement CRUD via a `ca-drawer` editor (kind/title/date/phase/owner/summary/external-link/inline-HTML/attendees/tags/pinned/visibility) + per-row Share/Unshare + Delete. Writes go through the staff JWT → staff_all RLS; insert stamps org_id + created_by. Verified end-to-end: staff sign-in gated (customer → "not authorised"), created a recap (persisted with correct org_id/created_by), Share/Unshare toggles, deleted + restored demo to pristine 10/shared. 51 tests green, build clean, 0 console errors.
- [x] **Cycle 3 SHIPPED + verified (21 Jun).** Ran a 4-dimension adversarial review workflow (38 agents, every finding verified): 34 raised, 26 confirmed (8 correctly refuted, incl. a bogus `javascript:` bypass). Fixed ALL confirmed security/correctness/a11y defects:
  - **SEC (high):** hardened `sanitizeHtml` against mutation-XSS — foreign-content/rawtext containers (svg/math/style/noscript/template/…) now DROPPED ENTIRELY (not unwrapped), headings demoted to h5, fixpoint loop; browser-verified all proven mXSS payloads → empty/safe. **Migration 0014:** company profile is now admin-only at the DB (`app_customer_is_admin()` + extended `guard_customer_update`); verified admin edits / member BLOCKED. Personal ProfileCard no longer writes `customers` (company editing is #org, admin-gated). Dropped unused `phone` from the members query; added belt-and-braces `customer_id`+`status` filters to the engagements read.
  - **CORRECTNESS:** `todayISO` now local (was UTC → past/upcoming flipped at day boundary); all-upcoming timeline shows a real message not a bogus "clear filters"; staff toggleShare/delete detect 0-row no-ops; Archived status rendered distinctly.
  - **A11Y:** Clients search labelled; inline recap links announce "opens in a new tab"; recap headings demoted (h2→h3→h4→h5 order preserved); `scroll-margin-top` so focus clears the sticky header; "N new" moved out of the h2 into a labelled jump-to-newest button; pinned ★ given an sr-only label; "seen" write deferred to unmount so "new" survives the visit.
  - 51 tests green, build clean, 0 console errors, browser-verified as customer + staff.
- [x] **Cycle 4 SHIPPED + verified (21 Jun).** Personal #account upgraded to state-of-the-art: (1) an at-a-glance **overview band** (Invested / Orders / Open quotes) under the header, from data already fetched; (2) the Security tab is now a real **Security & sessions trust panel** — shows real last-sign-in (`session.user.last_sign_in_at`), a 2FA row (honest "Ask us to enable"), and **"Sign out everywhere"** (`signOutAll` → `signOut({scope:'global'})`). Build clean, browser-verified, 0 console errors.
- [ ] **Cycle 5 (next):** #org onboarding checklist for a brand-new company (data-derived, dismissible) + in-product member-invite request (admin → small form → request-quote-style edge fn / requests table). Then spend/cadence analytics, per-item permalink + "preview as client" for staff, #org from the header account menu.
- Known follow-ups: company-profile RLS currently lets ANY member UPDATE name/domain/notes (UI gates to admin only) — harden RLS to admin-only in a later migration. "New since last visit" is per-browser localStorage. NOT deployed to Netlify (awaiting John).

## ⚠️ Parallel-session git hygiene (learned cycle 4)
The repo's git index is SHARED with the parallel Intel Hub session. `git add <files> && git commit`
captures whatever ELSE that session has staged. Commit 4378d3d accidentally swept their staged
App.jsx/blocks/intel changes under a DX message (harmless — builds + 51 tests green, nothing lost — but
mixed). **Going forward, commit with the pathspec form `git commit -- <file1> <file2>` (= `--only`),
which commits ONLY the named paths regardless of the shared index.** Never `git add -A`. Never `git reset`
while the other session is live.

## Demo creds (to hand John in the morning)
- Demo CLIENT (buyer): `demo-client@greatstone.dev` / `stone` → company **Ethical Quest**, primary contact (company admin). A second member `demo-member@greatstone.dev` / `stone`.
- Sign in at `#account`, then open **Your organization** (`#org`) to see the DX timeline.

## Key references
- Routing recipe + design tokens + audit: see the three research reports captured in the session.
- Token defs `src/site.css` :root; class families `ca-*`/`acct-*`/`pr-*`/`st-*`/`gs-btn` in `src/store/admin.css` + `store.css`.
- Patterns to mirror: `src/store/AccountDashboard.jsx` (gate idiom), `0004_admin_writes.sql` (staff_all), `0008_customer_accounts.sql` (customer_self), `0009_account_guards.sql` (buyer guard).
