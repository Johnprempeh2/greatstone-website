# Launch requirements and go-live roadmap

What it takes to move the new Greatstone website from where it is today (a complete build running on
test and sandbox services) to fully live on the real domain, taking real payments and storing real
customer data. This is written so the "what we need from Ben" section can be lifted out and sent to him
as-is.

## Where we are

The site is built and works end to end: the marketing pages, the Puck CMS (edit any text on the page),
the software catalogue (159 products, 819 variants), customer accounts, checkout, quotes and invoices.
Everything currently runs on **test keys and sandbox services**: Stripe test mode, a sandbox email sender
that only delivers to us, and an interim database. None of it is on the real domain, and nothing is
indexed by Google yet.

The good news, confirmed against the code: moving to the real domain is a **configuration and DNS change,
not a rebuild**. The app already builds every URL from wherever it is served. So the engineering left is
wiring, not re-architecting. The long poles are the things only Greatstone can own: a live Stripe account,
the domain, and the legal pages.

## Honest timeline

- **A staging site you can review: 3 to 4 working days.** On our own hosting, using the interim/test
  services, so you and Ben can walk the whole flow before anything goes live. No input from Ben needed to
  reach this.
- **Fully live on the real domain: 2 to 4 weeks.** This is paced almost entirely by Ben-supplied items,
  not by us. The long poles are Stripe live-account verification (days to weeks, out of our hands), a legal
  review of the policy pages, verifying the email domain, and getting DNS access to move the domain. Once
  those clear, our production wiring and cutover is roughly 5 to 7 working days.

Headline for Ben: **"Staging to review in 3 to 4 days. Live in 2 to 4 weeks once the Stripe, legal and DNS
items clear."**

---

## Two decisions that shape everything

Everything below changes depending on two answers. Worth settling these first, because they decide which
items are even in scope.

1. **What happens to the existing store?** The old greatstonesoftware.co.uk is a full working reseller
   storefront (built by iCandy Design): real products, basket, checkout, customer accounts and order
   history. Does the new build **replace** it, sit **alongside** it as the brand/marketing site, or **take
   over** its commerce? If it replaces the live store, we must migrate the existing customers and orders,
   or we lock those customers out and lose revenue on day one. This is the single biggest call.

2. **Do we sell live at launch, or launch enquiry-led?** We can go live taking real card payments (Stripe
   live plus licence-key delivery), or launch as browse-and-enquire with payments kept in test and switched
   on shortly after. Selling live pulls in more blockers (live Stripe, legal pages, and a licence-key
   delivery process). Enquiry-led is a faster, lower-risk first launch.

---

## What we need from Ben

Grouped by area. Priority is **[Blocker]** (nothing goes live without it), **[Important]** (needed for a
proper launch, not day-one-of-staging), or **[Later]** (can follow after launch).

### 1. Legal entity, tax and business identity
- **[Blocker] Company details:** registered legal name, company number, registered office address. These
  are legally required on the footer, terms and invoices. Confirm the exact trading entity (is it
  "Greatstone International" or "Greatstone Software Ltd"?), as the codebase currently mixes two names.
- **[Blocker] VAT status and number.** Checkout adds a flat 20% UK VAT line today. If Greatstone is
  VAT-registered, the number must show on invoices; if not, the VAT line must come off. Every invoice is
  legally wrong until this is confirmed.
- **[Important] Tax treatment for any non-UK or EU-business buyers.** Today it charges one flat 20% GBP VAT
  to everyone. If we sell outside the UK, that needs a decision (reverse charge / Stripe Tax) before go-live.
- **[Important] Confirm currency and FX rate.** Prices are held in USD and converted to GBP at checkout
  using a single, manually-set rate (default 1.30). There is no automatic feed, so a stale rate mischarges
  everyone. Confirm GBP and who keeps the rate current.

### 2. Payments (Stripe)
- **[Blocker] Open and fully verify a live Stripe account** for Greatstone (legal name, address, company
  number, director ID for the identity check). Stripe blocks all real charges until this passes, and it can
  take days to weeks. **This is the longest-lead item, so it is worth Ben starting today.**
- **[Blocker] A UK business bank account** for Stripe payouts. Without it, money from sales is held and
  cannot be paid out.
- **[Blocker] The live Stripe keys** (publishable and secret) and authorisation to register the live payment
  webhook. We wire these in; only Ben can generate them from the verified account.
- **[Important] Turn on the Stripe Customer Portal in live mode** (a one-time setting) so customers can
  manage their billing. The test setting does not carry over.
- **[Important] A named owner for the Stripe dashboard** (refunds, disputes, payouts) and an agreed
  refund/cancellation policy.

