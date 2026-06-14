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
| `src/puck.config.jsx` | Registers the blocks and groups them in the editor drawer. |
| `src/Stage.jsx` | The 3D backdrop. Cross-fades up to two scenes (stone, summit) across the scroll. |
| `src/lib/*.mjs` | The bespoke three.js modules (the real ones from the live site). |
| `src/cms/*` | Editor surfaces: command palette, SEO panel, version history, the prototype sign-in gate. |
| `src/store.js` | Page store. localStorage today; the same shape Laravel will serve. |
| `src/site.css` | The real shared stylesheet, copied from the live site (tokens, type, footer). |

## Editing

Visit `/#admin` to sign in. Editing only appears once signed in; the public site is read-only.
The sign-in here is a **prototype gate**, not real security. Real deployments enforce editing
rights on the server (see HANDOVER.md → Security).

## Adding a block

The short version (full version in HANDOVER.md): copy an existing file in `src/blocks/`, follow
the contract at the top of `Hero.jsx`, then register it in `src/puck.config.jsx`. It then
appears in the editor's Add-block drawer, fully editable and brand-locked.
