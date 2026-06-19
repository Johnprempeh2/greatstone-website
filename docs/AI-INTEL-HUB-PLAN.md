# AI Intelligence Hub — plan

A client-facing AI-industry intelligence resource in the Insights section: a sourced, current read on
the AI landscape that stays fresh on its own, learns from what readers engage with, and feeds that
interest signal to the sales team. Modelled on the reference at greatstone-ai-intel.netlify.app.

Status: PLAN (for review before any build). Decisions taken: **hybrid content engine** (a daily job
drafts, a human publishes) and **plan-first**. Stack: React + Puck CMS on Netlify, Supabase backend,
the analytics + CRM rails from docs/ANALYTICS-CRM-PLAN.md (shipped dormant), and the existing
draft→publish model + nightly scheduled-task pattern.

---

## 1. What it is, and where it lives

An **"AI Intelligence" hub**: a tabbed dashboard giving clients a curated, sourced view of the AI
landscape, the way the reference does — daily briefings each with a "For Greatstone" take, composite
leaderboards (products / frontier models / tools & agents), a top-3 podium, vendor profiles, and a
transparent "how this is sourced" panel.

**Surface.** A full-screen experience, lazy-loaded, reached from the **Insights** page via a prominent
card ("Open the AI Intelligence Hub"), mirroring how the method **#breakdown** explorer opens. The
existing field-notes Insights page stays; the hub becomes its centrepiece. Route: `#intel`. (Whether it
also earns a top-level nav entry is John's call, given the recent nav trim; default is launch-from-Insights.)

Same dark Greatstone brand, the site chrome (header/footer), vendor marks via logo.dev (already used in
the catalogue), reusing existing tokens and components where possible.

## 2. Information architecture (tabs)

- **Overview** — the briefing-room front page: "updated <date> · updates today: N", top-system metric,
  breaking item, "trending now" (5), the Podium (top 3 with scores), and a board excerpt.
- **Briefing** — the dated news digest: each item = vendor logo + name + date, headline, 3–4 sentence
  summary, a **"For Greatstone"** analysis box, topic tags, and a "source →" link to the original.
- **Leaderboards** — three composite-scored boards (Products, Frontier Models, Tools & Agents). Rows
  expand to specs: latest features (date-tagged), connectors, pricing tiers. Each board shows its
  weighting (e.g. Model 28% · Features 26% · Connectors 28% · Ease 18%).
- **Compare** — pick 2–3 entries for a side-by-side of scores, pillars, features, pricing.
- **How this is sourced** — the methodology + the fixed source roster (newswires + company newsrooms),
  and the "rebuilt each day" statement. Credibility depends on this being visible.
- (**Radar** — trend/capability map; nice-to-have, Phase B+.)

## 3. Data model

One structured dataset the hub renders, following the catalogue's **draft → published** split so nothing
customer-facing goes live unreviewed.

```
intel = {
  meta: { updatedAt, updatesToday, topSystem: { name, score } },
  briefings: [ {
    id, vendor, vendorDomain,            // domain → logo.dev mark
    date, headline, summary,             // summary only, never the source's article text
    greatstoneTake,                      // our proprietary one-paragraph read
    topics: [ 'ai-security', 'agents' ], // from a fixed taxonomy (drives the interest signal)
    sourceName, sourceUrl, status        // every item is sourced + linked
  } ],
  boards: {
    products: [ { rank, name, company, domain, score, pillars: {…}, features: [{text,date}], connectors: [], pricing: [], blurb, profileId } ],
    models:   [ … same shape … ],
    tools:    [ … same shape … ],
  },
  weights: { products: {model:.28, features:.26, connectors:.28, ease:.18}, … },  // shown in "sourced"
  vendors: [ { id, name, domain, blurb } ],
  sources: [ { name, url, kind: 'newswire'|'newsroom' } ],
}
```

A **topic taxonomy** (foundation models, agents, AI security, coding, enterprise adoption, regulation,
funding, infra, multimodal, …) is the backbone of the interest signal in part 5, so it's fixed and
small, not free-text.

**Storage.** Prototype: a seed `src/data/ai-intel.json` rendered by the hub, with the daily job
regenerating a draft. Production: a Supabase table with a draft + published projection (mirrors
`products`/`publishedProducts`), so the engine writes the draft server-side and an admin publishes.
Recommend starting on the seed JSON, moving to Supabase when the engine lands (part 4).

## 4. "Updates well" — the hybrid content engine

A **daily scheduled job** drafts; **a human publishes**. Nothing customer-facing goes live unchecked.

- **The job** (a durable scheduled task, same pattern as the nightly review): once a day it pulls the
  source roster (see Sourcing below), curates ~6–10 briefings, recomputes leaderboard scores against a
  documented methodology, drafts each "For Greatstone" take, and writes the result as the **draft**
  intel dataset (never straight to published).
- **Review + publish** in the studio: an admin opens the Intel draft, sees what changed vs published
  (new stories, score deltas, the draft takes), edits anything, and publishes. The published projection
  is what clients see. This is the exact draft→publish gate the pages + catalogue already use.
- **Methodology** is fixed and shown in "how this is sourced": the weighting per board, the source
  roster, the "rebuilt daily" cadence, and that the takes are Greatstone's view.

### Sourcing — three layers, three sources (decided)
A **news API + RSS** for the facts, the LLM only for the analysis, **benchmarks** for the rankings. A
news API beats raw web-search for the news layer: structured (headline, source, date, link),
deduplicated, reliable, properly attributable, and it moves the *facts* off the model (the LLM never
invents a headline or date). It does NOT replace the LLM or the leaderboards — it's the news layer only.

1. **Briefing / news feed → news API + RSS.** A news API for the newswires; RSS for the company
   newsrooms (OpenAI / Anthropic / Google blogs — free, first-party). This is the factual backbone; the
   reference's "11 newswires + 12 company newsrooms" maps onto exactly this split.
2. **"For Greatstone" take + summaries → the LLM**, confined to opinion + synthesis over the sourced
   items, never fact generation. The low-risk, on-brand use of a model.
3. **Leaderboards / scores → published benchmarks** (Artificial Analysis, LMArena/Chatbot Arena,
   vendor-stated specs) + Greatstone's weighting methodology, refreshed less often, human-reviewed. No
   news API or LLM provides these.

The daily job: fetch (news API + RSS) → filter to the AI roster + dedupe → LLM drafts summary + take per
item → assemble the draft → human publishes. The API key is a server-side Supabase secret, never in the
browser. **John's calls:** the news-API choice + paid tier (NewsAPI.org / GNews / NewsData.io / Bing News
/ Mediastack; check the commercial ToS re snippet length + storage), and the benchmark set for scoring.
Display is summaries + links only (copyright), which the paid tiers generally require anyway.

