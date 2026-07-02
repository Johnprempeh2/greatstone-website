# greatstoneint.com transition: everything we need

Prepared 2 July 2026. The decision is locked: **greatstoneint.com is the permanent domain**, for the website
and for email. The site is already live on it and every transactional email (order confirmation, licence
ready, welcome) is built and deployed, sitting dormant until email is configured. This document is the single
list of what remains: the decisions, the access, and the setup steps, grouped by who owns each. Fill in the
blanks you can and send the rest to Ben.

## What we found (so the requests below are precise)

- **DNS for greatstoneint.com is hosted in our own Netlify account** (NS1 nameservers). Records can be added
  at app.netlify.com under Domains, no third party needed.
- **A Microsoft 365 verification record already exists on the domain** (`MS=ms64828655`). Someone has begun
  attaching greatstoneint.com to a Microsoft 365 tenant. We need to know which tenant and who administers it.
- **No mail records exist yet** (no MX, no SPF, no DMARC): receiving mailboxes do not exist, and nothing can
  send authenticated email from the domain yet. Clean slate.
- www.greatstoneint.com and SSL already work. The sitemap and every email template already point at
  greatstoneint.com.
- Stripe is still in **test mode**: the store cannot take real money until we flip to live keys.

## A. Decisions and details from John

| # | Item | Recommendation | Your answer |
|---|------|----------------|-------------|
| A1 | Mailbox provider for @greatstoneint.com | Microsoft 365 (you already use Outlook, and the domain verification is started) | |
| A2 | Mailboxes to create | dx@ (contact + replies), orders@ (transactional sender), john@, ben@ | |
| A3 | Transactional "from" address | `Greatstone <orders@greatstoneint.com>`, with replies going to dx@ | |
| A4 | VAT registration number | Required before a real VAT invoice goes out; the invoice currently shows a placeholder. If not VAT registered, say so and we remove the VAT claim instead | |
| A5 | Company registration number + registered office address | For the invoice footer and legal pages | |
| A6 | Stripe live date | When you want the store taking real payments (needs live keys, live webhook secret, business verification and a payout bank account in Stripe) | |
| A7 | Analytics | Optional: a GA4 / GTM container ID switches the already-built analytics on | |

## B. Requests for Ben

| # | Request | Why |
|---|---------|-----|
| B1 | Which Microsoft 365 tenant holds the `MS=ms64828655` verification for greatstoneint.com, and who administers it | The new mailboxes should be created there (or the record removed if it is stale) |
| B2 | Where greatstoneint.com is registered (registrar, renewal date, account owner) | For the record; DNS itself is already in our Netlify account |
| B3 | Point greatstonesoftware.co.uk at greatstoneint.com with a permanent redirect once we say go | Preserves old links and search standing; the new site already maps the old shop's paths |
| B4 | Keep the old mailboxes (dx@ / sales@ on greatstonesoftware.co.uk) receiving, forwarded to the new addresses, for 6 to 12 months | Nothing sent to an old address is lost during the change |
| B5 | Anything else still running on the old infrastructure we should know about | Mailing lists, invoices or documents carrying the old address, third parties who need notifying |

## C. Setup, in order

Each step is short. DNS changes can take up to a day to propagate; everything else is minutes.

1. **Mailboxes (John + Ben).** Create the A2 mailboxes in the Microsoft 365 tenant (B1). M365 admin gives the
   exact DNS values (MX, SPF, autodiscover); add them in Netlify: Domains, greatstoneint.com, DNS records.
2. **Resend (John).** Create an account at resend.com, add the domain greatstoneint.com, and it lists the
   authentication records (DKIM, a return-path record, DMARC). Add those in Netlify DNS the same way, then
   press verify in Resend. Create an API key. The free tier (3,000 emails a month) is fine to start.
3. **Supabase secrets (John, 5 minutes).** Dashboard, project GS Website, Edge Functions, Secrets. Add:
   `RESEND_API_KEY` (from step 2), `RESEND_FROM` (the A3 address), `APP_SITE_ORIGIN` = `https://greatstoneint.com`.
   The moment these exist, order, licence and welcome emails start sending.
4. **Supabase auth (John, with exact payloads from Claude).** Authentication, URL configuration: Site URL
   `https://greatstoneint.com`, redirect URLs include `https://greatstoneint.com/**`. Apply the branded auth
   email templates (already written). Optional but recommended: point auth email at Resend's SMTP so
   confirmations and resets also come from the new domain.
5. **Contact-address sweep (Claude).** Once dx@greatstoneint.com receives mail, every contact link on the
   site moves from the old address to the new one, templates regenerate, and the site redeploys.
6. **Company details (Claude).** The VAT number and company details (A4, A5) go into the invoice and legal
   pages as settings, and the placeholder disappears.
7. **End-to-end test (Claude + John).** A real order, licence issue and sign-up against John's inbox: all
   four emails land, links point at greatstoneint.com, and a mail-tester score confirms deliverability.
8. **Search (John + Claude).** Verify greatstoneint.com in Google Search Console (one TXT record) and submit
   the sitemap. Switch analytics on if A7 says yes.
9. **Stripe live (John + Ben, on the A6 date).** Live secret key and live webhook secret into Supabase,
   business verification and bank account in Stripe. Until then the store runs safely in test mode.

## D. Already done (context for Ben)

The site is live at greatstoneint.com with the full commerce platform: catalogue, card checkout (test mode),
purchase orders with document upload, licence fulfilment including licence files and per-range activation
instructions, customer and company accounts. The order confirmation, licence-ready and welcome emails are
deployed and tested; they activate the moment step 3 happens. The old shop's product catalogue and customer
records are already migrated, and per-path redirects from the old site's URLs are already live on the new one.
