# Analytics + CRM integration plan

How the Greatstone site connects to Google Analytics and the CRM (Pipedrive) so we can see what
campaigns bring people in, what they do on the site, where they drop off, and who each lead is so
sales know how to engage them, all tied to the account a visitor creates.

Status: PLAN (for review before any build). Stack today: React + Puck CMS on Netlify, Supabase
(auth, accounts, orders, quotes) + Stripe (test), with server-side Supabase edge functions already
in place (`request-quote`, `stripe-checkout`, `stripe-webhook`, `stripe-portal`).

---

## The one idea that ties it together

Capture a stable identity the moment someone lands, and carry it all the way through to sign-up and
purchase. Get that spine right and three layers read from the same thread:

1. **Analytics (GA4)** — behaviour and drop-off: what people do, which step loses them.
2. **Attribution** — which campaign/source brought each person, carried onto their record.
3. **CRM (Pipedrive)** — who's who, with their source and activity, so sales can engage.

The **account** is the join key. Anonymous behaviour (a GA client id + first-touch campaign) gets
bound to the real person the instant they create an account or convert, and from then on the same
identity appears in GA, in the CRM, and in our own database.

```
 Ad / post / email (?utm_campaign=…)
        │
        ▼
 Landing  ──►  first-touch UTM captured + GA client_id  (cookie, first visit only)
        │
        ├──►  GA4 (via GTM): page_view, scroll, view_item, cta_click, begin_checkout …  ──►  funnels / drop-off
        │
        ▼
 Convert (deep-dive form │ quote request │ sign-up │ purchase)
        │   (Supabase edge function, server-side)
        ├──►  Supabase: store attribution on the profile / lead
        ├──►  Pipedrive: upsert Person + Deal, stamped with campaign + landing page + GA client id
        └──►  GA4 Measurement Protocol: server-side conversion event (ad-blocker proof)
```

---

## Layer 1 — Google Analytics 4 (behaviour + drop-off)

**Load GA4 through Google Tag Manager (GTM), not a hard-coded tag.** GTM is the container; GA4 sits
inside it, and so do the ad pixels later (Meta, LinkedIn). The reason is operational: the marketing
hire can add, change, or pause tags from the GTM UI without a code deploy. One small script in the
app shell, everything else managed in GTM.

**Event taxonomy** (GA4 recommended event names where they exist, so the standard reports light up):

| Event | Fires when | Notes |
|---|---|---|
| `page_view` | every route change | SPA: fire on our client-side navigation, not just first load |
| `scroll` | 90% depth on long pages | GA4 Enhanced Measurement covers this |
| `view_item_list` | storefront listing seen | ecommerce |
| `view_item` | product detail seen | ecommerce; item id = SKU |
| `cta_click` | "Book a Deep Dive" + primary CTAs | param `cta_location` (header / hero / page) |
| `generate_lead` | deep-dive form submit, quote request | GA4 recommended lead event |
| `add_to_cart` / `begin_checkout` / `purchase` | basket + Stripe flow | ecommerce; `purchase` also fired server-side (below) |
| `sign_up` / `login` | account created / signed in | sets `user_id` (below) |

**The funnel.** Define one funnel in a GA4 Funnel exploration: land (`session_start`) → engage
(`view_item` / `scroll`) → intent (`cta_click` book, or `begin_checkout`, or lead-form start) →
convert (`generate_lead` / `purchase` / `sign_up`). GA4 shows the drop-off between each step and lets
you break it down by campaign, so "the LinkedIn campaign lands well but loses people at the form" is a
two-click answer.

