# Greatstone Studio: handover and how to extend it

This explains how the studio folds into the dev team's Laravel build, how editing stays
admin-only, and the process for adding new elements later (with or without Claude). It is
written for the developers and for John.

## What the studio is, and what Laravel owns

The studio is the front end and the editor: the block library, the Puck visual editor, and the
bespoke three.js backgrounds. It deliberately does **not** own auth, the content database, or
publishing. Those belong on the server.

The split at integration:

- **This repo provides** the React block components, the Puck config, the 3D modules and the
  shared `site.css`. These drop into the existing Laravel 12 + Inertia + React app as the front
  end. Nothing here is a separate stack; it is the same React the dev team already runs under
  Inertia.
- **Laravel provides** authentication, role-based access (Spatie), and the page-content API. A
  page is JSON in the shape the studio already uses (`data`, `published`, `status`, `seo`,
  `versions`). The current localStorage store is a stand-in for that API and mirrors its shape,
  so swapping it is a data-source change, not a rewrite.
- **The public site** is rendered from the published JSON (Inertia/SSR) and ships **no editor
  code at all**. There is nothing on a public page for a visitor to switch on.

## Two kinds of change (the mental model)

Keeping these separate is what makes the handover safe.

1. **Content** is copy, images, stats and page composition. This is done by marketing in the
   studio UI, on the live canvas. No code, no deploy, no developer, no Claude. It is gated
   behind sign-in and saved through the Laravel API.
2. **Capability** is new block types, new 3D, new fields, design changes. This is code. It goes
   through the repo, gets reviewed, and ships through CI. This is where Claude helps.

Marketing never touches code. Capability changes never bypass review. The studio enforces this:
editors can configure the fields a block exposes, but they cannot restyle it or invent new ones.
"Edit, don't restyle" is built into the schema, not left to trust.

## Adding a new element (a new block)

Every block is one self-contained file that exports three things. The contract is documented at
the top of `src/blocks/Hero.jsx`. To add, say, a testimonial block:

1. **Create `src/blocks/Testimonial.jsx`** following the contract:
   - a React component that renders the editable text props **directly as children** (so the
     editor can make them inline-editable),
   - a `css` export (the block's own scoped styles, using the brand tokens),
   - a `puck` export: the editor fields, sensible defaults, any permissions, and `render`.
   Use choice fields (radio/select) for anything that must stay on-brand, so an editor picks
   from approved options rather than typing free values.
2. **Register it** in `src/puck.config.jsx`: add it to `MODULES` and to a category.
3. **Test** on staging (see below).
4. **Open a pull request.** A developer reviews and merges. CI deploys.

That is the whole process. The block then appears in the editor's Add-block drawer, fully
editable, brand-locked, with its 3D and motion code-owned. This is exactly the kind of task
Claude does in one pass: "add a testimonial block with a quote, name and role" becomes the new
file plus the one-line registration, ready for review.

## Security

Editing must be admin-only, and the only enforcement that counts is server-side.

- **Real model (Laravel).** The editor route sits behind Laravel auth + Spatie RBAC; only a
  user with an editor/admin role can load it. Every save and publish is authorised on the
  server, per request, with CSRF and an audit trail. The public site ships no editor code, so
  there is nothing to bypass. Tie sign-in to Greatstone accounts (SSO) so access follows the
  same joiners-and-leavers process as everything else.
- **Prototype gate (this repo, today).** A separate entry at `/#admin` shows a sign-in screen;
  editing only appears once signed in, and the public URL is read-only. This is a UX model, not
  security: a client-side check can be bypassed in dev tools, and the demo password is in the
  bundle. It exists so the experience behaves correctly before the Laravel layer is wired in.
  The current localStorage "publish" is browser-local anyway, so nothing a visitor does is
  shared or saved for others.
- **Claude's boundary.** Claude changes code through pull requests. It never touches production,
  the content database, auth, or secrets. Human review sits between any Claude change and a
  merge. Content stays with marketing in the gated UI.

## The repository, staging, and using Claude going forward

Yes, put this in a Git repository the team can clone, branch and test against. This repo is
already initialised and ready to push (private is the right default).

Recommended setup:

- **One repo** for the studio (this code). The dev team vendors it into the Laravel app, or
  consumes the block library as a package. Either way the source of truth for blocks and the
  editor is here.
- **A staging deploy** (the current Netlify preview is exactly this) that mirrors the studio so
  changes are seen and tested before they reach Laravel production. Every pull request can get
  its own preview URL.
- **CI** runs the build and basic checks on every pull request; merges to `main` deploy to
  staging; promotion to production is the dev team's call.

How Claude fits without weakening any of this:

- Claude works in a branch in this repo (via Claude Code locally, or the cloud) and opens pull
  requests. A developer reviews and merges. Nothing reaches production without that review.
- The natural division holds: Claude and the devs handle **capability** (new blocks, 3D, design)
  as reviewed code; marketing handles **content** in the gated studio. John can keep using
  Claude to extend the site, and the dev team keeps control of what ships.

The one-line summary: content is a UI action behind sign-in; capability is a reviewed pull
request. Claude lives on the capability side, always behind human review, never touching auth or
the live data.
