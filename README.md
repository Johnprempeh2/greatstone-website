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

`greatstone-home` and `gre1795-website-db-staging` use local Netlify uploads. They are not
Git-linked. Agents must use this repo's guarded commands for these two sites, from a clean
checkout with `NETLIFY_AUTH_TOKEN`, the Netlify CLI, and task-scoped `GSAM_*` credentials:

```bash
npm run deploy:preview -- greatstone-home 123
npm run deploy:prod -- greatstone-home
```

The preview command requires an open, non-draft PR at the checkout's HEAD. It uploads a
draft only if the PR has the `preview` label or Mikey or a person comments exactly
`Preview ready for PR #123` on the current task. The production command requires `main`
and a person to comment `Approve production deploy: greatstone-home <40-character HEAD SHA>`
on the current task. It is never automatic or scheduled. Replace the site and PR number as
needed. The command refuses other Netlify sites.

Each successful upload records its source commit in the Netlify deploy title. The next
run compares HEAD with the last ready upload of the same type. Changes confined to
`docs/`, `.github/`, the three root guide files, or test files skip the upload. If no
recorded upload exists, preview compares with the PR base; production uploads rather
than guessing. A newer local run for the same site stops an older upload in progress.
This lock covers runs on the same machine; coordinate separate publishing machines on
the task. No Netlify Git build or ignore command runs for these local-only sites.

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
