# Website build backlog — 1 Jul Ben meeting

Working list from the 1 Jul 2026 sessions with Ben: the **Website Build Technical Review** and the
**Marketing Strategy & Deep Dive** session (Notion Meeting Notes, 2026-07-01). Autonomous build loop works
the highest-value unbuilt item each iteration; verify (npm test + build + live preview), commit scoped, do
not deploy without asking. Live at greatstoneint.com / greatstone-home.netlify.app.

## Build now (frontend/CMS, no external dependency)

- [ ] **1. Purchase-order checkout** — make "Pay by purchase order" a first-class checkout payment method
  alongside Stripe: a business buyer can either UPLOAD a PO document or fill/create one online (with a PO
  number), submitting to sales@ for manual review + fulfilment. StoreCart already has a quote-with-PO-reference
  flow; add the document upload + the payment-method framing (most B2B buyers pay by PO, not card). **[Ben's #1]**
- [x] **2. Services page — categories at the top** — surface the high-level categories (Websites & Web Apps,
  Commerce & Storefronts, AI Agents & Assistants, Automation & Integration, Comms, …) as prominent, clickable
  navigation at the TOP of the Services page. Ben expected them there and did not see them (they were small
  filter chips below the Featured strip). **DONE — iteration 1.**
- [ ] **3. Post-order + welcome emails** — rework the order-confirmation email (what was ordered, next steps,
  timeframe) and add a branded welcome/onboarding email on registration. Builds on the order-confirmation +
  licence-delivery (notify-licence-issued) emails already in place.
- [ ] **4. Per-product-range activation instructions** — an admin place to author activation steps per product
  range (Aspose, GroupDocs, …), included automatically in the fulfilment email + the customer account; add
  .lic licence-FILE support alongside key strings.
- [ ] **5. AI Baseline Survey + Cost Calculator lead magnet** — a free, gated tool (name/company/email) that
  returns a quick AI-readiness benchmark (laggard → pioneer) with simple charts. Dovetails with the parked AI
  Intelligence Hub.

## Gated on Ben / credentials (flag + track, do not build)

- Email deliverability: SPF/DKIM/DMARC + a dedicated sender (sales@…) via Cloudflare (emails landing in spam).
- Domain/DNS cutover: Cloudflare → Netlify, both domains in parallel. Partly done (live on greatstoneint.com).
- Auth: 2FA (pending provider choice) + rebrand the "Powered by Klondare" login screen to Greatstone (needs the
  Klondare contract).
- Hosting/DB decisions: Netlify Pro ($19, can downgrade post-launch); Supabase free to ~1–2k users, Pro ~$25.

## Bigger bets / phase 2

- PO-email → AI agent: an agent on the sales inbox that reads incoming POs, auto-creates the customer account,
  logs the order, and feeds Stripe/product-sales dashboards.
- MCP interview agent (Everest): install a Greatstone MCP into the client's own AI to run the baseline interview.

## Log

### Iteration 1 — item #2, Services page categories at the top

Ben expected the high-level service categories to greet him at the top of the Services page and
instead found small filter chips below the Featured strip. Fixed by adding a prominent
category-tile grid (`.b-cat-nav`) at the top of `ServiceCatalog`, shown only in the default
state (`active === 'All'`, no search query, more than one category). Each tile shows the
category name, its blurb, and a live service count, and clicking it sets that category active,
smooth-scrolls to the controls, and reveals the filtered grid (the nav hides itself once a
category is active, so it reads as navigation rather than a permanent header).

- File: `src/blocks/ServiceCatalog.jsx` (tile nav JSX + `.b-cat-nav*` CSS, single-column under 520px).
- Verify: `npm test` 561 green, `npm run build` clean (secret scan passed). Live preview on the
  Services page: 9 tiles render in order; clicking "Commerce & Storefronts" set active, hid the
  nav, showed the category blurb, filtered to 6 cards; zero console errors.
- Not deployed (awaiting John's OK).

_(next iterations appended below)_
