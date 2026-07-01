# Website build backlog — 1 Jul Ben meetings (corrected against full transcripts)

Two 1 Jul 2026 sessions with Ben: the **Website Build Technical Review** and the **Marketing Strategy &
Deep Dive**. This version was re-checked against both full transcripts and a codebase audit (workflow
`ben-1jul-rescope`, 30 Jun/1 Jul) after the first distillation under-scoped the licence-file and
activation-instruction requirements. The loop builds the highest-value genuinely frontend-only item each
iteration; verify (npm test + build + live preview), commit scoped, do not deploy without asking. Live at
greatstoneint.com / greatstone-home.netlify.app.

Status tags: **[BUILT]** shipped this session or already live · **[PARTIAL]** part shipped, a named piece
missing · **[MISSING]** not started · **(gated)** cannot finish frontend-only, blocker named.

## Build now (frontend-only, no external dependency)

- **AI Baseline Survey lead magnet** — [BUILT] (iteration 3). A free, gated survey (`AiBaselineSurvey` block):
  8 questions, one per Greatstone pillar, graded 1..4; email-gated results with a **Laggard → Pioneer**
  benchmark, a per-pillar bar chart against an illustrative industry average, and two downloads (your scored
  result + the blank survey as a CSV to adapt into Google Forms / Typeform / Formstack). All frontend,
  `track('generate_lead', { form: 'ai_baseline_survey' })`. Content authored in Greatstone voice, kept in
  `src/data/ai-baseline-survey.mjs`. Placeable via Puck (Proof category). Not deployed.

- **AI Cost Calculator lead magnet — rename + email-gate wrapper** — [PARTIAL]. `TimeSavingsCalculator.jsx`
  is already built and production-ready; Ben's framing is "how much money am I leaving on the table with AI."
  Rename/relabel to "AI Cost Calculator", wrap it in an `EmailGate` (name/company/email before reveal, reusing
  the `BookDeepDive` form pattern), emit `track('generate_lead', { form: 'ai_cost_calc' })`, expose as a Puck
  block / tool page. Pure frontend.

- **Per-product-range activation-instructions authoring UI** — [MISSING] (authoring + account display are
  frontend-only; email injection is gated). Ben: activation instructions are authored **per product RANGE, not
  per product** ("each product range... it will be only six or seven"; the 9 ranges are Aspose, GroupDocs,
  IronSoftware, Apryse, DevExpress, Conholdate, ActivePDF, I.R.I.S., PDFlib), in "a word editor window." Build
  the admin authoring surface in `CatalogueAdmin` (one card per vendor range, textarea), persist to localStorage
  for the frontend-only phase, and render read-only under each key in `LicenceKeys.jsx` ("How to activate").

- **User-portal engagement polish** — [PARTIAL]. Ben wants the user area "a lot more engaging." It already has
  individual + company registration, team access, company purchases, a QBR-capable engagement timeline, and an
  onboarding checklist (book kickoff / place first order). Frontend-only wins remain: empty-state heroes (no
  orders / no team / no engagements), a first-visit welcome banner, surfacing the latest `review` engagement as
  a "Next QBR" callout, an onboarding-complete moment.

- **Post-order confirmation + welcome/onboarding email templates (authoring only)** — [PARTIAL]. Confirmation
  HTML lives in `stripe-webhook`; a licence-issued builder is `src/lib/licence-email.mjs`. Ben's gaps: (a)
  confirmation copy improved to state **what was ordered, next steps, timeframe**, and (b) a **branded
  welcome/onboarding email** on registration, which does not exist. Author both as pure `.mjs` builders with
  tests now (zero-deploy repo change). Dispatch is gated (below).

- **Purchase-order checkout as a first-class payment method (online path)** — [BUILT] this session (iteration
  2). Card-vs-PO framing + online PO submission via `request-quote`. Native document upload is gated (below).

- **Services page — high-level categories at the top** — [BUILT] this session (iteration 1). Category-tile nav
  at the top of `ServiceCatalog`.

## Gated on Ben / credentials / deploy (flag + track, do not build to completion)

