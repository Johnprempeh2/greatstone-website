# Greatstone Studio

The Greatstone marketing site and its in-app visual editor, in one React app. The public
pages render from saved content; signed-in editors compose those pages on a live canvas using
a fixed library of brand-locked blocks, with the real three.js backgrounds behind them.

This is the front end and CMS. It is built to drop into the dev team's Laravel 12 + Inertia +
React build: the blocks and editor are the shared front end, Laravel owns auth, the content
store and publishing. See [HANDOVER.md](HANDOVER.md) for how it folds in, how editing stays
admin-only, and how to add new elements (with or without Claude).

## Run it locally

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # production build to dist/ (base path /puck-proof/)
```

## What's here

| Path | What it is |
| --- | --- |
| `src/blocks/*.jsx` | The block library. One self-contained file per block: component + `css` + Puck fragment. |
| `src/puck.config.jsx` | Registers the blocks (`MODULES`) and groups them in the editor drawer (`categories`). |
| `src/Stage.jsx` | The 3D backdrop. Renders a *scene track*: ordered scenes that cross-fade at editable scroll points. |
| `src/stage-presets.js` | three.js-free scene registry, presets, `scrollContext` + `resolveTransitionAt` (shared by Stage + editor). |
| `src/lib/*.mjs` | The bespoke three.js scene modules (the real ones from the live site). |
| `src/cms/StudioPanel.jsx` | The tabbed studio shell: Pages, 3D Background, SEO, History in one panel. |
| `src/cms/BackgroundPanel.jsx` | The 3D background editor: scene track, per-transition scroll point / fade, and section-pinning. |
| `src/cms/*` | Other editor surfaces: pages, command palette, SEO, version history, media field, prototype sign-in. |
| `src/store.js` | Page store + page/asset CRUD. localStorage today; the same shape Laravel will serve. |
| `src/site.css` | The real shared stylesheet, copied from the live site (tokens, type, footer). |

## Before a pull request

Run `npm run design:detect` and post its summary on the task and in the PR, one line per finding
(fixed or justified). This is required for every website PR. See
[docs/design-detector.md](docs/design-detector.md).

## Guarded Netlify uploads

### Optional portal OneDrive mirror

Portal PDFs always land in private Netlify Blobs first. The optional server-side Microsoft Graph
mirror reads and writes the default drive of a Microsoft 365 user (`user`) or SharePoint site
(`site`). If Graph fails, downloads use the Blob copy. The staff portal shows “OneDrive not
connected yet” while the mirror is disabled. No customer sign-in or portal RLS rule changes.

Configure these **Netlify server environment settings**, never Vite variables or browser code:
`PORTAL_ONEDRIVE_ENABLED=true`, `PORTAL_ONEDRIVE_TENANT_ID` (tenant GUID),
`PORTAL_ONEDRIVE_ACCOUNT_TYPE` (`user` or `site`), `PORTAL_ONEDRIVE_ACCOUNT_ID` (user ID/UPN or
SharePoint site ID), `PORTAL_ONEDRIVE_FOLDER_ID` (folder item ID),
`PORTAL_ONEDRIVE_CLIENT_ID` (application GUID), and `PORTAL_ONEDRIVE_CLIENT_SECRET` (server secret).
Leave `ENABLED` unset until John approves Microsoft consent and the account and folder from
GRE-1788 are known. The app registration needs Graph application permission to write the
selected drive, with tenant admin consent. The folder must already exist; the connector does
not create or discover it. OneDrive file names are deterministic encodings of the private
Blob keys, so existing portal paths and database rows need no migration. The connector only
uses the default drive for the selected user or site; choose a site ID whose default library
contains the portal folder.

Graph API operations follow Microsoft’s [upload](https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0),
[download](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0),
and [client credentials](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow) contracts.

`greatstone-home` and `gre1795-website-db-staging` use local Netlify uploads. They are not
Git-linked. Agents must use this repo's guarded commands for these two sites, from a clean
checkout with `NETLIFY_AUTH_TOKEN`, the Netlify CLI, and task-scoped `GSAM_*` credentials:

```bash
npm run deploy:preview -- greatstone-home 123
npm run deploy:prod -- greatstone-home
```

The preview command requires an open, non-draft PR at the checkout's HEAD. It uploads a
draft only if the PR has the `preview` label or Mikey or John comments exactly
`Preview ready for PR #123` on the current task. The production command requires `main`
(or, in a task worktree, a detached HEAD at exactly the remote `main` commit:
`git fetch origin main && git checkout --detach origin/main`) and a person to comment `Approve production deploy: greatstone-home <40-character HEAD SHA>`
on the current task. It is never automatic or scheduled. Replace the site and PR number as
needed. The command refuses other Netlify sites.

For `gre1795-website-db-staging` only, an accepted GS Agentic Manager human-only
`request_confirmation` on the current task also authorises the upload. Its recorded approval
must name that site and the approved SHA. If a reviewed guard repair changes HEAD after approval,
the approved commit must be an ancestor and every intervening change must be confined to
`scripts/deploy-site.mjs`, `scripts/deploy-site.test.mjs`, and `README.md`. Any site code or
migration change requires a new approval. The public site still requires the exact comment
for the current HEAD.

Netlify applies a changed environment variable only on a new upload, and the change check
below skips a commit that is already live. After a staging config change, reload the live
commit with `node scripts/deploy-site.mjs refresh gre1795-website-db-staging`. It runs only
for that site, from a clean checkout at exactly the remote `main` commit, and only when the
live production upload's commit is on `main` and has an accepted human-only staging card on
the current task for exactly that commit (guard-only drift does not count). It exports that
commit's tree to a temporary folder, runs `npm ci` there, and uploads it with the same title,
so newer code on `main` never rides along. There is no refresh for `greatstone-home`.

Each successful upload records its source commit in the Netlify deploy title. The next
run compares HEAD with the last ready upload of the same type. Changes confined to
`docs/`, `.github/`, the three root guide files, or test files skip the upload. If no
recorded upload exists, preview compares with the PR base; production uploads rather
than guessing. A newer local run for the same site and mode (and, for previews, the same PR) stops an
older upload in progress. Previews of different PRs never stop each other. Locks live in
the repo's shared git folder, so they cover every worktree of the checkout, not only one
agent run. Preview and production use separate locks, so a preview cannot stop an
approved production upload. The guard checks the old process start and command before
sending a stop signal, so an abandoned lock cannot stop a different process that later
gets the same PID. Preview baselines are scoped to the same PR number; the first preview
for a PR compares against that PR's base commit. Locks cover runs on the same machine;
coordinate separate publishing machines on the task. No Netlify Git build or ignore
command runs for these local-only sites.

## Task worktrees

GSAM gives each website task its own git worktree (GRE-2248), so parallel tasks never
switch each other's branch. `scripts/provision-worktree.sh` prepares each one: it
hardlinks `node_modules` from the primary checkout, runs `npm install` only when the
branch's lockfile differs, and warns (`GSAM-DISK-ALERT`) when all task worktrees together
pass the size budget (`GSAM_WEBSITE_WORKTREE_BUDGET_GB`, default 15). GSAM removes a
worktree when its task is done or cancelled and nothing in it would be lost.

For a read-only Netlify connection check, run `node scripts/deploy-site.mjs inspect <site>`.
It reports whether the site lookup works and the latest ready upload made by this guard.

Preview uploads do not publish to the main domain and cost 0 Netlify credits under the
current plan. Count production uploads separately at 15 credits each when reporting
savings. The guard is a repo convention: direct Netlify CLI/API uploads outside it are
not technically blocked.

## Editing

Visit `/#admin` to sign in. Editing only appears once signed in; the public site is read-only.
The sign-in here is a **prototype gate**, not real security. Real deployments enforce editing
rights on the server (see HANDOVER.md → Security).

## Adding a block

The short version (full version in HANDOVER.md): copy an existing file in `src/blocks/`, follow
the contract at the top of `Hero.jsx`, then register it in `src/puck.config.jsx` in **two** places:

1. Import it and add it to the `MODULES` object.
2. Add its name to a group in `categories`.

Both steps are required — a block that's in `MODULES` but not in any `categories` group compiles
and renders but **never appears** in the Add-block drawer. Once registered it's fully editable and
brand-locked. If it renders a user-supplied link, route it through `src/lib/safe-url.js`.
