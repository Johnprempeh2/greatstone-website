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
| After the card is accepted | Keystone | Run the guarded production deploy from a detached checkout at the tag (see "Deploy prerequisites"). Flint checks live. |

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

## Which checks apply to which site

| Site | What it is | What the train deploys | Checks |
| --- | --- | --- | --- |
| `gre1795-website-db-staging` | The Vite site (`netlify.toml`, `npm run build`) | `npm run deploy:prod -- gre1795-website-db-staging` | Checklist items 1 to 6. No editor checks: it is a single-page app, so `/editor/<slug>` serves the homepage, not the editor (GRE-2793). |
| `greatstone-home` (public site) | The Vite site, same build | `npm run deploy:prod -- greatstone-home`, only with a `weekly-release` card for the exact SHA | Checklist items 1 to 6. |
| `gsam-editor` alias on `greatstone-home` | The Next editor (`next-proof/netlify.editor.toml`) | Nothing. `deploy:prod` does not build or upload it. | `/editor/<slug>` and the hello-ack `siteContract`. These apply only here. |

The editor alias is deployed separately with `scripts/deploy-editor-alias.mjs` (steps in
`next-proof/README.md`). A `deploy:prod` run does not change it, so an editor check after the train
tests the old alias, not the candidate. It reports `engine.commit` `000…0` because it is not built from
a tagged train commit. To check an editor change, deploy the alias from the tag first, then check
`https://gsam-editor--greatstone-home.netlify.app/editor/<slug>`.

**Today the train does not deploy the editor alias.** Leave editor checks off the release note unless
the alias was deployed from the tag. Whether the train should also deploy the alias is Everest's
decision (GRE-2800); until Everest decides, an editor change ships through its own alias deploy.

## Deploy prerequisites

`scripts/deploy-site.mjs` runs `netlify deploy`, and the Netlify CLI then runs the build from
`netlify.toml`. Before `npm run deploy:prod`:

1. **Clean detached checkout at the tag** in `$GSAM_RUN_SCRATCH_DIR` (a throwaway clone, then
   `git checkout --detach web-rc-YYYY-MM-DD`). The guard needs git and `origin`, so an archive is not
   enough. Never add a worktree under `.gsam/worktrees/`. Remove the clone when done.
2. **`npm ci`** in that checkout. The build needs `node_modules`; without it the deploy fails.
3. **Netlify CLI on `PATH`.** It is not installed on this machine. Do not install it globally. Install it
   in the scratch dir for this run only:

   ```sh
   npm install --prefix "$GSAM_RUN_SCRATCH_DIR/netlify-cli" --no-audit --no-fund netlify-cli
   export PATH="$GSAM_RUN_SCRATCH_DIR/netlify-cli/node_modules/.bin:$PATH"
   netlify --version
   ```

4. **`NETLIFY_AUTH_TOKEN`** from `POST /api/agents/me/secrets/netlify-pat/value` (lowercase key).
5. **`GSAM_TASK_ID`** set to the weekly release issue, which holds the accepted card.

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