- **Admin `.lic` licence-FILE upload on fulfilment** — [BUILT deploy-ready] **(gated on deploy)**. Iteration 4:
  code committed, awaiting the migration + deploy John runs (Supabase Storage can't be created/tested from the
  loop). Handoff: `docs/LICENCE-FILE-FULFILMENT.md`. *The nuance the first backlog
  under-scoped.* Ben: most products ship as a licence **key string**, but some ship as a `.lic` licence **FILE**
  ("a text file, .lic extension... you'll have to upload physical [file]"). Admin flow he described: order
  management → open order → it follows the product-range format → **upload the licence file** or paste the key →
  add a download link if present → **mark as fulfilled → automated email triggers**. Today `KeyEditor` accepts
  only a key string + optional `download_url`; there is no file input, no Storage bucket, no file column, and
  `markFulfilled()` does not trigger the email. Real build needs a Supabase **Storage bucket** (`licence-files`)
  + a `licence_keys.file_storage_path` column + `markFulfilled → notify-licence-issued` wiring + a `.lic`
  download button on the account. A frontend-only localStorage/JSONB proof-of-concept is possible but does not
  match the "physical file, delivered as an artifact" model. **Blocker: Storage bucket + edge-function deploy +
  DB migration.**

- **Activation instructions in the fulfilment email + DB persistence** — [MISSING] **(gated)**. The authoring
  UI + account display ship frontend-only (above); injecting per-range instructions into the licence email and
  persisting them needs a `vendors.activation_instructions` column + a `notify-licence-issued` change.
  **Blocker: DB migration + edge-function deploy.**

- **Native in-app PO-document upload at checkout** — [MISSING] **(gated)**. Ben: "there should be an option to
  upload the purchase order." Online path is live; attaching the PDF in-drawer needs a `po-documents` Storage
  bucket + anon-insert RLS + a `request-quote` change to record the file URL. Interim live fallback: the
  confirmation screen tells the buyer to email the PO to dx@ quoting the reference. Also ties to a
  "company registration must be complete before ordering" gate Ben mentioned. **Blocker: Storage bucket +
  edge-function deploy.**

- **Order / licence / welcome email DISPATCH** — [PARTIAL] **(gated)**. Templates author frontend-only; sending
  needs the edge functions deployed to live Supabase with `RESEND_API_KEY` + `RESEND_FROM`. **Blocker:
  edge-function deploy + secrets.**

- **Email deliverability / spam prevention** — [MISSING] **(gated)**. Ben flagged automated emails landing in
  spam (a real sales order hit spam, reported not-spam). Needs SPF/DKIM/DMARC + a dedicated sender (sales@ /
  dx@) via Cloudflare, plus resolving the SSL-on-sending-server concern. **Blocker: Cloudflare DNS + Resend
  domain verification (Ben to share Cloudflare details).**

- **Domain / DNS cutover** — [PARTIAL] **(gated)**. Live on greatstoneint.com; both domains run in parallel, no
  SEO conflict (content differs); Cloudflare records shared via WhatsApp. **Blocker: registrar/Cloudflare record
  entry + propagation.**

- **2FA** — [MISSING] **(gated)**. Not set up, pending auth-provider decision.

- **Rebrand "Powered by Klondare" login → Greatstone** — [MISSING] **(gated)**. Blocker: Klondare contract.

- **Hosting/DB plan** — [tracking only]. Netlify Pro ($19/mo, can downgrade post-launch); Supabase free to
  ~1–2k MAU (500MB), Pro ~$25/mo. Ben to provide traffic projections for a tailored Netlify estimate.

## Bigger bets / phase 2

- **PO-email → AI agent** — an agent on the sales inbox that reads emailed POs, auto-creates the customer
  account (admin issues credentials), logs the order, and feeds Stripe/product-sales dashboards. Ben confirmed
  the emailed-PO path is currently manual and unlinked to the site.

- **MCP interview-agent lead magnet (Everest-style)** — a Greatstone MCP installed into the client's own AI
  (Claude/Copilot) that interviews them in their own environment, gathering the same baseline-survey data at
  near-zero run cost, optionally summarising how they already use AI. Ben's caution: how much trust is
  pre-established to warrant that access? A next-level enhancement to the survey, not the MVP.

- **Customer-perspective marketing/journey map** — Charlie's flow is internal/marketing-ops; Ben wants it
  re-mapped from the customer's perspective, background processes (content/production calendars) separated,
  per-segment paths. Owned by Charlie/John; shapes where the lead magnets sit in the funnel.

- **Deep-dive pricing estimator** — pricing a deep dive should lead with an overview then a figure linked to a
  variable the client applies themselves (company size / complexity). A small interactive estimator could
  productise this later.

## Log

### Iteration 1 — item, Services page categories at the top

Ben expected the high-level service categories at the top of the Services page; they were only small filter
chips below the Featured strip. Added a prominent category-tile grid (name, blurb, live service count) that
filters the grid on click and hides itself once a category is active.

- File: `src/blocks/ServiceCatalog.jsx` (tile nav JSX + `.b-cat-nav*` CSS, single-column under 520px).
- Verify: `npm test` 561 green, `npm run build` clean. Live preview: 9 tiles render; clicking a tile filters
  the grid; zero console errors. Commit `e42d960`. Not deployed.

