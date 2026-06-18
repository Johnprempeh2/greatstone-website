# Overnight site review — backlog

A self-paced review loop: each cycle reviews part of the site, fixes real bugs + UX/UI gaps, verifies (build + tests + preview, 0 console errors), commits + deploys, and ticks items here so cycles don't repeat. Sourced from a 3-agent parallel review (public pages / commerce / admin+3D) on 18 Jun 2026.

Legend: [ ] open · [x] done (commit) · [~] deferred (needs a product/content decision or a bigger build)

## Cycle 1 — method-explorer hardening + quick safety wins
- [x] MethodExplorer builds exactly `items.length` gems (was always 8 from PILLAR_SVG); clicking a gem past the pillar count opened an empty detail panel. Clamp + build N.
- [x] MethodExplorer a11y: full-screen `#breakdown` overlay now `role="dialog" aria-modal aria-label`, focus moves in on open + restores on close + Tab trap; `me-picks` downgraded from a half-built tablist to `aria-pressed` buttons.
- [x] Insights dead CTA: `FeaturedArticle` default `ctaLabel` rendered a primary "Read the piece" button to `#` (jumps to top). Dropped the default label (no button until a real link is set).
- [x] Three hand-written page titles in store.js used em dashes (banned by the voice guide + inconsistent with the rest using "·"). Swapped to "·".
- [x] Cart `+` past MAX_QTY (100) silently no-ops; disable it at the cap with an aria-live note. Aligned the quote clamp to 100 too.
- [x] Auth-subscription cleanup could throw on unmount (`data.subscription.unsubscribe()` unguarded) in AccountDashboard + CatalogueAdmin → blank route. Guarded with optional chaining.
- [x] Dead `bloom` option in pillar-explorer.mjs (post-process was dropped for the aura sprite) — removed from the signature + call sites.
- [x] `navigate()` left `adminNav`/`breakdownRoute` to the async hashchange (one-render desync flash) — cleared synchronously.
- [x] AdminConsole Commerce rail badges (`attention.orders`/`quotes`) can never light up (App only passes releases/team) — dropped the misleading badge refs.

### Cycle 1 follow-ups (found during the live preview spot-check)
- [x] Persisted meta titles: the em-dash sweep fixed the seed default but not titles already saved in a user's localStorage (the live home `document.title` still read "Greatstone International — The Foundation…"). Added a `migrate()` pass that rewrites ` — `/` – ` → ` · ` in every page `seo.title`. Verified live.
- [x] MethodExplorer dialog `aria-label` carried an em dash a screen reader announces verbatim ("…pillars — interactive breakdown") → comma.

_Cycle 1 verified: build clean, 51/51 tests, preview spot-check (home title, breakdown explorer render+select, shop) 0 console errors, deployed to greatstone-home.netlify.app/puck-proof/ and bundle hashes return 200._

## Deferred / needs decision (next cycles or John)
- [~] Quote VAT contract (CRITICAL, money): server stores `indicative_total_minor` EX-VAT but the admin treats it as the customer figure; `convert_quote_to_order` may run with a null `quoted_total`. Needs the edge fn/RPC to store inc-VAT (or both) + require a non-null quoted total pre-filled to `round(indicative*1.2)`. (request-quote/index.ts, QuotesManager.jsx)
- [~] Checkout price drift (CRITICAL): cart shows storefront GBP; server re-derives from USD at the *current* FX rate/rules. If FX/rules change between load and pay, the charge differs with no "price updated" reconfirm. Have startCheckout return the server total + confirm if it differs >1p.
- [~] Invoice VAT number is a literal `[add VAT no.]` placeholder — production blocker; pull from org_settings + hide if absent. (John: provide the VAT number.)
- [x] Account: quotes query has no error handling (silent empty on RLS/network fail) — surface the error like orders does. (AccountDashboard.jsx) **[cycle 2]** quotesErr + loadQuotes + "Try again" row.
- [~] Admin tables (Orders/Quotes/Pricing/Offerings) aren't SR/mobile-safe. **[cycle 2]** `scope="col"` added to every store/admin table header (+ sr-only text for the empty actions `th`). Still open: the `data-label` card-collapse pattern for the admin manager tables (only `.acct-orders` has it) — wants responsive testing, next cycle.
- [x] FX editor: lost-update race on the global rate + no confirm dialog (mis-prices the whole catalogue). **[cycle 3]** Added a current→new confirm before the write + an optimistic-lock guard on `row_version` (bumped by touch_row); a concurrent save now reloads + warns instead of clobbering. No migration needed (column + trigger already existed).
- [ ] ContactBand "Run the time-savings calculator → #go/services" promises a calculator the services page doesn't have. Relabel or build a real calculator (content decision).
- [ ] Checkout drops POA/unpublished/sub-£1 items silently — return a `droppedItems` array + tell the buyer.
- [ ] Re-order ("Buy again") adds at the historical price (stale vs current FX) — re-fetch current pricing or label "indicative".
- [x] applyHead stamps the last page's title/canonical on `#shop`/`#account`/`#invoice` — set a generic title for utility routes. **[cycle 2]** Each app route (breakdown/admin/invoice/account/confirm/catalogue/shop) now gets its own title + canonical.
- [x] IndustryPicker + me-picks: complete or downgrade the half-built ARIA tabs (tabpanel/aria-controls). **[cycle 1 + 3]** me-picks downgraded to aria-pressed buttons (cycle 1); IndustryPicker completed as real tabs — tabs carry id + aria-controls, content is a role="tabpanel" with aria-labelledby tracking the active tab (verified live).
- [ ] Cairn bg: sizes to the viewport + binds global pointer/resize listeners (should scope to its container via ResizeObserver) + reacts when faded out. Dormant (no page uses it) — fix before it's used.
- [x] Sign-out optimistic: await signOut() before clearing local state. **[cycle 3]** adminAuth.signOut() throws on error; doSignOut() awaits + keeps the signed-in chrome on failure. (Customer dashboard already reactive via onAuth.)
- [ ] getStaffUser null-role staff bounces to sign-in with no message + unknown future role locks the body — add a distinct "no role assigned" state.
- [x] Public EditorBoundary has no onReset → a malformed published block loops on Reload; offer "Go to home". **[cycle 3]** Added a "Go to home" action (any non-home route) that navigates to the first page.
- [x] Stage visibilitychange re-activates loops without re-checking prefers-reduced-motion. **[cycle 3]** apply() now re-checks a persistent reduced-motion MediaQueryList every call (was defeated by any scroll/resize/visibility) + re-applies live on toggle.
- [x] Product gallery: add aria-current to the active thumb + an aria-live "Image N of M". **[cycle 2]** Both done + thumb group labelled.
- [ ] FeaturedArticle/InsightsGrid/Team: make `alt` required (or warn inline) when an image is set.
- [ ] Confirmation page exposes the raw `cs_test_…` session id as the "Reference" — strip the prefix + match the email format. Add a "Test mode" banner gated on the test key.
- [x] Replace remaining em-dashes in user-facing store copy (StoreCart, ca-notes, request-quote errors). **[cycle 2]** Swept StoreCart/Orders/Quotes/Pricing/BulkImport/bulkCsv copy + en-dashed the "no value" cell glyphs; only source comments retain dashes.
- [ ] BookDeepDive `eyebrow` field is editable but never rendered — render it or remove the field.
