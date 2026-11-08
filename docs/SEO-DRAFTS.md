# Page SEO drafts for GSAM release (8 Nov 2026)

Staging serves GSAM's content release, where every page's SEO title is its bare page name ("Two Doors", "About") and no page has a meta description. These drafts are for the **SEO fields of each page in the GSAM Website module** (site `b546812d-8d25-49dc-94c2-e04a5b31bde4`), so that John's next Publish carries them.

**Not saved in GSAM.** The sweep agent had no GSAM sign-in (the API answered 401), so nothing was written there and nothing was published. To apply: paste into each page's SEO panel, or `PATCH /api/companies/:companyId/website/sites/:siteId/pages/:pageId` with `{ "seo": { "title": "...", "description": "..." } }`. That saves a draft field only; it goes live with the next Publish.

Where the live site already had approved wording, it is kept. Titles end " · Greatstone International" and stay near 60 characters; descriptions stay under 160 where they can.

| GSAM path | SEO title | Meta description |
|---|---|---|
| `/` | Greatstone International · Two ways to work with us | Transformation and the tools to deliver it. Explore DX Consultancy and DX Dev Tools from Greatstone International. |
| `/consultancy` (held, GRE-3712) | DX Consultancy · Greatstone International | Explore the four steps of DX Consultancy, then use our free AI tools. |
| `/consultancy/how-we-help` | How We Help · Greatstone International | Every organisation has the potential to become stronger. We help you transform with confidence, build capability and invest in technology that matters. |
| `/consultancy/how-we-work` | How We Work · Greatstone International | Executive Discovery, an initial assessment, a Deep Dive and a build where it fits. How Greatstone moves an organisation from one AI task to a working whole. |
| `/consultancy/services` | Services Catalogue · Greatstone International | A digital office for the work that comes round every week: people and AI agents in clear roles, set up by Greatstone, with your people approving what matters. |
| `/consultancy/industries` | Industries · Greatstone International | Start with your industry. The same eight-pillar foundation, shaped to the way your sector actually works and the numbers it is measured on. |
| `/consultancy/the-climb` | The Climb · Maturity Model · Greatstone International | Pebble, plateau or peak. We meet you where you are, read where you stand, and find the shortest honest route up. |
| `/consultancy/digital-office` (unpublished) | Transformation Services · Greatstone International | Take one step on its own, or plan it as part of the full transformation. |
| `/proof` | Case Studies · Greatstone International | How Greatstone runs its own operations as a digital office of people and agents, and how we measure results with each client. |
| `/dev-tools` | DX Dev Tools · Greatstone International | Tools for teams who deliver. Developer components and SDKs, licensed and supported through Greatstone International. |
| `/about` | About Greatstone · Greatstone International | Greatstone exists to help organisations become stronger. Our purpose, our philosophy and the people who do the work. |
| `/insights` | Executive Intelligence · Greatstone International | The quality of an organisation's decisions will never exceed the quality of its thinking. Our perspective on leadership, technology and transformation. |
| `/contact` | Begin the Conversation · Greatstone International | The journey to a stronger organisation begins with a conversation. Book a call, send an enquiry, telephone or email Greatstone International. |
| `/privacy` | Privacy Policy · Greatstone International | How Greatstone uses the personal data you give us through greatstoneint.com, and the choices you have. |
| `/cookies` | Cookie Policy · Greatstone International | The cookies and browser storage greatstoneint.com uses, and how to change your choice. |
| `/terms` | Website Terms of Use · Greatstone International | The terms for using greatstoneint.com. |

`/shop` and `/ai-market-intelligence` are code pages; their titles and descriptions are set in the repo (PR #260).