### 3. Production database (Supabase)
- **[Blocker] A paid production database project** (Supabase Pro, about $25/month) billed to a
  Greatstone-owned account. It stores customer details, orders, invoices and licence keys, so it needs the
  daily backups and point-in-time recovery that the free tier does not provide. The current project is a
  development instance and should not carry the live business.
- **[Blocker] Region choice: we recommend London (UK/EU).** This is fixed at creation and cannot be changed
  later without a full migration. UK/EU customer data should sit in a UK/EU region for GDPR.
- **[Blocker] Sign-off on how we hold the master database keys** (encrypted, server-side only, rotated on a
  schedule), and who holds them long-term. One key here can read every customer's data, so custody matters.
- **[Important] Acceptance of Stripe and Supabase as data processors** (standard GDPR agreements).

### 4. Domain, DNS and hosting ownership
- **[Blocker] Access to the domain registrar** for greatstoneint.com, the permanent domain (decided 2 Jul
  2026, see `docs/DOMAIN-EMAIL-TRANSITION.md`), and confirmation of who owns the registration. Its DNS is
  already hosted in our Netlify account, so site DNS, SSL and email verification records can be added there.
  For the old greatstonesoftware.co.uk we still need whoever holds it (Greatstone directly or the incumbent
  agency, iCandy) to point it at greatstoneint.com with a permanent redirect.
- **[Blocker] Access to the Cloudflare account** in front of the current domain (the live site uses it), as
  it sits in the DNS path.
- **[Blocker] Apex vs subdomain decision.** Is the new site the public site on greatstoneint.com, or
  on app.greatstoneint.com with a separate marketing site on the apex? We recommend the subdomain
  split if a distinct marketing site is planned, for cleaner SEO.
- **[Blocker] Ownership of the hosting account** the site sits on, and agreement to move it under a
  Greatstone-owned account so control does not sit with an individual or an agency at handover.
- **[Blocker] Admin access to the existing live store** (the iCandy build) and confirmation of who runs its
  server, so we can plan any takeover, data export or redirect.

### 5. Email sending
- **[Blocker] Confirm the from-address** for sending. The domain is decided: greatstoneint.com (2 Jul
  2026); the recommended sender is `orders@greatstoneint.com`. Some public contact strings still use
  greatstonesoftware.co.uk; they move to greatstoneint.com once its mailboxes receive mail (that change
  waits on John and Ben).
- **[Blocker] A production email account (Resend)** and verification of the sending domain by adding the DNS
  records it generates (SPF and DKIM). Until the domain shows "verified", order and account emails from a
  @greatstone address are rejected or land in spam. Today it uses a sandbox sender that only reaches us.
- **[Important] A DMARC record** on the sending domain (Gmail and Yahoo now require it for reliable
  delivery), and **a real, monitored support inbox** on the canonical domain.

### 6. Legal and compliance pages
- **[Blocker] Terms of sale**, reviewed by a lawyer, covering software-licence sale, cancellation rights and
  liability. We can build the editable pages; we cannot own the legal wording.
- **[Blocker] Privacy policy** (UK GDPR): what data is collected, why, how long it is kept, who it is shared
  with. Storing real customer data without this published is a breach from the first sign-up.
- **[Blocker] Cookie policy and a consent decision.** Required by law, and mandatory before any analytics
  can run.
- **[Blocker] Data retention and deletion decision:** how long we keep customer data, and who owns "delete
  my data" requests. Confirm Greatstone is the data controller.
- **[Important] Refund and cancellation policy** (for example, no refund once a licence key is issued).
- **[Important] A list of the old site's important URLs to redirect** (the current site has roughly 400
  indexed pages, including about 50 blog posts). Without a redirect map, the old Google rankings and
  inbound links break at cutover. We can draft this from a crawl; Ben confirms priorities.
- **[Important] Content sign-off** on the catalogue prices and licence terms, and the migrated blog posts,
  before we charge real money against them.

### 7. Product fulfilment (the actual software)
- **[Blocker] How licence keys are delivered after payment**, per vendor (Aspose, Apryse, Iron, etc.):
  where the keys come from (manual, vendor API, reseller portal) and how the customer receives them.
  **Right now, a paid order delivers nothing.** The account area has a licence-keys tab, but no issuing
  process is wired. Taking money and delivering nothing is a legal and reputational exposure, so this
  blocks any paid launch. (Not needed if we launch enquiry-led.)

### 8. Existing site and customer data
- **[Blocker] The replace/coexist/rebuild decision** (see the top). This drives everything below it.
- **[Blocker] If we replace the store: export of the existing customers and orders**, plus the current
  payment gateway details. Cutting over without this locks existing customers out and loses their history.
