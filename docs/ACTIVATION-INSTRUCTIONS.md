# Per-product-range activation instructions — deploy handoff

Ben's 1 Jul requirement: author activation steps **once per product range** (Aspose, GroupDocs, et al.), not
per product, so they travel automatically into the customer's account and the licence email. Built
deploy-ready; the code is committed but it needs the migration applied to go live (and one edge-function
change to reach the email). Nothing here is deployed.

## What it does

- **Admin (Catalogue → Activation tab):** a textarea per product range (vendor). Staff write the steps once;
  Save persists to `vendors.activation_instructions`.
- **Customer account (`#account` → Licence keys):** each licence shows a **"How to activate"** disclosure with
  its range's steps, matched to the licence by its product name.
- **Licence email:** the steps are injected into the licence-ready email once `notify-licence-issued` is
  redeployed (see below).

## To deploy (in order)

1. **Apply the migration** `supabase/migrations/0025_vendor_activation.sql` (with the rest): adds the single
   `vendors.activation_instructions TEXT` column. Idempotent, no secrets, no new RLS (staff write via the
   existing `vendors` `staff_all`; the buyer reads via the existing `public_read` on published vendors).
2. **Deploy the frontend** (the committed CatalogueAdmin/VendorActivation/LicenceKeys changes). Build already
   passed here (571 tests, clean build).
3. **Author the steps** in Catalogue → Activation for each range you sell.
4. **(Optional) put the steps in the email** — a small `notify-licence-issued` change: load the licence's
   vendor `activation_instructions` and append it to the email body. This needs an edge-function deploy; until
   then the steps still show on the account. (The email builder `src/lib/licence-email.mjs` + its edge-fn
   mirror would take an `activationSteps` string per item.)

## How a licence is matched to a range

`LicenceKeys.activationFor` matches a licence's `offering_name` to a vendor when the vendor name (or its first
token) appears in the product name, case-insensitively (e.g. "Aspose.Total for .NET" → **Aspose**; "IronPDF" →
**Iron** Software; "ActivePDF DocConverter" → **ActivePDF**). This avoids a schema change on `licence_keys`.

**Known limitation:** name-matching is heuristic. A range whose products don't carry the vendor name (or a very
short/ambiguous first token, e.g. **I.R.I.S.**) may not match, and would then show no activation block. If a
range needs reliable matching, the clean follow-up is a `licence_keys.vendor_id` column set when the key is
issued (a KeyEditor dropdown), read directly instead of matched by name. Flagged for John, not built here.

## Notes / decisions for you

- **Visibility:** `activation_instructions` rides the existing `vendors` `public_read`, so it's readable by any
  visitor of a *published* vendor (it's setup help, not secret). If you'd rather gate it to signed-in
  customers, that needs a column-scoped view or a dedicated policy — say the word.
- **Rendering is safe:** the account renders the steps as escaped JSX text with `white-space: pre-wrap` (no
  HTML), so authored content can't inject markup.
