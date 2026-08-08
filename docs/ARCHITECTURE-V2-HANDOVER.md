# Architecture v2.0: what was built, what is waiting on you

Written 8 August 2026. Start here. The three audit documents are linked below rather than repeated.

**Nothing is deployed.** To review it locally:

```bash
cd ~/Desktop/Code/greatstone-puck-proof && npm run build && cd dist && python3 -m http.server 5199
```

Then open `http://localhost:5199`. Load each page twice: some content only settles on the second
load, because the migration step does not run on the first.

## What you will see immediately

1. **The navigation is six items**, Ben's list: Home, How We Help, Executive Intelligence, About
   Greatstone, Begin the Conversation, plus the storefront's Products link. Services, Proof,
   Process, The Climb and Industries have left the header. They are still published, still in the
   footer, still reachable by URL.
2. **The homepage is Ben's eight chapters**, his approved copy verbatim.
3. **Contact, About and Executive Intelligence are rebuilt.** They were the last pages still written
   in the retired voice.
4. **The 3D stone no longer runs on the homepage.** Ben's opening statement requires that nothing
   competes with it, and the stone is the loudest thing on the page. One-line revert if you disagree.

## Built, section by section

| Ben's section | State | Commit |
|---|---|---|
| Homepage, all 8 chapters | Built. He marked this LOCKED | `01e3fba` |
| Primary navigation | Built | `8a67d47` |
| 2. How We Help | Built, new gateway page | `8a67d47` |
| 6. Executive Intelligence | Built, four centres | `02eff0c` |
| 7. About Greatstone | Built | `a0828b1` |
| 8. Begin the Conversation | Built | `b0b0308` |

Supporting work: a new `Panels` block his layout needed (`dd30d65`), an opening-statement Hero
variant (`be67f56`), contact routes on the closing section (`0d15d31`), a numbered motif for the
Principles (`4964f48`), and a mobile layout fix (`7db7f27`).

## Deliberately NOT built

**3. Organisational Transformation and 4. Professional Services.** His own document defers both:
"Detailed structure and foundation content will be developed in the next stage" and "the final
service architecture will be developed as part of the Professional Services implementation stage".
Waiting on his next document, not on us.

**5. Technology Solutions is not wired into the navigation.** His document says the experience
"should not begin as a conventional software catalogue", with commerce sitting inside it. Pointing
that nav label at the existing storefront would present the catalogue as the proposition, which is
the one thing that section may not be. The storefront keeps its honest "Products" entry until the
gateway page exists.

## What is waiting on you

Ordered by how much each unblocks.

| # | Decision | Blocks | Your time |
|---|---|---|---|
| 1 | **The Proof page's claims.** Nine unsubstantiated figures plus an attributed customer testimonial, live and reachable now. See [claims register](CLAIMS-REGISTER.md) | The highest claim-risk surface on the site | 10 min to decide, longer if substantiating |
| 2 | **The five legacy pages.** Unpublish, rewrite or leave. See [legacy pages audit](LEGACY-PAGES-AUDIT.md) | Also resolves most of the [block inventory](BLOCK-INVENTORY.md) | 15 min |
| 3 | **The contact email.** Three candidates in play | The Invite block and the enquiry form both ship with no address | 2 min |
| 4 | **A phone number.** None exists anywhere in the codebase | Ben's Telephone contact route stays hidden | 2 min |
| 5 | **Ben's replacement tagline.** "The Foundation of Digital Excellence" is the last retired string site-wide | Footer, invoice and five transactional emails | Ask Ben |
| 6 | **Real leadership photos and permissioned partner logos** | About renders initials badges and an empty partner wall meanwhile | Your call on timing |
| 7 | **The About milestone dates** (2005 / 2011 / 2016 / 2021), removed because the page itself admitted they were unconfirmed | The company timeline stays off About | 5 min |
| 8 | **The 3D stone on the homepage** (item C1 above) | Cosmetic, one line either way | 1 min |
| 9 | **Chapters 2 and 3** carry near-identical approved sentences one screen apart. Ben's copy, so his call | Nothing. Worth raising with him | Ask Ben |
| 10 | **The booking flow** still says "Pick a time now" and is named for the retired Diagnostic proposition | Cosmetic until the address and number are settled | 5 min |