- **[Important] The underlying product and blog content as data** (not scraped HTML), and where the current
  site's enquiry/lead forms deliver to, so we do not silently drop the existing lead pipeline.
- **[Later] Analytics access to the current live site**, so we redirect the pages that actually get traffic
  rather than guessing.

### 9. Analytics, CRM and booking
- **[Important] A GA4 and Google Tag Manager account** (the container and measurement IDs). The analytics
  are built and dormant; one setting turns them on. Note: this cannot go live without the published
  privacy and cookie policies, so they are paired.
- **[Later] Confirm the Calendly booking link and plan.** Booking is already live and wired; just confirm
  the right event.
- **[Later] A Pipedrive (CRM) account and token**, if we want leads flowing into a CRM. Not built yet; leads
  are safely captured in the database meanwhile.

### 10. Staff and admin accounts
- **[Blocker] The first admin people** (email addresses and roles) to seed, so someone can actually
  administer the catalogue and content. There is no self-serve staff sign-up by design.
- **[Important] Decide whether customer email confirmation is on at launch**, and whether team invites send
  real emails (currently they do not).

---

## The critical path

Out of everything above, these are the few Ben-owned items that gate the rest. If Ben starts these first,
nothing else waits on him:

1. The two scope decisions (replace-vs-coexist, sell-live-vs-enquiry-led).
2. Stripe live-account verification and the business bank account (longest lead, out of our control).
3. Production database project, billed and in a UK/EU region.
4. Domain registrar and Cloudflare access, plus the apex-vs-subdomain call.
5. The legal pages and the data-retention decision.
6. The licence-key delivery process (if selling live).
7. Existing customer and order data export (if replacing the old store).

---

## The roadmap

Phases 0 and 1 need nothing from Ben, so we start them today. Phase 2 (Ben's items) runs in parallel.

- **Phase 0 — Secret hygiene and scope lock (us, 2 to 3 days).** Rotate the development secrets that have
  sat in a local config file, lock the client-safe vs server-only secret split, write the
  existing-site-vs-new-build analysis for Ben's two decisions, and draft the old-to-new redirect map from a
  crawl of the current site.
- **Phase 1 — Staging on our hosting (us, 3 to 4 days).** Deploy the current build to our own Netlify
  staging site on the interim/test services, seed the catalogue and the first admin user, wire the test
  payment flow, scaffold the legal pages for the lawyer to fill, and run a full end-to-end test. Then hand
  you and Ben a staging URL to review. **This is the "get it staged so we're ready" step you asked for.**
- **Phase 2 — Ben supplies the live-service items (Ben, 1 to 3 weeks).** The checklist above. Runs
  alongside Phase 1.
- **Phase 3 — Production wiring, still on the temporary URL (shared, 3 to 4 days).** Stand up the real
  database, live Stripe and verified email against a production build, still on the netlify.app address so
  we can validate it before touching the real domain. Includes a real £1 test purchase and a refund test.
- **Phase 4 — Domain cutover and go-live (shared, 1 to 2 days plus DNS time).** Point the real domain at the
  validated build, provision SSL, publish the redirect map, migrate existing customer data if we are
  replacing the old store, and remove the "do not index" flag so Google can find it.
- **Phase 5 — Post-launch hardening (shared, rolling).** Monitoring and alerts, the refund workflow, the CRM
  sync, and confirming every account (hosting, database, Stripe, email, domain) sits under Greatstone's own
  billing for a clean handover.

---

## What we are handling (so the split is clear)

All the engineering: the production wiring, the database migration and seeding, the Stripe live switch and
webhook, the email templates, the redirect map, the domain cutover, the staging site, and the smoke tests.
We also scaffold the legal pages as editable CMS pages for the lawyer to fill. We do not own the legal
wording, the Stripe verification, the bank account, the tax registration, or the domain.

## One thing we are doing on our side first

During the build, real development secrets (database and Stripe test keys, the email key) have lived in a
local config file on the machine. They are development values, not the live ones, but as a matter of
hygiene we are rotating all of them and confirming that file was never committed anywhere. It is Phase 0,
before any production provisioning. Flagging it so there are no surprises.

## Assumptions worth confirming

- The site is genuinely domain-portable, so the real-domain move is config and DNS, not a rewrite.
  (Verified against the code.)
- Products and prices live in our database, not in Stripe, so going live is a keys-and-webhook switch with
  no Stripe catalogue to migrate.
- The current running costs at launch are small and known: hosting on a free/starter tier, the database at
  about $25/month, plus Stripe's per-transaction fees.
