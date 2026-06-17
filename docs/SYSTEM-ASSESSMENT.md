# Greatstone Commerce Platform — Critical Assessment
_17 Jun 2026. Multi-agent audit (7 dimensions, 31 agents) over the full system; every high/medium finding adversarially verified._

## Verdict
A strong, secure, correctly-built **prototype**. The hard parts are done well: the money path is server-authoritative and can't be tricked by the client, the tenancy/security model is defense-in-depth, and the data model is thoughtful. What's missing is the **operational wrapper** to run it for real customers (confirmation emails, fulfilment, refunds, observability, CI) plus a few lifecycle gaps. It is not yet go-live ready, and nothing found is a rewrite — it's a known, finite punch-list.

No high-severity defects survived verification. The serious cross-tenant IDOR found in the prior review is fixed and confirmed closed.

## Scorecard
| Dimension | Grade |
|---|---|
| Security / RLS / auth | **A** |
| Payments / pricing / FX | **B** |
| Data model / integrity | **B** |
| Frontend architecture | **B** |
| Performance | **B** |
| Accessibility / responsive | **B** |
| Ops / go-live readiness | **C** |

## What's genuinely strong
- **Server-authoritative charging.** The cart sends only variant id + quantity; the edge function re-fetches prices, re-reads the FX rate and rules, recomputes GBP and charges that. A tampered client price is ignored (verified live).
- **Security model.** FORCE RLS on all 30 business tables (deny-by-default), correct bidirectional staff/customer separation, SECURITY DEFINER functions with pinned search_path, JWT-validated edge functions, signature-verified webhook, clean secret hygiene (only the anon key is in the client bundle).
- **Money correctness.** Integer minor units end-to-end; client/server FX conversion byte-identical; idempotent order capture on the Stripe session id.
- **Frontend discipline.** Code-splitting, out-of-order request guards, real error boundaries, SEO head management.
- **Performance hygiene.** Lean public bundle; the 3D stage is gated off utility routes, pauses when hidden, and freezes for reduced-motion.

## Confirmed issues (9 medium — verified real)
**Payments lifecycle**
1. The webhook only handles `checkout.session.completed`. No `async_payment_succeeded` / `async_payment_failed` / `expired` handling — effectively card-only-and-instant.
2. No refund or cancellation reconciliation: refunds done in Stripe never reflect back into `orders` (the `refunded`/`cancelled` statuses exist but nothing sets them).

**Frontend**
3. Two parallel cart systems coexist — the legacy quote-request `CartContext`/`CartDrawer` (from the original prototype) and the live Stripe `cart.mjs`/`StoreCart`. Pick one as canonical and retire the other.

**Accessibility**
4. The live basket drawer isn't a full modal — no Tab-trap, no body-scroll-lock (the legacy `CartDrawer` actually had a full trap; the live one regressed).
5. The admin Edit drawer never moves focus in, doesn't trap, and strands focus behind the overlay.
6. SPA store-route changes don't move keyboard/screen-reader focus to the new view.
7. The live basket count is invisible to assistive tech (no `aria-live` mirror).

**Ops**
8. No order-confirmation email — the customer pays and receives nothing immediately.
9. No CI and no documented migration/deploy/rollback process; the pricing engine is duplicated client/edge with no parity test (silent-drift risk on the money path).

## Production-readiness gaps (the C-grade story — what's missing before real customers transact)
- **Order confirmation email** (pay → receive nothing today).
- **Licence-key / entitlement fulfilment** — the actual product is undelivered (deferred, awaiting your fulfilment process).
- **Refunds / cancellations** reconciled back to orders.
- **Quote / PO / VAT-invoice path** — specced P0, not built; storefront is card-only.
- **Observability** — client error reporter (Sentry) + a top-level ErrorBoundary on store/account routes + webhook-5xx alerting. Today errors are `console.error` only.
- **CI** (build + test on PR) + a committed `supabase/config.toml` + a written **go-live runbook** (test→live key swap, webhook re-register + new signing secret, £1 live smoke test, rollback).
- **Transactional bulk-import RPC** (the apply() is non-atomic; orphans land as draft).
- **Async/failed payment** handling (#1 above).
- **Backups / PITR** enabled + one restore drill.
- **Rate limiting** on the public `--no-verify-jwt` checkout function.
- Dashboard toggles you own: **Supabase email-confirmation ON**, **Stripe Customer Portal** configured (test + live).
- Minor correctness: persist **VAT as a discrete field** + share one VAT rate (client/server drift risk); persist **discount provenance** (`applied_rule_id`) on order items for audit; **`from_price_minor` cache** has no automated maintenance (drifts on writes).

## Recommended sequencing
1. **Quick safe wins (hours):** the a11y items (#4–#7), reduced-motion on the product smooth-scroll, VAT-rate single-source, discount provenance on order items.
2. **Go-live essentials (days):** order-confirmation email, observability (Sentry + ErrorBoundary + webhook alerting), CI + go-live runbook, transactional import RPC, async/failed-payment handling.
3. **Product decisions (yours):** retire the legacy cart vs keep both; build the quote/PO/invoice path; refund/cancellation workflow; licence-key fulfilment mechanism; multi-org tenancy hardening (only if a second org is coming).
