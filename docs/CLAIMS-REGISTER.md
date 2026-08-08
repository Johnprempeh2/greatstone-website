# Claims register

Written 8 August 2026, after Ben's Architecture v2.0 rebuild. For John.

Every numeric or outcome claim the site can currently show a visitor, where it lives, and what
substantiates it. Nothing here has been changed. No figure has been adjusted or reconciled: making
one unverified number agree with another unverified number would still be fabrication.

## The good news first

**The rebuilt pages carry no numeric claims at all.** Home, How We Help, About, Executive
Intelligence and Begin the Conversation are clean. Ben's approved copy is qualitative throughout,
so the rebuild removed the homepage's hours claim as a side effect rather than by design.

That matters because `docs/EXCELLENCE-LOOP.md` previously recorded a contradiction across three
pages: home said 21+ hrs per engagement, Proof said 12 hrs per person, the case study said 9 hrs
per agent. **The home figure is gone, so that particular three-way contradiction no longer reaches
a visitor.** Two of the three remain, on the same page as each other.

## Live claims, by page

### Proof (`proof`), highest risk

Still published and reachable. Every claim below renders.

| Claim | Block | Substantiation |
|---|---|---|
| 12 hrs given back per knowledge worker, every week | StatStrip | none on record |
| 3.4× first-year ROI on the average engagement | StatStrip | none on record |
| 6 wks to first measurable value, not theoretical | StatStrip | none on record |
| 90% adoption of what we build, ninety days in | StatStrip | none on record |
| 9 hrs saved per agent each week, "National real-estate group" | CaseStudy | none on record |
| 31%, "Regional healthcare provider" | CaseStudy | none on record |
| 3.4× return inside the first year, "Multi-site logistics operator" | CaseStudy | none on record |
| 29% payback bar, "3.5 months", "Paid back before the quarter's out" | RoiBar | none on record |
| "They didn't hand us a deck and leave. They moved in, found the hours we were losing, and gave them back." attributed to "Operations Director, national real-estate group" | Quote | none on record |

Two of these disagree with each other on the same page: the StatStrip says 12 hrs per knowledge
worker per week, the case study beneath it says 9 hrs per agent per week. Different denominators,
so not strictly contradictory, but a reader scanning the page sees two different hours figures.

`docs/OVERNIGHT-REVIEW.md` already filed this page as a High defect: "Proof page 100% anonymised,
no verifiable substantiation". `docs/EXCELLENCE-LOOP.md` describes the metrics as illustrative and
records that substantiating them is John's call because they assert a methodology that cannot be
verified from inside the codebase.

The attributed quote is the single highest-risk item on the site. A named role at a described
organisation reads as a real customer statement.

### Services (`services`)

| Claim | Block | Substantiation |
|---|---|---|
| 40% More efficiency | StatStrip | none on record |
| 2× More value to customers | StatStrip | none on record |
| 60% Less risk | StatStrip | none on record |

These are unattributed and carry no denominator at all, which makes them weaker than Proof's but
also harder to defend if questioned: they state an outcome with no scope.

The time-savings calculator on the same page ships defaults of 12 people, 5 hours, £30/hour, 46
working weeks. Those are **inputs a visitor edits**, not claims the site makes, so they are not a
substantiation problem. They are only a plausibility question: a reader who leaves them untouched
sees whatever total they produce.

### Site-wide meta

`src/App.jsx` carries a hardcoded fallback meta description: "A transformation partner, not a
software house. Twenty years modernising how organisations work, embedding alongside your team with
AI as the accelerator."

This is the retired positioning ("transformation partner, not a software house", "embedding
alongside your team") and it is what search engines and link previews see when no page-level
description applies. It survived the rebuild because it lives in code, not in the seed. The
twenty-year claim itself is established across the codebase and is not the concern; the retired
framing around it is.

## Inert, so not a decision you need to make

These carry retired claims but cannot reach a visitor:

- **`SEO_UPDATES` in `src/store.js` (~line 657).** Retired titles and descriptions for home,
  method, contact, services, industries, proof, about, insights and climb, including "Book a Deep
  Dive", "eight pillars" and "You still cannot buy time". The migration only fires when a stored
  value still matches an old key, and no current seed value does. Verified after each SEO change
  this pass. Dead weight, not a live claim.
- **The former Executive Intelligence blocks.** A sample-article grid and an unwired newsletter
  form. They were never rendered (the page had a render special-case) and have now been removed.

## What is actually decided here

Nothing is a code problem. Every live claim is either true and needs a source recorded, or it is not
true and needs removing. Both are outside what I can determine from the codebase.

The narrowest useful framing:

1. **The Proof quote and case studies.** If they came from real engagements, they need a note on
   record saying so, and ideally the client's agreement to the anonymised form. If they were written
   to demonstrate the layout, they should not be published.
2. **The four Proof StatStrip figures and the payback bar.** Same question, plus the internal
   disagreement between 12 hrs and 9 hrs.
3. **The three Services percentages.** Weakest of the set because they have no scope at all.
4. **The App.jsx fallback description.** The only one that is purely a rewrite, no verification
   needed, and it is the retired positioning appearing in search results today.

Item 4 is the one I could action on your word alone. The other three need you to tell me which
figures are real.
