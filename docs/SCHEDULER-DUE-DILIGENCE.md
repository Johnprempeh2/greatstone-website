# Booking tool — due diligence (self-host Cal.com)

John asked for "our version of Calendly: free, on-brand, with multiple team members considered for
meetings", and chose self-hosting Cal.com. This is the due-diligence pass before any build. Researched
against Cal.com's own LICENSE files, the `ee/` directory, the pricing page, the self-hosting + embed
docs, and the Docker/compose config (June 2026). The headline is a dealbreaker for the exact combination
requested, so it leads.

## The headline: free + on-brand + team scheduling, self-hosted, is NOT achievable on Cal.com's free licence

Cal.com is open-core, dual-licensed. Everything works **except the team part**, which is the part John
specifically asked for.

- **The free community edition is now "Cal.diy" (MIT).** As of a 15 Apr 2026 commit, the `main` branch of
  `github.com/calcom/cal.com` was rebranded to **Cal.diy** and relicensed MIT, with **Teams,
  Organizations, round-robin, collective scheduling, SSO and workflows stripped out**. Its own README says
  it is "strictly recommended for personal, non-production use" and "for any commercial and
  enterprise-ready scheduling infrastructure, use Cal.com, not Cal.diy". So the genuinely-free path has
  **no team scheduling at all**.
- **The real Cal.com product is AGPLv3 + a commercial "Enterprise" licence.** Anything under
  `packages/features/ee/**` is the Commercial License; everything else is AGPLv3. **Round-robin lives in
  `ee/round-robin/`, teams in `ee/teams/`, collective + managed event types + organizations + SSO all
  under `ee/`.** The `ee/LICENSE` text requires a paid **Commercial Subscription** to use that code **in
  production** (dev/testing is allowed free). Self-hosting those features in production needs a purchased
  **licence key** (Cal.com's own self-host doc: "you need to purchase a License Key... contact our sales
  team").
- **Price:** Cal.com does **not** publish a self-host commercial price (sales-gated, "per host"). The only
  public anchor is cloud: **Teams = $12/user/mo** (annual), which is the tier that unlocks round-robin,
  collective, managed events **and** "remove Cal.com branding". Organizations = $28/user/mo.

### Free vs paid, feature by feature (self-host)

| Feature | Free (AGPL self-host)? |
|---|---|
| Remove Cal.com branding / white-label the booking page | ✅ Free (logo + app-name env + colour tokens) |
| Embed the booker on our React site | ✅ Free (client-side JS is AGPL) |
| Google Calendar + Microsoft 365 connections (+ Meet/Teams/Cal Video) | ✅ Free (you register your own OAuth app) |
| Basic webhooks (BOOKING_CREATED/CANCELLED/RESCHEDULED) + REST read | ✅ Free |
| **Round-robin team scheduling** | ❌ **Commercial/EE (paid)** |
| **Collective team scheduling** | ❌ **Commercial/EE (paid)** |
| **Teams (multiple members) at all** | ❌ **Commercial/EE (paid)** |
| Organizations, managed event types, SSO/SAML | ❌ Commercial/EE (paid) |

**So:** single-host, fully-branded, calendar-synced, embedded, feeding our CRM = free and excellent.
**Multiple team members considered for meetings = a paid Cal.com commercial feature**, full stop.

## The good news (everything except teams is genuinely strong)

If we go Cal.com (paid for teams, or free for a single host), the on-brand + integration story is great:

- **On-brand:** global colour via the `--cal-*` tokens in `globals.css`, custom CSS + brand font, our logo,
  our domain (`book.greatstonesoftware.co.uk`). The embed accepts `cssVarsPerTheme` (`cal-brand`,
  `cal-bg`, `cal-text`, `radius`, …) so a dark + lime booker is a real, documented capability. The
  React `@calcom/embed-react` package does inline + popup; the Atoms `BookerEmbed` is a fully-native
  (no-iframe) React component for a pixel-level brand match if we want it.
- **Calendar sync:** register our own Google Cloud OAuth app (`GOOGLE_API_CREDENTIALS`) and/or Azure app
  (`MS_GRAPH_CLIENT_ID/SECRET`); free, with auto Meet/Teams/Cal Video links.
- **Bookings → CRM:** Cal.com webhooks (`BOOKING_CREATED` etc., HMAC-signed via `x-cal-signature-256`)
  POST to a Supabase edge function / Netlify function → write each booking into our own tables as a lead.
  REST API v2 (`GET /v2/bookings`) for nightly reconciliation.

## The ops + cost reality (if self-hosted)

- **Cheapest real setup ≈ $5–8/month:** the prebuilt `calcom/cal.diy` Docker image on a small Hetzner VPS
  (2–4 GB RAM at runtime; 6 GB only if building from source), using our **existing Supabase Postgres** as
  a **dedicated Cal database** (wire both `DATABASE_URL` pooled + `DATABASE_DIRECT_URL` for migrations),
  and **Resend over SMTP** (`smtp.resend.com:465`) for email. DigitalOcean instead pushes it to ~$12–24.
  **Vercel is not the cheap route** (Pro required, $20+/mo; free tier blocked by function limits).
- **Not truly $0 for production:** free tiers (Render/Fly) sleep and cold-start, which is bad for a live
  booking page. Budget the ~$5–8/mo.
- **Ongoing effort ≈ 2–4 hrs/month** once stable: Cal.com ships multiple releases per week, nearly every
  upgrade runs DB migrations (back up first, migrate on the direct URL), plus VPS/TLS patching and
  watching for calendar/email breakage after upgrades. Half-day one-time setup. **We own all reliability
  and security.**

## The re-framed decision

Because Cal.com paywalls the team part, the original "free + on-brand + team, self-hosted" isn't on the
table as stated. The honest options are now:

1. **Cal.com self-host, single host (free + on-brand).** Drop the team requirement for now. Free, fully
   branded, calendar-synced, embedded, feeds the CRM. Add a team later by paying or rebuilding. Best if
   "free + branded now" matters more than team routing today.
2. **Cal.com Teams (paid, least effort).** ~$12/user/mo cloud (or a self-host commercial quote). Team
   round-robin + collective + branding, maintained by Cal.com, zero engine to build. Best if team
   scheduling is worth a small per-seat fee.
3. **Build it custom (free + on-brand + team, but ours to build and maintain).** Now more attractive,
   since Cal.com's "don't rebuild the engine" advantage is paywalled for teams anyway. Free in pounds,
   but the multi-week build + permanent maintenance + reliability stakes described earlier, and we'd need
   each member's calendar connected. Best only if owning the booking product is strategic for Greatstone.
4. **A different free OSS tool whose team features are genuinely free** (e.g. Easy!Appointments, GPL,
   multi-provider + Google Calendar). Free + team, but clunkier and harder to make pixel-on-brand /
   embed cleanly. Needs its own due-diligence pass before recommending.

## Recommendation

If team scheduling is firm and a small fee is acceptable, **Cal.com Teams** is the rational call: it is
the cheapest *total* cost of ownership (no build, no maintenance, no reliability risk) for exactly the
feature John asked for, and the embed still themes to the Greatstone brand. If "free" is the hard
constraint and team can wait, **self-host Cal.com for a single host now** (genuinely free + on-brand) and
revisit team routing later. Building fully custom is justified only if the booking system is meant to be
an owned Greatstone product, not just a way to book a call. The interim Calendly embed already shipped
stays as the working fallback while this is decided.

**Verify before committing:** pin a specific Cal.com release tag (not `main`, which is the unrelated MIT
Cal.diy fork); and if any reading hinges on the EE terms, get the self-host commercial price + terms in
writing from Cal.com sales.
