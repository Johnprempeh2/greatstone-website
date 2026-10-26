# Client activity outbox (GRE-2635)

The website appends each client event in the same database transaction as its source action. The client `organisationId` is `customers.id`, rather than the internal tenant `org_id`.

GSAM signs `GET /api/admin/v1/activity-events?cursor=<decimal>&limit=100` with its existing read key. The response is `{ "items": [...], "nextCursor": "<decimal>" }`, sorted by the global site sequence. A fresh reader sends `cursor=0`; an empty page returns that cursor unchanged. A nonempty page returns its last sequence. Sequence holes after rollback are valid.

The [activity schema](website-activity.ts) is the website copy of GSAM's `packages/shared/src/website-activity.ts`. GSAM owns the shared schema; change it there first and review the website copy together with any contract change. The schema lives outside `contracts/` because that folder is a pinned, immutable vendor copy.

Events contain IDs and action labels only. Never include interview answers, document contents, enquiry messages, names, emails, amounts or other personal details. GSAM commits each page and cursor together and retries an interrupted page.
