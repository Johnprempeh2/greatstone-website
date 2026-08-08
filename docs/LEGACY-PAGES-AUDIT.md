# Legacy pages after Ben's v2.0 restructure

Written 8 August 2026, during the Architecture v2.0 build. For John. Nothing here has been
actioned: every option below is his call.

## The situation

Ben's Architecture v2.0 sets the primary navigation at six items: Home, How We Help, Executive
Intelligence, Technology Solutions, About Greatstone, Begin the Conversation. Five pages that used
to be in the header are not on that list:

| Page | Slug | In header | Published | In footer | URL-reachable |
|---|---|---|---|---|---|
| Process | `method` | no | yes | yes | yes |
| The Climb | `climb` | no | yes | yes | yes |
| Services | `services` | no | yes | yes | yes |
| Industries | `industries` | no | yes | yes | yes |
| Proof | `proof` | no | yes | yes | yes |

They are still published, still listed in the footer (which builds from `state.order` via
`publicNavOrder`, not the header config), and still reachable by URL, search and any existing
inbound link.

All five are still written in the retired voice. Every one carries "Book a Diagnostic"; four carry
"eight pillars"; Services and Industries and Proof carry "quietly losing"; The Climb carries the
pebble/plateau/peak model.

That matters because Ben's brief is explicit that the site must not "attempt to introduce a
different corporate identity". A visitor who arrives on any of these five meets the previous one.

## Page by page

### Process (`method`) — 5 blocks
Hero, FeatureGrid, PillarCards, MaturityModel, Invite.

**Carries real work:** the eight-pillar model, and it is the return target for the full-screen
pillar explorer at `#breakdown` (`App.jsx:1373` navigates back to `method` on close).

**If unpublished:** the `#breakdown` explorer loses its return page and falls back to the home page.
The explorer itself keeps working.

### The Climb (`climb`) — 5 blocks
Hero, MaturityMap, Ladder, MethodTieIn, Invite.

**Carries real work:** the maturity model (pebble / plateau / peak) as an interactive map and ladder.

**If unpublished:** nothing in the app routes to it. No code references the slug at all.

### Services (`services`) — 9 blocks
Hero, ServiceCards, ServiceCatalog, Spectrum, StatStrip, TimeSavingsCalculator, ComparisonMatrix,
Faq, Invite.

**Carries the most real work of the five.** The 78-service productised catalogue, the time-savings
calculator, the comparison matrix, and it is the landing page for the whole service-detail route:
`exitService()` at `App.jsx:620` returns here, and the inquiry drawer mounts on this page
(`App.jsx:1595`). The nine service-demo archetypes built earlier this year hang off the service
detail pages that live under it.

**If unpublished:** service detail pages lose their parent and their back-navigation target. This is
the one page where unpublishing has a real functional cost.

**Note:** Ben defers the service architecture to "the Professional Services implementation stage",
so this page's eventual replacement is already scheduled in his plan. It is not orphaned
permanently, it is waiting.

### Industries (`industries`) — 4 blocks
Hero, IndustryPicker, Steps, Invite.

**Carries real work:** the interactive industry picker.

**If unpublished:** nothing routes to it.

### Proof (`proof`) — 6 blocks
Hero, StatStrip, CaseStudy, RoiBar, Quote, Invite.

**This one needs a decision on its own merits, separately from the navigation question.**

It publishes specific performance claims:

- "12 hrs given back per knowledge worker, every week"
- "3.4× first-year ROI on the average engagement"
- "6 wks to first measurable value"
- a 29% payback bar
- three named-by-sector case studies ("National real-estate group", "Multi-site logistics operator")
- an attributed testimonial: "They didn't hand us a deck and leave. They moved in, found the hours
  we were losing, and gave them back." attributed to "Operations Director, national real-estate
  group"

This was already filed as a High defect in `docs/OVERNIGHT-REVIEW.md` ("Proof page 100% anonymised,
no verifiable substantiation"), and `docs/EXCELLENCE-LOOP.md` records that the hours figure differs
across pages (home 21+, proof 12, case study 9) and describes the metrics as illustrative and
needing substantiation.

A page titled Proof, carrying an attributed customer quote and precise ROI figures, is the highest
claim-risk surface on the site. It is currently published and reachable. Whatever happens with the
navigation, these figures need either substantiation or removal.

## The options

**1. Leave as legacy.** Zero work, zero risk of breaking routes. The cost is that five pages
contradicting the new identity stay live, and Proof keeps publishing unsubstantiated claims.

**2. Unpublish some or all.** They vanish from the footer automatically (the public footer filters
on published status) and stop being reachable. Reversible in the studio. Costs: Services breaks
service-detail back-navigation, Process breaks the explorer's return target. Climb, Industries and
Proof have no code dependencies and could be unpublished with no functional consequence at all.

**3. Rewrite.** The right long-term answer, but Ben's own document defers the content for
Organisational Transformation and Professional Services to a later stage, so rewriting Services now
means inventing the structure he is about to specify.

## A suggestion, not a decision

The cleanest split treats the two problems separately, because they are separate.

Proof is a claims problem, not a navigation problem. It would be worth unpublishing on its own
merits until the figures and that testimonial can be substantiated, regardless of what happens to
the others.

The other four are a sequencing problem. Leaving them published until Ben's next document arrives
costs little, because the header no longer sends anyone to them and the replacement content is
already scheduled in his plan.

Both of those are John's calls. Nothing has been changed.