### Guardrails (non-negotiable, since it's customer-facing intel)
- **Accuracy is human-gated.** The job only ever writes a draft; a person publishes. No auto-publish.
- **Copyright.** Summaries + links only, never the source's article text. Every item carries its source
  name + link, like the reference.
- **Sourcing transparency.** The roster + methodology are always visible; each score is explainable.
- **Dated + honest.** "Updated <date>" banner; if the job hasn't run, the page says so rather than
  implying false freshness.
- **No secrets / no PII** in the dataset; the job runs server-side-style with no customer data.

## 5. "Learn from interest → inform sales"

This rides the analytics + CRM rails already built (docs/ANALYTICS-CRM-PLAN.md), switching on with the
GTM id + Pipedrive token.

- **Instrument engagement** as events: `intel_open`, `intel_tab` (which tab), `briefing_open`
  (topic + vendor), `leaderboard_view` (board), `profile_open` (vendor), `compare_use` (entries
  compared), plus dwell. Topics come from the fixed taxonomy, so engagement rolls up cleanly.
- **Build an interest profile** per visitor: weight topics + vendors by what they open and dwell on,
  kept with the first-touch attribution already captured locally.
- **Feed sales.** On a known lead (signed in, or converted via a form/quote), roll their interest profile
  into the Pipedrive person as a field: "interests: AI security, model comparison; most-viewed vendor:
  Anthropic; last read: <headline>". So a salesperson opens the record and knows exactly what the
  account is researching and how to open the conversation. This is the "who's who and how to engage"
  Ben + John asked for, made concrete.
- **On-site (optional, later):** a global "Trending" rail (what everyone's reading) and a light "For you"
  ordering driven by the visitor's local engagement, so the hub itself gets more useful the more it's used.

## 6. Phasing

- **Phase A — the hub + seed dataset.** Build the full-screen experience (tabs, podium, briefings,
  leaderboards with expandable rows, compare, sourcing panel) rendering a realistic seeded
  `ai-intel.json`, opened from an Insights card. Studio-editable. *Ships the resource, on-brand, today.*
- **Phase B — the hybrid engine.** The daily drafting job + the studio review/publish gate + move the
  dataset to Supabase (draft/published). *Makes it "update well" without going live unreviewed.*
- **Phase C — engagement → sales signal.** The intel events on the analytics rails, the per-visitor
  interest profile, and the Pipedrive roll-up. Optional on-site trending / for-you. *Makes it "learn"
  and feed sales.* Depends on the analytics/CRM go-live (GTM + Pipedrive).

Phase A is the bulk of the visible work and stands alone. B needs web-search access for the job + a
sign-off on the methodology/roster. C rides the analytics/CRM credentials.

## 7. What you provide / decide
- Confirm the **surface** (launch-from-Insights, or also a top-level nav entry).
- Sign off the **source roster** + the **scoring methodology** (the weightings per board) — these are
  editorial/credibility calls, and they're shown publicly.
- Pick the **news API** + paid tier for the briefing layer (see Sourcing in part 4), and the **benchmark
  set** for the leaderboards.
- Whether this **client-facing hub replaces or complements** the standalone greatstone-ai-intel site
  (do they share one engine/dataset, or stay separate?).
- For Phase C: the GTM id + Pipedrive token (already on the analytics list).

## 8. Key risks + trade-offs
- **Credibility** is the whole game: wrong facts or stale scores in a client-facing intel product cost
  trust. Mitigated by the hybrid human-publish gate + visible sourcing + explainable scores.
- **Copyright:** summaries + links only; never republish article text.
- **Scope:** this is a mini-product, not a block. Phase it; Phase A delivers a real, on-brand resource
  before the engine + sales-signal work.
- **Maintenance:** the daily job needs light monitoring (did it run, are sources still valid). The
  nightly-task pattern + the "updated <date>" honesty banner cover this.
- **Duplication:** decide the relationship to the existing standalone site so we don't maintain two
  divergent datasets.