Three of Ben's four Intelligence Centres have no content yet (Organisational Thinking, Technology
Intelligence, Executive Briefings). Their buttons point at the Executive Intelligence page, which is
where those centres are presented, so nothing is dead. Each needs its own hub when he supplies
material.

## How this was verified, and what that caught

Every seed change was checked on the production build served from a clean origin, loaded twice so
the migration step runs, with a screenshot.

Three defects passed the full test suite and a clean build, and were caught only by looking:

1. **A duplicate "Products" in the navigation.** The header already appends a hardcoded storefront
   link, so adding one to the nav config rendered it twice. Caught by screenshot.
2. **Two panels stranded in a four-column grid**, with 610px of dead space beside them, after
   hidden panels changed the count. Caught by measuring the grid.
3. **A mobile rule that could never apply.** Every Panels section rendered two cramped columns at
   375px because the single-column rule sat at lower CSS specificity than the rules above it. It
   would have lost at every viewport. Caught by measuring at 375px.

A fourth was caught in a string builder: `'${BRAND_SIGNOFF}'` in single quotes is a literal, not an
interpolation, and 579 tests passed while the plain-text emails would have printed the variable name
to customers.

The lesson worth keeping: on this codebase, a green test run and a clean build say nothing about
whether the page is right.

## Conformance check against Ben's acceptance criteria

He marked the homepage LOCKED, so it was checked line by line against his own criteria rather than
by my summary judgement. The objectively checkable ones all pass.

**Chapter 1, the strictest.** He requires the Opening Statement to appear "exactly as approved".
Compared character by character: all three lines and the supporting narrative match his text
exactly. All eight of his prohibitions hold: the statement mentions no consulting, no Artificial
Intelligence, no technology, no services, no products, and does not name Greatstone (his own
narrative names it one line later, which is his design).

"Dominates the first screen", measured at 1366x768, the tightest common laptop: the statement takes
54% of the first screen, nothing else appears in it, and the eye sequence falls in exactly his order,
Opening Statement then Supporting Narrative then Primary Call to Action, with the button 60px clear
of the fold.

**Counts.** Three strategic priorities in chapter 4, four Principles in chapter 5, four Intelligence
Centres in chapter 6, all as specified. Chapter 7's "trust communicated without exaggeration" holds
in the strongest sense: both logo walls render nothing at all publicly, because there is no verified
client or partner list to show.

### The four rebuilt pages, checked against architecture.txt

**How We Help (section 2).** All three strategic priorities present, and all three descriptions match
his text character for character. His architecture principle is the interesting one: the internal
category names "should not become the visitor's starting point". They are stored on the page as
approved button wording, but because none of the three has a destination yet, no button renders, so
a visitor sees the three organisational outcomes and none of the commercial categories. Conformant
in effect today. Worth re-checking the moment those destinations exist, because that is when the
principle starts to bite.

**Executive Intelligence (section 6).** Four centres, each with a distinct purpose, presented as
equal panels. The page leads with the thinking and carries no article feed, so his "premium
executive resource rather than a corporate blog or news feed" holds. The live AI briefing now sits on
its own page rather than occupying this one.

**About Greatstone (section 7).** All six of his topics are covered: purpose (the opening
statement), philosophy ("What We Believe"), institutional character, experience, leadership (three
real people and three clearly marked unfilled seats), and strategic relationships (the partner wall,
which correctly renders nothing at all rather than showing an invented list).

**Begin the Conversation (section 8).** The journey line is present verbatim. The sector question
reports `required=false`, so his "no qualification barriers" now holds at the DOM level, not just in
the copy. Two of the four routes render; Telephone and Email stay hidden until a number and an
address exist, which is decisions 3 and 4 above.

### One thing for Ben, found by this check

