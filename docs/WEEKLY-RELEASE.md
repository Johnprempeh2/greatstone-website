# Weekly website release train

Agreed by John on 25 Oct 2026 (GRE-2641). Merged website work goes live once a week, on one
card. Keystone runs the train; Flint checks it. Urgent fixes can still go out alone.

## The week

| When | Who | What |
| --- | --- | --- |
| Until Monday 06:00 | Lintel, Ridge, others | Merge to `main` through Keystone's ready check. Anything merged later rides next week. |
| Monday 06:00 | Keystone | Cut the candidate: tag `web-rc-YYYY-MM-DD` on `origin/main`, open the weekly release issue, write the note. Nothing merged since last week means no train. |
| Monday | Flint | Run the checklist below on the preview of that exact commit. Hand the issue back with the evidence. |
| Monday by 16:00 | Keystone | Post the one card on the release issue. John or Ben approves. |
| After the card is accepted | Keystone | Run the guarded production deploy from a detached checkout at the tag. Flint checks live. |

A new commit after the tag means a new check. Do not move the tag.

## Checklist (every item needs evidence on the release issue)

1. **Preview link.** The staging or draft URL of the tagged commit, and the commit SHA it shows.
2. **Link check (GRE-2511).** Every internal link and button on the changed pages returns a real page.
   No dead `#anchors`, no old `#go/` links.
3. **Screenshots with real content** at 1440 and 390 wide for every changed page. Not placeholder data.
4. **Contract versions (GRE-2633).** The website and GSAM contract versions in the candidate, and that
   they match what GSAM live expects.
5. **Rollback.** The current live Netlify deploy id for each site. Rollback is
   `POST https://api.netlify.com/api/v1/sites/<site>.netlify.app/deploys/<deploy id>/restore`.
   A database migration does not roll back that way. List each one with its `rollback.sql`.
6. **Big changes first.** Migrations, functions, auth, secrets, dependencies or build config
   (the protected paths in `scripts/deploy-site.mjs`). Say what changes, what could break, and how to undo it.

An item without evidence comes off the note, or the train waits.

## The card

One `request_confirmation` on the weekly release issue, `human_only`, so John or Ben can accept it.

- `idempotencyKey`: `confirmation:GRE-<release issue>:weekly-release:<40-character SHA>`
- `detailsMarkdown` holds one line per site that ships, for example
  `Approve production deploy: greatstone-home <SHA>` and
  `Approve production deploy: gre1795-website-db-staging <SHA>`, then the change list, the checklist
  evidence and the rollback.

`scripts/deploy-site.mjs` accepts this card for the public site only for the exact SHA. For the staging
site it behaves like a staging card. Staging cards (`staging-deploy`) still never authorise the public site.

## Urgent fixes

A fix for something broken in live does not wait for Monday. Run the same checklist on that one change
and post its own card with the same key shape. Say on the card why it cannot wait.
