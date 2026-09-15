# A Content-Security-Policy for the site: tested, not yet applied

Status: **proposal, awaiting John.** Nothing in this document has been committed to `public/_headers`
and nothing has been deployed.

## Why

`public/_headers` already ships a careful set: `nosniff`, `X-Frame-Options: SAMEORIGIN`,
`Referrer-Policy`, `Permissions-Policy` and HSTS. There is no `Content-Security-Policy`, which is the
one that matters most here, because this site does two things that make a sanitiser the only line of
defence:

- it renders stored HTML through `dangerouslySetInnerHTML` in two places (`OrgDashboard`,
  `ClientsManager`), both behind `sanitizeHtml`;
- it accepts rich text from people and stores it.

A stored-XSS has already been closed once in this repo by tightening `sanitizeInline`. A CSP is the
layer that contains the next one if a sanitiser is ever wrong.

## The candidate policy

Derived from what the built bundle actually references, not from a template:

```
default-src 'self';
script-src 'self' https://assets.calendly.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: blob: https:;
connect-src 'self' https://<project>.supabase.co wss://<project>.supabase.co https://api.unsplash.com;
frame-src 'self' https://calendly.com https://assets.calendly.com;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'self'
```

`style-src` keeps `'unsafe-inline'` because component styles are set as attributes; removing it needs
nonces, which a static `_headers` file cannot mint. Everything else is closed.

## What was measured

The real `dist/` was served with that policy applied as a response header, and the app exercised at
`/`, `#shop`, `#account`, `#go/contact` and `#deepdive`.

**Exactly one violation, on every route:**

```
Executing inline event handler violates the following Content Security Policy directive
'script-src 'self' https://assets.calendly.com'
```

It comes from one line, `index.html:20`:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:..."
      media="print" onload="this.media='all'" />
```

That is the standard non-blocking web-font trick: load the stylesheet as `print` so it does not block
rendering, then flip it to `all` once it has arrived. The flip is an inline event handler, and a CSP
without `'unsafe-inline'` blocks it.

### The consequence, measured rather than assumed

With the policy on, the link stays at `media="print"` forever:

- `document.fonts` reports **Montserrat not loaded**
- a heading computes to `Montserrat, -apple-system, "system-ui", …` and therefore renders in
  **system-ui**

So the whole site would quietly render in the wrong typeface. Nothing would look broken, no request
would fail, and the only trace is a console message most visitors never open. This is the shape of
failure worth naming before shipping a policy, not after.

Everything else passed: Supabase over HTTPS and WebSocket, the stylesheet, the images, the SPA
itself. The site needs no other change to run under this policy.

## The one change it needs first

Move the media flip out of the HTML attribute and into the bundled entry (`src/main.jsx`), which is
`'self'` and therefore allowed:

```js
// the font stylesheet loads as `print` so it never blocks the first paint; this promotes it once
// the bundle runs. Doing it here rather than in an onload attribute keeps the HTML free of inline
// handlers, which is what lets a CSP drop 'unsafe-inline' from script-src.
for (const l of document.querySelectorAll('link[media="print"][data-font]')) l.media = 'all';
```

with `data-font` added to that link and the `onload` attribute removed.

Trade-off worth knowing: today the flip happens when the stylesheet finishes loading; afterwards it
happens when the bundle executes. With `&display=swap` already on the request the visible behaviour
is the same class of thing (text paints immediately in the fallback, swaps when Montserrat arrives),
but it is a change to the first-paint path on a live marketing site, which is why it is written down
here rather than made.

## Suggested order

1. Make the font change, confirm Montserrat still loads with no CSP applied.
2. Ship the policy as `Content-Security-Policy-Report-Only` on one deploy and watch for anything the
   five routes above did not reach (the studio's editing surfaces especially).
3. Promote it to `Content-Security-Policy`.

Steps 2 and 3 are deploys, so both are John's call.

## Correction: `frame-src` is wrong in both directions

Found 14 September, after the policy above was written. It is not a refinement, it is a defect in
the proposal, and it would have shipped silently.

**The measurement could not have caught it.** The policy was derived from what the built bundle
references and exercised at five routes including `#deepdive`. The portal has exactly one iframe,
the demo frame on a build's "What we can show" section, and it renders ONLY when that build carries
a demo link. Nothing in the exercised record did, so the frame never appeared, no violation was
reported, and the run looked clean. A route is not a state.

**What it would break.** A demo link points at wherever the prototype is deployed, which for us is a
`netlify.app` address. `frame-src 'self' https://calendly.com https://assets.calendly.com` blocks
every one of them, so applying this policy would empty the demo frame for real demos, which is the
whole point of that section.

**And what it would still permit is the dangerous case.** `'self'` in `frame-src` allows the portal
to frame its own origin. That frame carries `allow-scripts allow-same-origin`, a pair that is only a
sandbox while the framed document is a stranger: same-origin, it hands the framed page this origin's
storage and session. The code now refuses to frame a same-origin demo at all (see the origin check
in `BuildPage.jsx` and `deepdive-demoframe.test.mjs`). So the policy as written permits precisely
what the code refuses, and forbids what the code allows.

**Suggested instead**, to be settled with John rather than applied:

```
frame-src https://calendly.com https://assets.calendly.com https://*.netlify.app;
```

`'self'` dropped on purpose. Whether the demo hosts should be a wildcard or a named list is a real
decision: a wildcard admits any Netlify site, and a named list needs editing whenever a prototype
moves, which is the kind of maintenance that gets skipped and then quietly breaks the feature.

Before promoting the policy, exercise a build record that actually holds an external demo link, or
this same gap simply recurs under `Report-Only` with nothing to report.
