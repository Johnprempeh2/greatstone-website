# PO-document upload at checkout — deploy handoff

Ben's 1 Jul requirement: "Pay by purchase order" should let a buyer **upload** their PO, not only type a PO
number. Built deploy-ready; the code is committed but needs the migration applied to go live, and it only
actually stores the file once `request-quote` is redeployed. Nothing here is deployed.

## What it does

- **Checkout (Pay by purchase order):** an optional "Attach your PO" file input (PDF or document, up to 10 MB).
  On submit, the browser base64-encodes the file and sends it with the quote request.
- **Server (`request-quote`, service role):** after creating the quote, it decodes the file and uploads it to
  a **private** `po-documents` bucket at `‹quote_id›/‹filename›`, and records the path on the quote. Best-effort:
  a failed or oversized upload never fails the quote (the PO number + the email fallback still stand).
- **Staff (Catalogue → Quotes → open a quote):** a **PO document ↓** button downloads the file via a
  short-lived signed URL.

## Why this design (security)

Checkout is reachable by guests, so an anon/customer Storage **write** policy would be an open upload endpoint
(anyone could fill the bucket). Instead there is **no buyer-facing write policy at all** — the only writer is
the `request-quote` edge function, which runs with the **service role** and so bypasses RLS. The buyer's file
rides inside the quote request (which already hits that function). Staff read via a signed URL under a
staff-only SELECT policy. The path uses the **server-generated** `quote_id`, so a buyer can't target another
quote's folder.

## To deploy (in order — migration FIRST)

1. **Apply the migration** `supabase/migrations/0026_po_documents.sql` (with the rest). It adds
   `quotes.po_document_path` / `po_document_name`, the private `po-documents` bucket (10 MB), and the staff-read
   Storage policy. **Apply this before the frontend** — QuotesManager selects the new columns, so a frontend
   ahead of the migration would show the Quotes tab's "Couldn't load" state until the column exists.
2. **Deploy `request-quote`** (`supabase functions deploy request-quote`). Until then, older builds ignore the
   `poDocument` field, so the file is silently dropped and the online-PO + email fallback carry the flow — no
   error, it just isn't stored yet.
3. **Deploy the frontend** (the committed StoreCart / cart.mjs / QuotesManager changes).

## Notes

- **Size:** capped at 10 MB in three places — the client guard, the bucket `file_size_limit`, and the edge-fn
  byte check. A PO is a few hundred KB, so this is headroom.
- **Buyer can't re-read the file:** there's no customer Storage read policy (they have their own copy). The
  `po_document_path` string is visible on their own quote row but is useless without read access.
- Folds cleanly into the same deploy pass as the licence-file (`0024`) and activation (`0025`) features — three
  migrations, one `request-quote` + `notify-licence-issued` function deploy, and the frontend.

## Security review (workflow `po-upload-review`, 2 Jul)

Two adversarial lenses (RLS/abuse + correctness). The design held up; the actionable items are fixed:

- **Bug caught during the review pass:** the upload block read `body.poDocument`, but the request body is
  destructured inline (`await req.json()`), so `body` was undefined. The `ReferenceError` was swallowed by the
  best-effort try/catch, meaning the file would have **silently never uploaded**. Fixed by destructuring
  `poDocument` and referencing it directly. (Dead-on-arrival without this; now the path actually runs.)
- **Base64 pre-filter (low):** the pre-`atob` length guard was loose (`14_000_000`). Tightened to `13_981_016`
  (the max base64 length of a 10 MB file); the decoded-byte check remains the authoritative limit.
- **Silent-failure observability (medium):** the swallowed catch left no trail if a buyer meant to attach a PO
  but the upload errored (e.g. pre-migration). Now `console.error`s on both the upload-error branch and the
  catch, so it shows in the function logs. Behaviour is unchanged (still best-effort).
- **`po_document_path` visible to the buyer (low, accepted):** the `quotes` `customer_self` SELECT policy lets a
  buyer read their own row including `po_document_path`/`po_document_name`. The **file** stays unreadable to them
  (the Storage read policy is staff-only), so the path string is metadata with no access value. Intentional.
- **Deploy-order (medium, documented):** if the frontend/edge fn are ahead of the migration, QuotesManager's
  select errors into its "Couldn't load" state and uploads no-op. The migration-first order above prevents the
  window; enforce it.
