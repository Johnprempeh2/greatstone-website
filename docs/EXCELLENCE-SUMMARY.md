# Excellence loop: summary for John

A consolidated brief of the autonomous excellence loop (1-2 Jul). Everything below is committed and revertible;
**nothing is deployed.** Two things need you: a single deploy pass for the three fulfilment features, and a
yes/no on the open proposals. Full detail lives in `docs/EXCELLENCE-LOOP.md`; the fulfilment features have their
own handoff docs.

## 1. Shipped this run (committed, not deployed)

Every change was scoped, tested (`npm test` 577 green), built clean, and where reachable verified in the live
preview. The `.claude/launch.json` and `src/blocks/ProductDetail.jsx` working-tree changes were left untouched
throughout.

| Cycle | Commit | What shipped |
|-------|--------|--------------|
| 28 | `4ddd8aa` | **PO-document upload** at checkout (deploy-ready; see section 2). |
| 29 | `49ec9cd` | Invoice totals table: footer labels are now `<th scope="row">` (WCAG 1.3.1), with a CSS reset so the footer renders identically. |
| 30 | `d5910b0` | Customer + catalogue-admin sign-in forms brought up to the admin `SignIn` gold standard: error `id` + `aria-invalid`/`aria-describedby` wiring, clear-error-on-edit, explicit label association. |
| 31 | `328df74` | 3D scene labels: em dashes removed from the preset + scene dropdowns. |
| 32 | `54d6e27` | Voice: ~29 prose em dashes removed from visible studio copy + the SEO/a11y suggestion engines. |
| 33 | `9e71db4` | Voice: British spelling (`organisation`) across ~13 visible strings; banned `unlock` to `activate`; 2 residual em dashes. |
| 34 | `9472fa6` | Order-confirmed screen reviewed: already excellent, nothing to change (logged, no code churn). |
| 35 | `66b2ed4` | ServiceDetail: decorative check SVGs `aria-hidden`; one prose em dash removed. |
| 36 | `f0b11ac` | StoreProduct: fallback-image `alt` now matches the shown image (vendor-logo case); quote-email em dashes removed. |
| 37 | `8c32bdf` | StoreBrowse: Filters disclosure completed (`aria-controls` + panel `id`); search icon `aria-hidden`; "Clear all" moved out of the `<h2>` (was polluting the heading name). |

The functional-slice sweep is complete: 18 surfaces reviewed (account, storefront, catalogue, admin, cart,
checkout, invoice, nav, deep-links, editor workflow, Intelligence hub, auth, OrgDashboard, 3D editor,
order-confirmed, ServiceDetail, StoreProduct, StoreBrowse) plus a full voice pass. Several came back already
excellent and were logged as such rather than churned.

## 2. Deploy-ready: Ben's fulfilment trilogy (needs your deploy)

The three 1 Jul fulfilment features are built and committed but cannot be applied from the loop (Storage buckets,
migrations and edge functions need the live Supabase project). They ship in **one pass**, in this order:

1. **Apply the migrations, in order:** `0024_licence_files.sql`, `0025_vendor_activation.sql`,
   `0026_po_documents.sql`. (Migrations first: the frontend selects the new columns.)
2. **Deploy the edge functions:** `request-quote` (PO-document upload) and `notify-licence-issued` (licence-file
   + activation-instruction email injection).
3. **Deploy the frontend** (already committed).

| Feature | Migration | Handoff doc |
|---------|-----------|-------------|
| Licence-FILE upload on fulfilment (the `.lic` case Ben flagged) | `0024` | `docs/LICENCE-FILE-FULFILMENT.md` |
| Per-range activation instructions (account + email) | `0025` | `docs/ACTIVATION-INSTRUCTIONS.md` |
| PO-document upload at checkout | `0026` | `docs/PO-DOCUMENT-UPLOAD.md` |

Until deployed, each degrades cleanly: the licence-key string path, the online PO number, and the email-the-PO
fallback all still work.

## 3. Open proposals (need a yes/no)

Contained improvements the loop deliberately did not ship because they are subjective, touch behaviour, or need
your business data. None is urgent.

- **Invoice VAT number (recommended yes).** The invoice shows a red `[add VAT no.]` placeholder on a document
  titled "VAT Invoice". Before any real invoice goes out it needs your VAT registration number (as an org
  setting, not hardcoded), or, if the company is not VAT-registered, the VAT title and 20% line should be
  dropped. This is the one with legal weight.
- **Sign-in autofocus.** Focus the email field on the customer + catalogue-admin sign-in, matching the admin
  form. Small; there is a genuine (minor) a11y debate about autofocus, so it is your call.
- **Catalogue-admin password field.** Swap its plain `<input type="password">` for the shared `PasswordInput`
  (show/hide toggle, 44px target) used everywhere else. Consistency win.
- **Scene transition on move/delete.** In the 3D background editor, when you reorder or delete a scene, should a
  transition's fade/anchor follow the scene, or stay at its scroll position? Today it stays at the position
  (which is valid; this is a preference, not a bug).
- **"Journey" wording.** A couple of strings use "journey" as a metaphor ("Your journey with Greatstone"), which
  the house voice discourages. Rewording is a copy call.
- **StoreProduct gallery arrow keys.** Add left/right arrow-key navigation to the product image gallery (an AAA
  enhancement; keyboard access already works via Tab and the labelled buttons).
- **StoreBrowse mobile filters as a dialog.** On mobile the filters panel opens without moving focus into it. A
  safe fix needs full dialog semantics (role, focus trap, escape, close button), so it is a small feature rather
  than a one-line change.

## 4. Gated (blocked on you or a third party, flagged only)

- **Email deliverability / DNS:** SPF/DKIM/DMARC + a dedicated sender via Cloudflare, plus Resend domain
  verification. Blocks the order/licence/welcome email dispatch.
- **2FA** for staff/admin accounts.
- **Klondare to Greatstone auth rebrand** and the eventual move to the real `greatstonesoftware.co.uk` /
  `greatstoneint.com` domain (built to be a config change, not a migration).

## Status

Site is in strong shape. The loop is holding in a low-churn state: it checks for regressions each cycle rather
than manufacturing new work. Ready when you are for the deploy pass and the proposal decisions.