**Campaigns are automatic.** GA4 reads `utm_source` / `utm_medium` / `utm_campaign` / `utm_term` /
`utm_content` off the URL with no extra work, so every tagged link is attributed in the acquisition
reports. Marketing just tags links consistently (we'll agree a naming convention).

**Server-side for the money events.** Ad blockers and ITP kill roughly a third of client-side GA. For
the events that matter commercially (`purchase`, `generate_lead`, `sign_up`) we ALSO send a
server-side event from the edge function via the GA4 Measurement Protocol, keyed on the same GA client
id. Client GA for rich behaviour, server GA for reliable conversions.

---

## Layer 2 — Attribution spine (campaign → person)

GA tells you a campaign drove traffic. To tell sales that *this lead* came from *that campaign*, we
carry the source onto the record:

1. **First-touch capture.** On the first visit, read the UTMs (and referrer, and landing path) and
   write them to a first-touch cookie/localStorage that we never overwrite. This is "what originally
   brought them", which is what sales and campaign ROI care about.
2. **Last-touch too.** Keep a separate last-touch value (overwritten each visit) for multi-touch
   questions later. Lead on first-touch; keep last-touch for completeness.
3. **Attach on conversion.** When the person converts (any edge function), the captured attribution
   plus the GA client id ride along into Supabase and Pipedrive.

Without this step GA and the CRM stay two separate islands: GA knows campaigns drove sessions, the CRM
knows you have leads, and nothing connects the two.

---

## Layer 3 — Pipedrive CRM (who's who, how to engage)

Every conversion writes to Pipedrive **server-side** from the edge functions we already run. The
Pipedrive API token is a Supabase secret, never in the browser.

**What writes, and when:**

| Trigger | Pipedrive write |
|---|---|
| Account sign-up | upsert Person (dedupe by email) + Organization; tag lifecycle = "registered" |
| Deep-dive form submit | upsert Person + create Deal in "Deep Dive" pipeline, stage "Enquiry" |
| Quote request (`request-quote`) | upsert Person + Deal with the quoted value, stage "Quote sent" |
| Purchase (`stripe-webhook`) | upsert Person + Deal marked **Won** with the order value |

**Person / Deal field mapping** (the custom fields you'd create in Pipedrive):

- Person: name, email, phone, company, `ga_client_id` (the GA↔CRM join), `first_utm_source/medium/campaign`, `first_landing_page`, `first_seen_at`.
- Deal: title, value, currency, pipeline + stage, `source_campaign`, `converted_on_page`, link back to the Supabase order/quote id.

So a salesperson opens Pipedrive and sees: "Jane at Stonewell, arrived on the `linkedin-deepdive`
campaign, requested a quote for X on the Services page, account created, not yet booked." That is the
"who's who and how to engage" the sales team asked for.

**Dedupe by email** so a person who enquires, then signs up, then buys is one record with three deals,
not three people.

**Offline conversions back to Ads (later).** Because we store the GA client id on the Person, when a
deal is marked Won in Pipedrive we can send that value back to GA4 / Google Ads as an offline
conversion, so ad spend optimises against real revenue, not just form fills. Phase 4, optional.

---

## Layer 4 — Identity, accounts, and the PII boundary

- **`user_id` in GA4.** On sign-up/login we set GA4's `user_id` to the Supabase user id (an opaque
  UUID), so a person's behaviour stitches across sessions and devices into one user.
- **Account = join key.** The same Supabase user id links GA (`user_id`), our DB, and the Pipedrive
  person (`ga_client_id` + email). One person, one thread, everywhere.
- **PII never goes to GA.** Google's terms forbid it and it's the right call. GA gets the opaque
  `user_id` and `ga_client_id` only. Names, emails, phone numbers live in Supabase and Pipedrive, which
  are access-controlled. Anything sent to GA is non-identifying.

**Supabase changes:** add first-touch attribution columns to the customer profile (or a small `leads`
table for not-yet-registered enquirers), and store the `ga_client_id`. RLS stays as-is: a customer
sees only their own row; the edge functions write with the service role.

---

## Consent + legal (hard dependency)

This is UK/EU, so this cannot ship without it:

- **Consent banner with Google Consent Mode v2.** Analytics and ad tags stay in a denied state until
  the visitor accepts; essential cookies (auth, basket) are exempt. GTM + Consent Mode handle the
  gating cleanly.
- **Privacy policy + cookie policy.** This is the same legal-pages item from Ben's review (T&Cs,
  GDPR, anti-slavery). Do them together; the privacy policy must name GA, Pipedrive, and Stripe as
  processors and state retention.
