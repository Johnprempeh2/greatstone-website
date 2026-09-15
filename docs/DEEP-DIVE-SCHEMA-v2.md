# Deep Dive schema v2: offerings, and how certain we are

Status: **specification, not yet implemented.** Written 8 September 2026 from John's direction.
Owner of this change: the Portal. Owner of the content that fills it: the Deep Dive workstream.

`src/data/deepdive-schema.mjs` is the contract between the browser workspace and the deepdive MCP.
Both run the same code over the same plan, so a vocabulary change lands in one place and both
callers inherit it. This file specifies what v2 adds and why, so the two can be built against the
same definition rather than converged afterwards.

---

## 1. Why this changes

The current schema models **a business as a set of processes**. That was right for Indago's delivery
chain and it is wrong in general, and the gap showed up on Indago itself.

Indago sells at least three different things. Customer satisfaction research, run by telephone from a
client supplied list. Mystery shopping, which the assessment records as "forty one branches and **a
different operational shape**". And media research, which was attempted and stopped. The current
seven process pages describe **the first of those three**, and nothing in the record says the other
two run through the same chain. Because there was nowhere to put an offering, the plan silently
scoped itself to one of them.

The general rule this implies:

> **Every business sells one or more offerings, and runs processes to deliver them. Some processes
> are specific to an offering. Some are shared across all of them. A deep dive that walks processes
> without knowing which offering each one serves cannot say what it has covered.**

That is the reusable structure. **Offering, then process, then pillar.** The pillars already cut
across everything and do not change.

---

## 2. New kind: `offering`

Add `'offering'` to `KINDS`, `'OFFERINGS'` to `SECTIONS`, `offering: 'o'` to `ID_PREFIX`, and
`case 'offering': return [f.num || f.name, f.name]` to `identityParts`.

| Field | Type | Rule |
|---|---|---|
| `num` | string | Two digits, same convention as `process.num` |
| `name` | string | Required. What the client calls it |
| `what` | string | Required. What the buyer actually gets |
| `who` | string | Who buys it |
| `soldHow` | string | How it is won: tender, renewal, referral |
| `state` | enum | Required. See below |
| `processes` | string[] | The `process.num` values that deliver it |
| `weight` | string | Its share of the business, **only where established.** Never estimated |

`OFFERING_STATE_IDS = ['live', 'dormant', 'attempted', 'intended']`

- **live**: sold and delivered today.
- **dormant**: sold before, not currently.
- **attempted**: tried and stopped. Carries a finding about why, which is often the most useful
  thing in the set.
- **intended**: named as a plan, never sold.

An offering with no `processes` is a coverage gap and `deepdive_check` should report it, in the same
family as a pillar no session can answer for. It means we are selling something we have not walked.

## 3. `process` gains `offerings`

| Field | Type | Rule |
|---|---|---|
| `offerings` | string[] | The `offering.num` values this process serves. **Empty means it serves every offering**, which is how a supporting process is expressed |

That single field is what makes the layer navigable in both directions: open an offering and see its
chain, open a process and see what depends on it. It also separates the two bands honestly. Delivery
processes belong to specific offerings. Business development, marketing, people and billing are
shared, and an empty list says so without a second vocabulary.

## 4. `evidence` gains verification

Today evidence carries `state` (held / partial / missing / ours), which answers **do we have it**.
It does not answer **how far can we trust what we have**, and those are different questions. A
document we have read and a thing one person told us in a meeting are not the same evidence, and a
plan that renders them identically is not evidence-led.

| Field | Type | Rule |
|---|---|---|
| `verification` | enum | Required. Defaults to `unverified` |
| `verifiedBy` | string | Required unless `unverified`. **What actually established it.** Not a restatement of the claim |
| `pillars` | string[] | Which pillars it bears on, alongside the existing `processes` |

`VERIFICATION_IDS = ['seen', 'corroborated', 'single account', 'inferred', 'unverified']`

- **seen**: we have the artefact and have read it. The only tier that settles a question on its own.
- **corroborated**: two independent accounts agree, artefact not seen.
- **single account**: one person told us. True until contradicted, and not yet a fact.
- **inferred**: our own reading. **Nobody said it.** This tier exists to stop our own drafting being
  cited back to the client as their evidence, which happened once and is why it is enumerated.
- **unverified**: asserted, nothing behind it yet.

Enforce the same rule the schema already applies to `question`: a claim of establishment must say
what establishes it. `certainty !== 'unknown'` already requires a note; `verification !== 'unverified'`
requires `verifiedBy` for the same reason.

---

## 5. What the Portal should render from this

Not a specification of the interface, which is the Portal's to decide. These are the things the data
now supports that it did not:

1. **An evidence register that sorts by trust**, not just by whether we hold it. The column John
   asked for is `verification`, and `verifiedBy` is what expands underneath it.
2. **Navigation by offering.** Every business has offerings; this is the entry point a practitioner
   recognises before they recognise a process number.
3. **Coverage that can be stated.** With `process.offerings` populated, "we have walked two of three
   offerings" becomes computable rather than a claim.
4. **Expand in place.** Every item already carries far more than a row can show, which is why the
   92 page document exists. The row is the index; the expansion is the document.

## 6. Sequence

The schema change is small and lands first. Content follows through the MCP, which is what
`deepdive_add` exists for. Nothing here requires the Portal and the Deep Dive workstream to edit the
same file: one owns `src/`, the other owns the plan records under `.deepdive/`.
