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

### One thing for Ben, found by this check

His approved copy uses the identical heading **"Invest in Technology That Matters"** twice on the
same page: once as the third strategic priority in chapter 4, and again as Intelligence Centre Three
in chapter 6. Both are verbatim his (architecture.txt line 47, homepage.txt lines 353 and 531), so
neither was changed. But a visitor scrolling the homepage meets the same heading over two different
propositions, which reads as a repeat rather than a distinction. His call, alongside the chapters 2
and 3 overlap already on the list.

## One safety change worth knowing about

Several blocks shipped fabricated claims as their **defaults**, publishable the moment anyone added
the block without typing anything: a complete attributed customer testimonial (`Quote`), three
invented client case studies with figures (`CaseStudy`), and a payback claim (`RoiBar`). All are now
empty with render guards, following the precedent already set for the logo wall.

This does not touch the Proof page's own stored content. That is decision 1 above.