- **Data retention.** Set GA4 retention sensibly (14 months) and document what Pipedrive holds.

---

## Security boundaries

- Pipedrive API token, GA4 Measurement Protocol API secret → Supabase secrets, used only in edge
  functions. Never in the client bundle.
- Only the GA4 Measurement ID (`G-…`) and GTM container id (`GTM-…`) are public, which is fine.
- No PII to GA (see Layer 4). No tokens in git (the `.env` discipline already in place holds).
- All CRM writes are server-side, so the browser can't forge a deal or a lead.

---

## What you provision (your side)

1. **GA4 property** → the Measurement ID (`G-XXXXXXX`) + a Measurement Protocol API secret.
2. **GTM container** → the container id (`GTM-XXXXXXX`).
3. **Pipedrive** account → an API token, and a decision on the **pipeline + stages** (a simple
   "Deep Dive" pipeline: Enquiry → Quote sent → Booked → Won/Lost works to start).
4. **Consent banner** choice (we can build a lightweight one, or drop in a managed tool) + the
   **privacy/cookie policy** copy.
5. A **UTM naming convention** for marketing (source / medium / campaign), so reports stay clean.

Everything else I build. I can scaffold the code with env placeholders before the keys exist, so the
real values are a config step, not a rebuild.

---

## Build sequence (proposed)

**Phase 1 — Measurement foundation.** GTM + GA4 install in the app shell; consent gate (Consent Mode
v2) + a basic banner; SPA `page_view` on route change; the event taxonomy above; the GA4 funnel.
*Delivers:* campaign acquisition + on-site behaviour + drop-off, live, for any tagged link.

**Phase 2 — Attribution spine.** First-touch (and last-touch) UTM capture + GA client id, persisted;
`user_id` set on sign-up/login. *Delivers:* every session and every future conversion carries its
source.

**Phase 3 — Pipedrive sync.** Edge-function upserts (sign-up, deep-dive form, quote, purchase) with
the field mapping; dedupe by email. *Delivers:* sales see who's who, where they came from, and what
they did, in Pipedrive.

**Phase 4 — Hardening + insight.** Server-side Measurement Protocol for the money events; offline-
conversion sync of Won deals back to GA/Ads; a small "campaign + funnel" dashboard view. *Delivers:*
reliable conversion data and ad optimisation against real revenue.

Phases 1 and 2 are quick and unlock the analytics John asked about. Phase 3 is the bulk of the CRM
value and depends on the Pipedrive account + token. Phase 4 is optimisation, do it once volume
justifies it.

---

## Key decisions + recommendations

- **GTM vs hard-coded GA tag** → GTM. Marketing manages tags without deploys; ad pixels slot in later.
- **Pipedrive direct vs a CDP/Zapier layer** → direct from the edge functions. Simpler, no extra
  vendor or cost at this scale, and we already own the server-side functions. Revisit a CDP only if we
  add many more destinations.
- **Client vs server events** → hybrid. Client GA for behaviour, server-side for the commercial
  conversions so ad blockers don't undercount revenue.
- **First- vs last-touch attribution** → capture both, lead on first-touch ("what brought them"),
  keep last-touch for multi-touch analysis.
- **Consent default** → denied until accepted (EU-safe), with Consent Mode so GA still models
  conversions in aggregate.

## What the dashboards will answer (back to the goal)

- Which campaigns bring people in, and which bring people who actually convert (not just click).
- What people do on the site and which step they drop off at, per campaign.
- For each lead: who they are, where they came from, what they looked at, and what to do next.
- The whole thread per account, from first anonymous touch to signed-in customer.
