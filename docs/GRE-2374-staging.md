# Deep Dive client view: staging setup

The site stores GSAM's whole Deep Dive snapshot in Netlify Database. A signed-in customer can read it only after a staff-controlled link maps that customer's site account to the GSAM tenant. The new route is `#portal/deep-dive`; the old portal routes stay available.

## Before any real client data

Record a fresh GRE-1699 backup check on GRE-2374 and take a manual Netlify Database snapshot before a link, import or cut-over. The 25 Oct check is on GRE-2374. Local tests used synthetic records only. Keep the live site unchanged until John's release card.

## Configure staging

1. Apply migration `050_deep_dive_client` on a staging database. It creates no customer link or snapshot row. Check its RLS and rollback with `node --test netlify/tests/deep-dive-client.test.mjs netlify/tests/auth-bridge.test.mjs`.
2. Put GSAM's staging **write public key** in the site's `GSAM_BRIDGE_KEYS` list. GSAM holds its private key. The Deep Dive PUT uses `gs-bridge-v1` as GRE-2439 specifies; commerce writes continue to use `gs-bridge-v2`.
3. Set `GSAM_DEEP_DIVE_BASE_URL` to the staging GSAM HTTPS origin. Set `GSAM_DEEP_DIVE_SITE_KEY` to JSON with `kid` and a PKCS#8 Ed25519 `privateKey`. The private key remains server-side. A person with GSAM Website Publish rights registers the matching public key and key id for the staging site.
4. After the backup gate and the matching account have been verified, create one tenant link for that customer through the staging database owner. The SQL shape is `INSERT INTO deep_dive_tenant_links (tenant_id, customer_id, org_id) VALUES ($tenant, $customer, $org)`. Resolve all 3 IDs from their source records. Do not infer that a GSAM tenant id equals a website customer id.
5. Push synthetic Shared and Internal fixtures through GSAM's preview and sync. The Internal item must be absent from the stored snapshot. Sign in as two different test customers: the linked one sees the Shared data; the other sees no snapshot. Answer one test request and confirm GSAM reports it received.

The sync payload contains deliverable metadata only, as in GRE-2439. A response is saved on the site before the callback. If GSAM is unavailable, the client sees a saved, pending response and can retry the same answer id.

## Rollback

Disable the Deep Dive link and GSAM sync first. Restore the database snapshot if a data import or mapping was wrong. For code rollback, remove the new route and function and run `050_deep_dive_client/rollback.sql` only after pending answers have been reconciled and exported. The rollback deletes the Deep Dive cache, links and pending answers; it does not affect the old portal tables or screens. The local Postgres test applies the rollback and checks that the snapshot table is gone.
