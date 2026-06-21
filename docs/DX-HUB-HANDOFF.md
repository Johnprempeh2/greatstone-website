# DX Engagement Hub — overnight build, for John

Built overnight on 21 Jun 2026 from your `/loop` brief: critically upgrade the customer **user page** to
state-of-the-art, give the **organization its own hub** (separate but linked), make the **company admin
evident**, and add **DX engagement tracking** (a per-company history of meeting recaps — inline or a
Netlify/Notion link — so a client can track their digital-experience journey). 8 cycles, twice
adversarially reviewed, all on the interim Supabase + Stripe-test backend. **Not yet deployed — your call.**

## See it in 60 seconds (3 demo logins, all password `stone`)
Run locally (`npm run dev` in `greatstone-puck-proof`), then sign in at **`#account`**:
- **`demo-client@greatstone.dev`** — Naa Korkoi, **company admin** of **Ethical Quest**. The full picture:
  account overview + security panel; then **"Your organization"** → the DX timeline (10 engagements:
  kickoff → discovery → build → adoption, recaps inline + links, a milestone, what's-next, highlights),
  members, a pending invite, orders, relationship-pulse analytics.
- **`demo-member@greatstone.dev`** — the member's view (no admin powers; can't edit the company).
- **`demo-fresh@greatstone.dev`** — **Northwind**, a brand-new company: the first-run onboarding
  checklist + empty states.

Staff side: sign in at **`#catalogue`** as `admin@greatstone.dev` / `stone` → **"Clients & DX"** tab →
pick a client → upload recaps (inline HTML or a link), share/unshare, and action invite requests.

## What shipped
- **`#account` (personal):** identity (you, not the company), at-a-glance overview band, Profile /
  **Security & sessions** (real last-sign-in, sign-out-everywhere, 2FA "ask us") / Billing, quotes + order history.
- **`#org` (organization, NEW):** company-admin banner, overview stats, first-run onboarding, **DX
  engagement timeline** (typed, period-grouped, what's-next, highlights, filters, search, new-since-last-visit,
  inline-sanitised recaps + safe external links, **per-item shareable permalinks**), **relationship-pulse**
  analytics, member directory with an in-product **invite-request** flow, company profile (admin-only),
  company orders rollup. Bidirectionally linked with `#account`.
- **Staff "Clients & DX":** full engagement authoring per client + invite-request handling.
- **Migrations 0013–0016:** `engagements` + `customer_users.role`; admin-only company writes;
  `member_invite_requests`; insert-forgery guard + dedup. RLS verified end-to-end (a buyer reads only
  their own company's shared items; can't write engagements, escalate role, edit the company unless admin,
  or forge an invite).

## Your action items (none block the demo)
1. **Deploy** — I did NOT deploy (awaiting you). The repo is shared with the live Intel Hub loop; coordinate the build/deploy.
2. **Stripe Customer Portal** (test + live) — the Billing "Manage billing & cards" button needs it configured in the Stripe dashboard.
3. **Invite emails** — the invite flow files a *request* that staff provision; wiring real invitation emails (Supabase invite / an edge fn) is a follow-up.
4. **2FA** — the Security panel offers an honest "ask us to enable"; turning on TOTP needs Supabase Auth config.
5. **Demo data** — the 3 demo accounts + Ethical Quest's journey are seeded by `scripts/seed-demo-client.mjs` (idempotent; delete the `*@greatstone.dev` users + demo customers to remove).

## Quality
Two independent adversarial multi-agent reviews (cycles 1–3 and 4–7): 52 findings raised across both, 39
confirmed-after-verification and all fixed (incl. a real mutation-XSS sanitizer bypass and an invite
insert-forgery hole), 13 correctly refuted as false positives. 51 unit tests green; every cycle
browser-verified; 0 console errors. Per-cycle detail in `docs/DX-HUB-BUILD.md`.
