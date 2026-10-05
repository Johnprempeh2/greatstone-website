# Cutover checklist — old greatstonesoftware.co.uk → new build

The single ordered runbook for launch day. It sequences everything the launch-prep work built and points at
the detailed docs rather than repeating them. Two rules: follow the order, and don't pass a go/no-go gate that
isn't green.

Detailed procedures: **GO-LIVE-RUNBOOK.md** (Stripe/email/functions/deploy/smoke test/rollback),
**MIGRATION-IMPORT.md** (the data import + export format), **STAFF-PROVISIONING.md** (accounts + verifier),
**LAUNCH-REQUIREMENTS.md** (what Ben supplies), **DOMAIN-CUTOVER.md** (the origin/domain move).

## Before the day (prep)

- [ ] **From Ben / counsel / providers** (LAUNCH-REQUIREMENTS.md): the customer + order + history export
      (JSON, format in MIGRATION-IMPORT.md); the migrated product-slug map; final legal wording; the
      production Supabase project; Stripe live keys; a verified Resend sender; the domain.
- [ ] **Migrations:** apply `0001–0023` to the production Supabase project (GO-LIVE-RUNBOOK §0).
- [ ] **Legal pages:** paste counsel's wording into Terms / Privacy / Cookies / Refunds in the CMS and
      **publish** them (they ship as footer-wired drafts, hidden from the public until published).

## T-0 sequence

1. **Freeze the old site** — maintenance notice or read-only, so no new orders land mid-migration. *[external]*
2. **Preflight gate:** `npm run preflight` — runs the unit tests, the production build (SEO files + the
   dist secret scan), the redirect drift check, the edge secrets list check, and the row-level security check (`rls:check`). Must be green before anything ships.
3. **Redirects:** drop Ben's product-slug map at `scripts/legacy-product-map.json`, run `npm run redirects`,
   and commit. (Skip to accept the vendor-catalogue fallback; every old product URL still lands on the right
   vendor.) Refresh `scripts/legacy-urls.txt` from a fresh crawl first if the old site changed.
4. **Data migration** (MIGRATION-IMPORT.md), prod credentials in the environment:
   - a. **Dry-run:** `node scripts/migrate-legacy-store.mjs <export>.json --dry-run`. Read the plan; resolve any
     orphan or **duplicate-key** warnings — the importer refuses to apply while duplicate keys remain.
   - b. **Apply:** the same command without `--dry-run`. Idempotent, so it is safe to re-run if it stops.
5. **Staff:** `npm run verify:staff` (service-role creds in env) — must report **zero blocking errors**.
6. **Edge functions + secrets** (GO-LIVE-RUNBOOK §1–3): deploy `stripe-checkout stripe-webhook stripe-portal
   notify-licence-issued`; set `RESEND_API_KEY`/`RESEND_FROM`, the live `STRIPE_*` keys, and re-register the
   **live** webhook (the test signing secret does not carry over).
7. **Front-end deploy** (GO-LIVE-RUNBOOK §4): `npm run build`, deploy `dist/`, and set `VITE_SITE_ORIGIN` to the
   live origin (DOMAIN-CUTOVER.md). Confirm the live URL serves the new bundle.
8. **DNS** cutover to the new host. *[external]*
9. **Live smoke test** (GO-LIVE-RUNBOOK §5): a £1 order end-to-end; issue a licence key against it and confirm
   the customer gets the "ready to collect" email and sees the key in their account; **create an account with a
   known migrated customer's email** and confirm their historical orders appear (the reclaim path, MIGRATION-
   IMPORT.md); refund the test order and confirm it reconciles.
10. **Post-launch:** enable PITR backups + run one restore drill (GO-LIVE-RUNBOOK §6); take the old site down.

## Go / no-go gates

Do not proceed past a gate that is not green:

- **Ship gate (step 2):** `npm run preflight` green.
- **Migration gate (step 4a):** dry-run plan looks right, no unresolved duplicate or orphan warnings.
- **Accounts gate (step 5):** `verify:staff` reports zero blocking errors.
- **Live gate (step 9):** the £1 smoke test passes end-to-end (payment, licence email, migrated-order display, refund).

## Rollback (GO-LIVE-RUNBOOK "Rollback")

- **Bad deploy:** promote the previous Netlify deploy.
- **Payment incident:** switch Stripe keys back to test to stop live charges while you diagnose.
- **Data incident:** PITR restore to the last known-good point.
- **Migration stopped part-way:** fix the export and re-run — the import is idempotent, so a partial run is safe
  to resume.