His approved copy uses the identical heading **"Invest in Technology That Matters"** four times
across three pages: twice on the homepage (the third strategic priority in chapter 4, and
Intelligence Centre Three in chapter 6), once on How We Help, and once on Executive Intelligence.

Every instance is verbatim his (architecture.txt line 47, homepage.txt lines 353 and 531), so none
was changed. But it labels two genuinely different things: a commercial priority that leads to
Technology Solutions, and an intelligence centre that publishes thinking about technology. A visitor
moving through the site meets the same heading over both, one screen apart on the homepage.

This was worth re-measuring rather than assuming: the first pass found two instances on one page,
and counting properly found four across three. His call, alongside the chapters 2 and 3 overlap
already on the list.

## Accessibility and responsive, measured

Run across all five rebuilt pages at 1440px and 375px. Everything below was measured in the browser
on the built site, not read off the stylesheet.

**Structure.** Exactly one h1 per page, no heading-level skips anywhere, no positive tabindex.

**The contact form.** Every field has a properly associated label. `required` and `aria-required`
agree exactly on every field, and only Work email is required, which is what Ben's "no qualification
barriers" asks for.

**Contrast against the void.** Body and muted copy 11.04:1, the faint section label 7.19:1, the
numbered motif 15.84:1, contact routes 11.04:1, panel buttons 17.18:1. AA needs 4.5:1.

**Mobile.** The header collapses correctly into its Pages dropdown under 760px. No page scrolls
sideways at 375px: two separate causes were found and fixed, the header's own intrinsic width and a
decorative pseudo-element in the Chapter block that extended 60px past each edge.

**Reduced motion.** The pane cannot emulate the media query, so rather than claim a check I could not
run, I enumerated every element that actually animates on each page and tested whether a rule inside
a `prefers-reduced-motion` block matches it. 53 animated elements across the five pages, all covered,
against 55 such rules. Of those rules 32 explicitly set transition or animation to none, and the rest
neutralise transforms, decoration or scroll-snap, which is the same intent.

**One thing that is a decision, not a defect.** Tap targets in the collapsed mobile nav and the
contact routes measure 26 to 36px tall. That PASSES WCAG 2.2 AA, which requires 24x24 (2.5.8), and
misses the 44x44 comfort figure often quoted. Worth a look on a real phone before deciding.

### The AI Market Intelligence hub

The hub moved to its own page during this rebuild and had never been checked. At 375px it is clean:
no horizontal overflow, one h1, no heading-level skips across a 12-level sequence, all six images
carry alt text, no unlabelled buttons among 50 interactive elements, body copy at 11.04:1.

Its tab widget is properly built: one tablist, five tabs, correct `aria-selected`, a roving tabindex
(0 on the selected tab, -1 on the rest), a panel with `aria-labelledby`, and 46px tap targets, which
clear even the 44px comfort figure.

`aria-controls` is absent from the tabs, and that is correct here rather than a gap. Only the active
panel is rendered, so four of the five tabs would point at element ids that do not exist, which is
worse for assistive technology than omitting the attribute.

**One thing I could not verify, stated as such.** The arrow-key behaviour between tabs is implemented
in source and looks right (`IntelHub.jsx` moves selection and then calls `.focus()` on the newly
selected tab). I could not confirm it end to end: the preview pane reports sending key presses but
delivers no keydown events to the page at all, which I proved with a capture-phase listener that
recorded zero events. A synthetic event gave a different result again, and synthetic events do not
faithfully model React plus requestAnimationFrame plus focus. So this needs one minute in a real
browser: focus the Overview tab, press the right arrow, and check that focus lands on Briefing.

## One safety change worth knowing about

Several blocks shipped fabricated claims as their **defaults**, publishable the moment anyone added
the block without typing anything: a complete attributed customer testimonial (`Quote`), three
invented client case studies with figures (`CaseStudy`), and a payback claim (`RoiBar`). All are now
empty with render guards, following the precedent already set for the logo wall.

This does not touch the Proof page's own stored content. That is decision 1 above.
