# Block inventory after Ben's v2.0 rebuild

Written 8 August 2026. For John. Computed from the seed, not from memory.

## The headline

The block library splits almost exactly along the legacy boundary. Of 44 blocks:

- **11 are used by the rebuilt site.**
- **18 are used ONLY by the five legacy pages** awaiting the unpublish/rewrite/leave decision.
- **15 are on no page at all.** They remain available in the editor.

That matters for sequencing. Most of the retired-voice blocks are not a separate problem to solve:
they are downstream of the legacy-pages decision in `docs/LEGACY-PAGES-AUDIT.md`. Decide that, and
most of this resolves itself.

## Used by the rebuilt site (11)

`Hero`, `Chapter`, `Panels`, `Prose`, `Invite`, `LogoWall`, `Team`, `BookDeepDive`, `IntelBand`,
plus `Hero` and `Invite` which are shared with the legacy pages.

These are the working set. Their defaults have been brought into the institutional voice where they
were retired (`Invite`, `BookDeepDive`), and their claim-bearing defaults emptied where they existed
(`LogoWall`, `Quote`).

## Used ONLY by the five legacy pages (18)

| Block | Page | Note |
|---|---|---|
| `PillarCards`, `FeatureGrid`, `MaturityModel` | method | the eight-pillar model |
| `MaturityMap`, `Ladder`, `MethodTieIn` | climb | the pebble/plateau/peak model |
| `ServiceCards`, `ServiceCatalog`, `Spectrum`, `ComparisonMatrix`, `TimeSavingsCalculator`, `Faq` | services | the 78-service catalogue and its supporting sections |
| `IndustryPicker`, `Steps` | industries | |
| `CaseStudy`, `RoiBar`, `Quote`, `StatStrip` | proof (StatStrip also services) | the claim-bearing set |

None of these appears anywhere in the rebuilt site. If the legacy pages go, these blocks go quiet
with them. If the pages stay, the blocks are load-bearing and must not be touched.

**This is why I have not rewritten their defaults.** Blocks like `TimeCounter`, `Pillars` and
`Terrace` do not merely carry retired copy: they ARE the retired proposition. `TimeCounter`'s whole
premise is "you still can't buy time". `Pillars` and `MethodTieIn` exist to explain the eight-pillar
model. Rewording their defaults would dress up a model Ben's architecture no longer uses, which is
worse than leaving them plainly what they are.

## On no page at all (15)

`AiBaselineSurvey`, `AiCostCalculator`, `Columns`, `ContactBand`, `FeaturedArticle`, `Figure`,
`InsightsGrid`, `NewsletterBand`, `PillarExplorer`, `Pillars`, `ProductDetail`, `Storefront`,
`Terrace`, `TimeCounter`, `Timeline`, `Values`.

Four of these became unused during this rebuild: `ContactBand` and `TimeCounter` when the contact
page was rebuilt, `FeaturedArticle` and `InsightsGrid` when Executive Intelligence was.

**One correction to avoid a wrong conclusion:** "on no page" does not mean dead code.
`MethodExplorer` looked unused by the same measure but is rendered by the `#breakdown` route in
`App.jsx`, so it is live. `Storefront` and `ProductDetail` are Puck blocks for embedding commerce on
a page, separate from the store routes under `src/store/`, which are very much in use. Nothing here
should be deleted on the strength of this table alone.

## What I would suggest

**Do nothing about blocks yet.** The block question is genuinely downstream of two decisions that
are already on your desk:

1. The legacy pages. If Proof, Climb and Industries are unpublished (they have zero code
   dependencies), eight blocks go quiet immediately. If Services and Process follow later, ten more
   do.
2. Ben's Professional Services document. It will specify what replaces the services architecture,
   which determines whether `ServiceCatalog` and its neighbours are rebuilt or retired.

The one thing worth doing regardless is what has already been done: making sure no block can
**publish a claim on its own**. That work is complete for every claim-bearing default found
(`Quote`, `CaseStudy`, `RoiBar`, `LogoWall`, `StatStrip.clients`). A block sitting unused with
retired copy in its default is untidy. A block that publishes a fabricated testimonial the moment
someone adds it was a real risk, and that is closed.
