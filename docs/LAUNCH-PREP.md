# Launch-prep build log

Autonomous build progress on everything that needs no external credential or Ben decision, so it plugs in
once Stripe / production DB / domain / email / legal land. Decisions locked (see docs/LAUNCH-REQUIREMENTS.md):
the new build **fully replaces** the old site (migrate all customers + orders + history), and we **sell live**
at launch with **manual** licence-key fulfilment.

Deferred / Ben-owned (do NOT touch here): live Stripe, production Supabase, domain/DNS, email sender domain,
legal wording.

## Backlog (highest value first)
- [x] **Admin licence-key issuance, order-driven.** Issue the key that fulfils a paid order, from the order.
- [ ] Existing-data migration tooling (idempotent importer + documented input format + dry-run).
- [ ] Migrated/historical order display (orders with no Stripe session, marked migrated).
- [ ] ~400-URL 301 redirect map from a crawl of the old site → public/_redirects.
- [ ] Editable legal-page scaffolds (Terms / Privacy / Cookie / Refund), wired to footer/nav.
- [ ] Secret hygiene + config reconcile (VITE_SITE_ORIGIN vs VITE_APP_URL; dist secret-grep guard; refresh GO-LIVE-RUNBOOK to 0001–0023).
- [ ] Auth email templates → bundled/CSS logo (no remote image) + single canonical-domain placeholder.
- [ ] FX-rate staleness guard / admin visibility.
- [ ] Staff provisioning seed/verify.

## Log

### Iteration 1 — Order-driven licence-key issuance (fulfilment)
The `licence_keys` table + RLS (0017/0018) and the per-customer `KeyEditor` already existed, but the only
path to issue a key was via Clients, disconnected from the order that needs fulfilling, and "Mark fulfilled"
was a bare status flip. Closed that gap:
- Exported the proven `KeyEditor` from ClientsManager and reused it in OrdersManager.
- Orders admin now loads each order's buyer (`customer_id`/`customer_email`) and its issued `licence_keys`
  (same reverse-embed pattern as `order_items`). New **Keys** column shows issued/purchased (e.g. 1/1) with
  an "issue" nudge when a confirmed order still has unfulfilled items.
- Expanded order detail shows the buyer, an **Issue key** button per line item (pre-fills the product,
  edition and order link, targets the order's customer), and a panel of keys already issued (masked, with
  status). Issuing delivers straight to the buyer's account → Licence keys.
- Guards the case where an order has no linked customer yet (issue from Clients instead).

Verified live in `#catalogue/orders` against the interim DB (4 real orders): Keys column renders (1/1),
expanded detail shows the buyer, the issued key (masked) and the per-item Issue button. 497 tests, build clean.