### Iteration 2 — item, Purchase-order checkout (first-class payment method, online path)

Reframed the basket footer into an explicit two-method choice, Pay by card (Stripe) and Pay by purchase order
(invoice on your terms), each a prominent card. The PO path leads with a prominent PO-number field and submits
via the existing `request-quote` flow (staff see `po_reference` in QuotesManager). The confirmation screen tells
the buyer how to send a signed PO document.

- Files: `src/store/StoreCart.jsx`, `src/store/store.css`. No change to price maths, Stripe, or edge functions.
- Verify: `npm test` 561 green, `npm run build` clean. Live preview verified both methods + the PO view; zero
  console errors. Commit `b7fba9f`. Not deployed.

### Re-scope — 1 Jul, corrected against full transcripts

Re-read both full transcripts and ran a 6-agent codebase audit. Corrections captured above: the `.lic`
licence-FILE upload is a core (gated) admin fulfilment feature, not a footnote; activation instructions are
per product RANGE (~9 vendors) authored in a plain editor; the AI Cost Calculator already exists
(`TimeSavingsCalculator.jsx`) and needs only a rename + email-gate; the AI Baseline Survey needs a
Google Forms/Typeform export, not just an on-page quiz; welcome/onboarding email is a distinct, non-existent
artefact; `markFulfilled()` does not currently trigger the licence email.

### Iteration 3 — AI Baseline Survey lead magnet

Built the `AiBaselineSurvey` Puck block (Proof category): an intro card, an 8-question quiz (one per
Greatstone pillar, four graded answers auto-advancing with a progress bar), a name/company/email gate, and a
results screen with a Laggard→Pioneer verdict, an 8-pillar bar chart against an illustrative industry
benchmark, strongest/weakest reads, and two CSV downloads (the scored result + the blank survey to adapt into
Google Forms / Typeform / Formstack). Survey content authored in Greatstone voice via a design workflow (two
drafts + synthesis), kept in `src/data/ai-baseline-survey.mjs`; pillars/phases reuse `maturity-seed.mjs`.

- Files: `src/blocks/AiBaselineSurvey.jsx`, `src/data/ai-baseline-survey.mjs`, `src/puck.config.jsx` (register
  + Proof category). Emits `track('generate_lead', { form: 'ai_baseline_survey' })`. Pure frontend.
- Verify: `npm test` 561 green, `npm run build` clean (secret scan passed). Live preview (block injected into a
  page): intro → 8 questions → gate (empty submit blocked) → results rendered Leader 2.8 with 8 bars + 8
  benchmark markers; both downloads produced Blobs; zero console errors. Test block removed after.
- Not deployed (awaiting John's OK).

### Iteration 4 — Admin `.lic` licence-file fulfilment (DEPLOY-READY)

John chose "build it deploy-ready". Built the full real feature (can't be live-tested until deployed, since it
introduces the first Supabase Storage bucket):

- **Migration** `supabase/migrations/0024_licence_files.sql`: private `licence-files` bucket (5 MB cap),
  `licence_keys.file_path` / `file_name` columns, relaxed `licence_key` NOT NULL with a `chk_licence_has_delivery`
  check (key OR file OR link), a `chk_licence_file_path_scope` check pinning the path to the row's own customer,
  and Storage RLS (staff manage; a buyer reads only their own `customer_id/` folder).
- **KeyEditor** (`src/store/ClientsManager.jsx`): licence-file upload alongside key/link; uploads to the
  customer-scoped path; rolls back the object on DB failure and deletes the superseded file on replace.
- **Account** (`src/store/LicenceKeys.jsx`): a `.lic` download via a short-lived signed URL; file-only licences
  render cleanly (no empty key/Copy).
- **Fulfilment email** (`src/store/OrdersManager.jsx`): marking an order fulfilled sends the single "licences
  ready" email (the key-issue auto-email was removed to avoid a double-send). Email copy neutralised for files
  (`src/lib/licence-email.mjs` + edge-fn mirror + test).
- **Handoff:** `docs/LICENCE-FILE-FULFILMENT.md` (deploy order + security model + decisions).
- **Assurance:** a 4-agent adversarial security review (RLS / client / integrity) ran; all 7 findings fixed
  (query-omission data-loss, orphaned-file cleanup, double-email, path-scope CHECK, filename sanitise, TTL,
  email wording). `npm test` 561 green, `npm run build` clean, secret scan clean. NOT deployed.

_(next iterations appended below)_
