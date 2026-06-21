// AI Intelligence Hub — curated content (agent-refreshed each loop pass from the source roster).
// Generated from the research workflow; em dashes stripped + near-duplicates removed. Composite scores
// are the analysts' holistic ranking; the pillar breakdown shows the emphasis behind it.
export const META = {
  "edition": "The AI Intelligence Briefing",
  "updatedAt": "2026-06-21",
  "updatesToday": 8,
  "topLine": "EU AI Act: Commission's GPAI enforcement powers, including fines, take effect on 2 August 2026",
  "cadence": "Rebuilt from source each working day by Greatstone analysts.",
  "note": "Summaries and our analysis only, never republished articles. Every item links to its source."
};

export const BRIEFINGS = [
  {
    "id": "european-commission-eu-ai-act-commission-s-gpai-enforcement-",
    "vendor": "European Commission",
    "vendorDomain": "europa.eu",
    "date": "2026-06-21",
    "headline": "EU AI Act: Commission's GPAI enforcement powers, including fines, take effect on 2 August 2026",
    "summary": "From 2 August 2026 the European Commission gains its full supervision and enforcement powers over providers of general-purpose AI (GPAI) models, one year after the underlying obligations began. The Commission can request documentation, conduct model evaluations, demand compliance and risk-mitigation measures or market restrictions, and impose fines of up to 3% of worldwide annual turnover or EUR 15 million, whichever is higher (Article 101). GPAI models placed on the market before 2 August 2025 must reach full compliance by 2 August 2027.",
    "take": "The obligations have technically been live for a year, but 2 August is when they grow teeth, and the fine ceiling is calculated on global turnover, not on AI revenue. Most mid-market organisations are not GPAI providers, so the direct exposure is limited, but the indirect exposure runs through your supply chain: if a foundation-model vendor you build on faces a market restriction or recall, the disruption flows downstream to you. The question to explore is whether your AI contracts and architecture assume the model you rely on will always be available in its current form, because EU enforcement is one more reason that assumption may not hold.",
    "topics": [
      "regulation",
      "frontier-models",
      "enterprise"
    ],
    "sourceName": "EU Artificial Intelligence Act (artificialintelligenceact.eu)",
    "sourceUrl": "https://artificialintelligenceact.eu/enforcement-of-chapter-v-under-the-eu-ai-act/",
    "importance": "high"
  },
  {
    "id": "openai-openai-adds-usage-analytics-and-spend-co",
    "vendor": "OpenAI",
    "vendorDomain": "openai.com",
    "date": "2026-06-18",
    "headline": "OpenAI adds usage analytics and spend controls to ChatGPT Enterprise",
    "summary": "OpenAI rolled out enhanced admin tooling for ChatGPT Enterprise: the Global Admin Console now consolidates ChatGPT and Codex credit usage with a granular breakdown by user, product and model, and admins can set a default spend limit for the whole workspace, configure team-level limits, or create individual overrides for power users. The update follows the global enterprise rollout of ChatGPT for Excel and Google Sheets earlier in the month.",
    "take": "The shift from seat-based to credit-and-usage billing is quietly the bigger story here; these controls exist because consumption has become unpredictable enough to need governing. For a mid-market organisation, the question to explore is whether your AI budget is still a fixed line item or has become a variable one you cannot yet forecast, and whether you have the admin visibility to catch a runaway agent or a power user before the invoice does. Worth modelling cost per active user before you scale a pilot to the whole organisation.",
    "topics": [
      "enterprise",
      "agents"
    ],
    "sourceName": "StartupHub.ai",
    "sourceUrl": "https://www.startuphub.ai/ai-news/artificial-intelligence/2026/openai-boosts-chatgpt-enterprise-controls",
    "importance": "medium"
  },
  {
    "id": "scale-ai-swe-bench-pro-hardens-as-the-frontier-co",
    "vendor": "Scale AI",
    "vendorDomain": "scale.com",
    "date": "2026-06-18",
    "headline": "SWE-bench Pro hardens as the frontier coding benchmark after contamination and saturation retire the original SWE-bench",
    "summary": "As frontier models clustered near 80% on SWE-bench Verified, OpenAI deprecated the original SWE-bench in February 2026 over contamination, and Scale AI's contamination-resistant SWE-bench Pro, 1,865 tasks across 41 private repositories, has become the reference. On the public standardized leaderboard, GPT-5.4 (xHigh) leads at 59.1%, with Muse Spark (Meta) at 55.0% and Claude Opus 4.6 (thinking) at 51.9%; vendor-reported runs place Opus 4.8 higher at around 69%.",
    "take": "The gap between the standardized public number (about 59%) and vendor-reported figures (near 69%) is the story that matters: harness, effort level and cost caps move the result by ten points or more, so a single headline percentage tells you very little. For a mid-market organisation the takeaway is to distrust any vendor coding claim that does not state the harness and conditions. The question to explore is whether your own model selection rests on a reproducible, contamination-resistant evaluation against your codebase, or on marketing numbers run under undisclosed settings.",
    "topics": [
      "coding",
      "frontier-models",
      "enterprise"
    ],
    "sourceName": "Scale AI (SWE-bench Pro)",
    "sourceUrl": "https://labs.scale.com/leaderboard/swe_bench_pro_public",
    "importance": "medium"
  },
  {
    "id": "artificial-analysis-artificial-analysis-confirms-glm-5-2-as-",
    "vendor": "Artificial Analysis",
    "vendorDomain": "artificialanalysis.ai",
    "date": "2026-06-17",
    "headline": "Artificial Analysis confirms GLM-5.2 as the new open-weights Intelligence Index leader, level with GPT-5.5 on real-world agentic tasks",
    "summary": "In its own analysis, Artificial Analysis put GLM-5.2 at 51 on Intelligence Index v4.1, ahead of MiniMax-M3 and DeepSeek V4 Pro (both 44). On its GDPval-AA v2 agentic measure GLM-5.2 scored 1524, effectively level with GPT-5.5 at 1514. The biggest jumps over the prior generation came in scientific reasoning: HLE +12 to 40%, GPQA Diamond +3 to 89%, and TerminalBench v2.1 +16 to 78%, at roughly $0.46 per task.",
    "take": "An independent benchmark house corroborating the vendor's coding claims, and on a contamination-resistant agentic measure rather than a saturated academic test, is the part that should carry weight. For a mid-market org the useful signal is that the open and closed tiers are now close enough that procurement can reasonably shortlist both. The open question is operational maturity rather than raw score: tooling, support, latency under load and governance. A sensible next step is a like-for-like pilot on your own representative tasks rather than relying on the headline index number.",
    "topics": [
      "open-source",
      "frontier-models",
      "enterprise"
    ],
    "sourceName": "Artificial Analysis",
    "sourceUrl": "https://artificialanalysis.ai/articles/glm-5-2-is-the-new-leading-open-weights-model-on-the-artificial-analysis-intelligence-index",
    "importance": "high"
  },
  {
    "id": "github-agent-finder-lands-in-github-copilot-on-",
    "vendor": "GitHub",
    "vendorDomain": "github.com",
    "date": "2026-06-17",
    "headline": "Agent finder lands in GitHub Copilot on the new open ARD discovery standard",
    "summary": "GitHub shipped Agent finder, which lets Copilot search an indexed registry of AI resources and pull the right tools and MCP servers in on demand rather than having developers wire them up by hand. It implements the open Agentic Resource Discovery (ARD) specification, co-developed with Google, GoDaddy, Hugging Face and Microsoft, and is available across all Copilot plans with no auto-installation and enterprise governance respected.",
    "take": "The interesting move here is not the feature but the standard underneath it. If discovery of agent tools becomes a shared spec across GitHub, Google and Microsoft rather than a per-vendor registry, the lock-in question shifts from which assistant you use to which registry your tools live in. For a mid-market org the question to explore is whether your internal tooling and data sources are described in a way an agent could ever discover and govern, before you worry about which coding assistant sits on top.",
    "topics": [
      "agents",
      "coding",
      "open-source"
    ],
    "sourceName": "GitHub Changelog",
    "sourceUrl": "https://github.blog/changelog/2026-06-17-agent-finder-for-github-copilot-now-available/",
    "importance": "high"
  },
  {
    "id": "salesforce-salesforce-and-databricks-build-a-shared",
    "vendor": "Salesforce",
    "vendorDomain": "salesforce.com",
    "date": "2026-06-16",
    "headline": "Salesforce and Databricks build a shared data foundation for human and AI-agent work",
    "summary": "On 16 June at the Databricks Data + AI Summit, Salesforce announced an expanded partnership with Databricks to connect governed enterprise data with the permissions, approvals and workflows that Agentforce agents need. New bidirectional Federated Search makes business context and organisational knowledge reachable from a single experience across both platforms. It lands alongside the Summer '26 release (generally available 15 June), which adds multi-agent orchestration, Slack-first workflows and Data Cloud triggered agents.",
    "take": "The interesting move here is less the agents themselves and more the plumbing beneath them: a deal whose entire premise is keeping sensitive data governed and in place while agents reason over it. For a mid-market organisation already on Salesforce or Databricks, the question to explore is whether agentic value now hinges on data foundations you have not yet consolidated, and whether you would be buying outcomes or buying yourself a new integration programme. Worth mapping where your customer data actually lives before any agent pilot is scoped.",
    "topics": [
      "agents",
      "enterprise"
    ],
    "sourceName": "Salesforce Newsroom",
    "sourceUrl": "https://www.salesforce.com/news/stories/salesforce-databricks-shared-foundation-of-human-agent-work-announcement/",
    "importance": "high"
  },
  {
    "id": "microsoft-microsoft-pushes-agent-365-governance-an",
    "vendor": "Microsoft",
    "vendorDomain": "microsoft.com",
    "date": "2026-06-16",
    "headline": "Microsoft pushes Agent 365 governance and Copilot Cowork as KPMG rolls agents to 276,000",
    "summary": "Microsoft's June release is governance-heavy: Agent 365 (generally available since 1 May) gained policy-based controls, runtime blocking and alerts via Intune and Defender public preview, plus registry sync to discover and inventory agents across AWS Bedrock and Google Cloud. On 16 June Microsoft launched Copilot Cowork for multi-step task automation with partner plugins and built-in security controls. KPMG has deployed Agent 365 to roughly 276,000 of its people.",
    "take": "Microsoft is positioning the control plane rather than just the assistant: discover, inventory and govern agents wherever they run, including a rival's cloud. For a mid-market organisation, the question to explore is whether you already have shadow agents proliferating across teams and clouds, and whether your answer to agent sprawl should be a governance layer before it is more agents. The KPMG number is a useful reference point for what at-scale really looks like, and for the change-management weight that comes with it.",
    "topics": [
      "agents",
      "enterprise",
      "ai-security"
    ],
    "sourceName": "Microsoft Security Blog",
    "sourceUrl": "https://www.microsoft.com/en-us/security/blog/2026/05/01/microsoft-agent-365-now-generally-available-expands-capabilities-and-integrations/",
    "importance": "high"
  },
  {
    "id": "z-ai-glm-5-2-becomes-the-leading-open-weights",
    "vendor": "Z.ai",
    "vendorDomain": "z.ai",
    "date": "2026-06-16",
    "headline": "GLM-5.2 becomes the leading open-weights model on the Artificial Analysis Intelligence Index, beating GPT-5.5 on coding at a fraction of the cost",
    "summary": "Z.ai released GLM-5.2, a 744B-parameter MoE model with MIT-licensed weights, scoring 51 on the Artificial Analysis Intelligence Index v4.1, the highest of any open-weights model to date. It tops GPT-5.5 on SWE-bench Pro (62.1 vs 58.6) and on FrontierSWE (74.4% vs 72.6%), coming within a point of Claude Opus 4.8, while its API runs at roughly one-sixth of GPT-5.5's blended cost. Weights are on Hugging Face at zai-org/GLM-5.2.",
    "take": "The open-weights frontier has closed most of the gap to the closed flagships on coding, and at a sixth of the price that changes the build-versus-buy maths for any team running high volumes of agentic work. The question for a mid-market organisation is not whether GLM-5.2 is impressive but where it can sit safely: open weights you self-host remove the data-residency objection, whereas the hosted API reintroduces the China data-governance question that several commentators flagged. Worth scoping which workloads are commodity enough to run on an open model and which genuinely need a closed frontier provider, rather than treating it as one decision.",
    "topics": [
      "open-source",
      "coding",
      "frontier-models"
    ],
    "sourceName": "VentureBeat",
    "sourceUrl": "https://venturebeat.com/technology/z-ais-open-weights-glm-5-2-beats-gpt-5-5-on-multiple-long-horizon-coding-benchmarks-for-1-6th-the-cost",
    "importance": "high"
  },
  {
    "id": "anthropic-us-government-orders-anthropic-to-suspen",
    "vendor": "Anthropic",
    "vendorDomain": "anthropic.com",
    "date": "2026-06-12",
    "headline": "US government orders Anthropic to suspend global access to Fable 5 and Mythos 5 over a claimed jailbreak",
    "summary": "The US government issued an export-control directive instructing Anthropic to disable worldwide access to two of its most capable models, Claude Fable 5 and Claude Mythos 5, citing national security. The underlying concern was a 'potential narrow, non-universal jailbreak' that prompted the model to identify exploitable software flaws in a codebase. Anthropic publicly disagreed that a narrow jailbreak finding should justify recalling a commercial model used by hundreds of millions, noting the same capability exists in rival public models such as OpenAI's GPT-5.5.",
    "take": "This is the first time a government has reached past policy and into a live model's deployment, and it lands precisely on the capability mid-market firms are starting to lean on: AI that reads a codebase and finds the holes. The uncomfortable lesson is that the same tool sharpening your security testing is the tool a regulator may decide is too sharp to leave running. For an organisation modernising with AI, the question to explore is less 'is this model safe' and more 'what is our continuity plan when a model we depend on can be switched off by forces outside our contract', concentration risk now includes the state, not just the vendor.",
    "topics": [
      "ai-security",
      "regulation",
      "frontier-models"
    ],
    "sourceName": "TechCrunch",
    "sourceUrl": "https://techcrunch.com/2026/06/12/anthropics-safety-warnings-may-have-just-backfired-the-government-has-pulled-the-plug-on-its-most-powerful-ai/",
    "importance": "high"
  },
  {
    "id": "mistral-ai-mistral-reported-to-be-raising-around-eu",
    "vendor": "Mistral AI",
    "vendorDomain": "mistral.ai",
    "date": "2026-06-12",
    "headline": "Mistral reported to be raising around EUR 3B at a EUR 20B valuation",
    "summary": "Mistral, the French AI lab positioning itself as a sovereign European alternative to US labs, is reported by Bloomberg (via TechCrunch) to be in early discussions to raise roughly EUR 3 billion (about $3.5 billion) at a valuation near EUR 20 billion. That would nearly double the EUR 11.7 billion post-money valuation from its September 2025 Series C. No specific investors are named in the reporting, which cites anonymous sources, and the round is described as early-stage discussions rather than closed.",
    "take": "The significance here is less the number than the geography: a EUR 20 billion European champion gives organisations a credible non-US frontier option at a moment when US models are entangled with export controls and US IPO pressures. For a mid-market firm with data-residency or sovereignty constraints, particularly in Europe, that widens the genuinely viable shortlist beyond the American labs. The question to explore is whether 'sovereign by default' is now a real procurement criterion for you, or a nice-to-have, and worth noting this raise is still rumoured, not closed, so it informs direction rather than a decision today.",
    "topics": [
      "funding",
      "frontier-models",
      "open-source"
    ],
    "sourceName": "TechCrunch",
    "sourceUrl": "https://techcrunch.com/2026/06/12/mistral-is-rumored-to-be-raising-e3b-at-e20-valuation/",
    "importance": "medium"
  },
  {
    "id": "anthropic-us-export-control-directive-forces-anthr",
    "vendor": "Anthropic",
    "vendorDomain": "anthropic.com",
    "date": "2026-06-12",
    "headline": "US export-control directive forces Anthropic to suspend its top-scoring Fable 5 and Mythos 5 models for all users",
    "summary": "Anthropic stated that on 12 June 2026 the US government issued an export-control directive requiring it to suspend all access to Fable 5 and Mythos 5 for every user, including foreign-national employees, citing national-security concerns over a possible jailbreak related to cybersecurity tasks. Fable 5, released 9 June and the strongest model Anthropic had made generally available, sits at or near the top of both Artificial Analysis and LMArena, but is now unavailable. Anthropic disputed the action and said all other models are unaffected.",
    "take": "This is the first time a leaderboard's nominal number-one has been removed from the market by government order rather than a newer release, and it lands directly on the assumption that the best model on a board is the model you can actually deploy. For a mid-market organisation the lesson is concentration risk: a roadmap pinned to a single named model from a single provider is exposed to regulatory as well as commercial disruption. The question to explore is how quickly your stack could fail over to a comparable alternative, and whether your contracts and architecture treat the model as a swappable component rather than a fixed dependency.",
    "topics": [
      "regulation",
      "frontier-models",
      "ai-security"
    ],
    "sourceName": "Anthropic",
    "sourceUrl": "https://www.anthropic.com/news/fable-mythos-access",
    "importance": "high"
  },
  {
    "id": "anthropic-anthropic-deepens-regulated-industry-pus",
    "vendor": "Anthropic",
    "vendorDomain": "anthropic.com",
    "date": "2026-06-11",
    "headline": "Anthropic deepens regulated-industry push with DXC and TCS global alliances",
    "summary": "On 11 June Anthropic and DXC Technology announced a multi-year global alliance to embed Claude into mission-critical systems for banks, airlines, insurers and government, training tens of thousands of Claude-certified engineers and making Claude the default model in DXC's OASIS platform. The following day TCS announced a global premier partnership, equipping 50,000 associates with Claude under enterprise-wide licensing and going to market jointly across financial services, public services and healthcare.",
    "take": "Two systems-integrator alliances in two days signals that the route into regulated enterprises is increasingly through the integrators who already run their core systems, not direct. For a mid-market organisation, the question to explore is whether your existing IT services partner is becoming an AI-delivery channel, and what that means for who owns the model choice, the governance posture and the eventual switching costs. Convenient if your integrator is one of these names; worth a careful read of the lock-in if it is not.",
    "topics": [
      "enterprise",
      "agents",
      "frontier-models"
    ],
    "sourceName": "Anthropic Newsroom",
    "sourceUrl": "https://www.anthropic.com/news/dxc-anthropic-alliance",
    "importance": "high"
  },
  {
    "id": "anthropic-anthropic-ships-claude-fable-5-its-first",
    "vendor": "Anthropic",
    "vendorDomain": "anthropic.com",
    "date": "2026-06-09",
    "headline": "Anthropic ships Claude Fable 5, its first generally available Mythos-class model",
    "summary": "On 9 June 2026 Anthropic released Claude Fable 5, the first model from its new Mythos class that sits above the Opus tier, alongside the more permissive Mythos 5 reserved for a small group of cyber defenders. Fable 5 hits 80.3% on SWE-Bench Pro and is described as state-of-the-art on nearly all tested capability benchmarks; Stripe reported it compressed roughly five months of engineering work into days. Pricing is $10 per million input tokens and $50 per million output, and it was included free on Pro, Max, Team and Enterprise seats only until 22 June.",
    "take": "A new tier above Opus, priced at twice the Opus 4.8 rate, signals that the frontier is again splitting into a premium agentic band and a workhorse band. For a mid-market organisation the question to explore is not whether Fable 5 tops the charts but where in your workflow a model this capable actually earns its cost, and whether the time-limited free window on existing seats tempted teams into a dependency that becomes a line item on 23 June. Worth mapping which tasks genuinely need Mythos-class reasoning versus which Opus or Sonnet already handle.",
    "topics": [
      "frontier-models",
      "coding",
      "agents"
    ],
    "sourceName": "Anthropic",
    "sourceUrl": "https://www.anthropic.com/news/claude-fable-5-mythos-5",
    "importance": "high"
  },
  {
    "id": "openai-openai-named-a-leader-in-gartner-s-magic",
    "vendor": "OpenAI",
    "vendorDomain": "openai.com",
    "date": "2026-06-09",
    "headline": "OpenAI named a Leader in Gartner's Magic Quadrant for enterprise AI coding agents",
    "summary": "OpenAI announced it was placed as a Leader in the Gartner Magic Quadrant for Enterprise AI Coding Agents, citing Codex usage of more than four million people each week. Codex now runs across VS Code, Cursor and Windsurf plus a macOS and Windows desktop app for managing multiple agents and supervising long-running work, and can schedule future work for itself and resume long-term tasks autonomously.",
    "take": "A Leader placement and a four-million weekly user figure tell you Codex has crossed from experiment to default infrastructure for a large cohort, which is a procurement signal worth noting. The more useful framing for a mid-market team is that analyst quadrants reward breadth of enterprise controls and roadmap, not necessarily fit for your stack. The question to explore is whether the autonomy features that make the demos impressive, self-scheduling agents and unattended long-running tasks, are ones your review and security processes are actually ready to supervise.",
    "topics": [
      "agents",
      "coding",
      "enterprise"
    ],
    "sourceName": "OpenAI Newsroom",
    "sourceUrl": "https://openai.com/index/gartner-2026-agentic-coding-leader/",
    "importance": "medium"
  },
  {
    "id": "google-gemini-enterprise-adds-workspace-canvas-",
    "vendor": "Google",
    "vendorDomain": "google.com",
    "date": "2026-06-08",
    "headline": "Gemini Enterprise adds Workspace canvas actions as Gemini 3.5 Flash becomes default",
    "summary": "Google continued building out Gemini Enterprise as its unified agent platform (the evolution of Vertex AI), with tighter Workspace integration: users will soon schedule Calendar meetings and create, view and edit Docs and Slides directly from the app's canvas mode, backed by a Workspace Intelligence semantic layer. From 8 June, Gemini 3.5 Flash is enabled by default for Gemini Enterprise users. Google reported 40% quarter-over-quarter growth in paid monthly active users in Q1.",
    "take": "Google's pitch is consolidation: one platform spanning models, a no-code Agent Designer and the Workspace surfaces people already live in. For a mid-market organisation on Google Workspace, the question to explore is whether embedding agents where work already happens lowers the adoption barrier enough to justify standardising here, or whether default-on model changes you cannot turn off introduce governance and change-control questions of their own. Worth checking who controls the model roster and the data boundaries before treating it as the default.",
    "topics": [
      "agents",
      "enterprise",
      "frontier-models"
    ],
    "sourceName": "Google Cloud Blog",
    "sourceUrl": "https://cloud.google.com/blog/products/ai-machine-learning/the-new-gemini-enterprise-one-platform-for-agent-development",
    "importance": "medium"
  },
  {
    "id": "openai-openai-confirms-confidential-s-1-filing-",
    "vendor": "OpenAI",
    "vendorDomain": "openai.com",
    "date": "2026-06-08",
    "headline": "OpenAI confirms confidential S-1 filing with the SEC, first formal step toward a landmark IPO",
    "summary": "OpenAI confirmed on 8 June 2026 that it had confidentially submitted a draft Form S-1 registration statement to the SEC, the first formal step toward a public listing, with Goldman Sachs, Morgan Stanley and JPMorgan reported to be leading the offering. The move follows a financing round earlier in 2026 that valued the company at roughly $852 billion, with analysts widely expecting a public listing to exceed $1 trillion. OpenAI has not committed to timing and said it disclosed the filing publicly because it expected the news to leak.",
    "take": "An OpenAI IPO would be the clearest signal yet that frontier AI has moved from venture experiment to public-market infrastructure, and that changes the incentives a customer should watch. Public companies answer to quarterly earnings, which can sharpen pricing, tighten free tiers, and accelerate monetisation of features that were previously loss-leaders. For a mid-market org standing up an AI strategy on OpenAI's stack, the question to explore is how your unit economics hold up if the cost curve stops falling and starts being managed for margin, a reason to keep at least one credible alternative model warm.",
    "topics": [
      "funding",
      "frontier-models",
      "enterprise"
    ],
    "sourceName": "CNBC",
    "sourceUrl": "https://www.cnbc.com/2026/06/08/openai-confidentially-files-for-ipo-prepping-wall-street-for-ai-debut.html",
    "importance": "high"
  },
  {
    "id": "anthropic-anthropic-maps-a-year-of-ai-enabled-cybe",
    "vendor": "Anthropic",
    "vendorDomain": "anthropic.com",
    "date": "2026-06-03",
    "headline": "Anthropic maps a year of AI-enabled cyber threats: autonomy, not phishing, is the rising danger signal",
    "summary": "Anthropic analysed 832 accounts banned for malicious cyber activity between March 2025 and March 2026 and mapped them to the MITRE ATT&CK framework. It found 67.3% of studied accounts used AI to help write malware, AI-assisted account discovery rose while AI-assisted phishing actually fell, and the share of actors its risk system rated medium-or-higher jumped from 33% to 56% across the study period. The firm argues the most useful danger signal is now how much autonomy an attacker hands the model, which existing security frameworks do not capture.",
    "take": "The headline finding inverts a common assumption: the threat is not better-worded phishing emails, it is amateurs renting a professional's skill set from a model and handing it the wheel. For a mid-market organisation, that reframes where defensive attention should go, away from awareness training alone and toward detecting autonomous, AI-driven activity inside an already-compromised network. The question worth sitting with is whether your monitoring measures 'how human-like is this attacker' or 'how much has this attacker delegated to a machine', because Anthropic's data suggests those are increasingly different things.",
    "topics": [
      "ai-security",
      "agents",
      "enterprise"
    ],
    "sourceName": "Anthropic",
    "sourceUrl": "https://www.anthropic.com/news/AI-enabled-cyber-threats-mitre-attack",
    "importance": "high"
  },
  {
    "id": "github-github-adds-copilot-cli-agent-picker-rem",
    "vendor": "GitHub",
    "vendorDomain": "github.com",
    "date": "2026-06-02",
    "headline": "GitHub adds Copilot CLI agent picker, remote control and a desktop orchestration app",
    "summary": "Announced at Microsoft Build 2026, the Copilot CLI gained an agent picker for Agent, Ask, custom and Plan modes, plus slash commands including /remote to drive sessions from github.com or mobile and /compact to compress context. Alongside it GitHub introduced a standalone Copilot desktop app for Windows, macOS and Linux that orchestrates multiple agent sessions in parallel, each in its own isolated git worktree, with bidirectional 'canvases' for humans and agents to share plans, pull requests and terminal state.",
    "take": "The shift on display is from single-developer assistant to a control plane for many agents working one repository at once. Isolated worktrees per agent is a sensible engineering answer to the obvious collision problem, but parallel autonomous agents multiply the review and merge surface rather than shrink it. The question for a mid-market team to explore is whether your CI, review and branch-protection discipline is strong enough that running several agents in parallel is a throughput gain rather than a new source of hard-to-trace regressions.",
    "topics": [
      "agents",
      "coding",
      "enterprise"
    ],
    "sourceName": "GitHub Changelog",
    "sourceUrl": "https://github.blog/changelog/2026-06-02-introducing-copilot-cli-and-agentic-capabilities-enhancements-in-jetbrains-ides/",
    "importance": "medium"
  },
  {
    "id": "anthropic-anthropic-expands-project-glasswing-to-r",
    "vendor": "Anthropic",
    "vendorDomain": "anthropic.com",
    "date": "2026-06-02",
    "headline": "Anthropic expands Project Glasswing to roughly 200 organisations as AI-found vulnerabilities outpace patching",
    "summary": "Anthropic expanded Project Glasswing, its programme using the Claude Mythos Preview model to find and triage software vulnerabilities, to around 200 organisations across more than 15 countries, up from about 50 at its April launch. Partners have collectively reported over 10,000 high- and critical-severity flaws in under two months; Cloudflare alone identified roughly 2,000 bugs, 400 rated high or critical, with a false-positive rate it described as better than human testers. A joint report from the Cloud Security Alliance, SANS Institute and OWASP warned organisations are likely to be overwhelmed by attackers using AI to find and exploit flaws faster than defenders can patch.",
    "take": "Glasswing is the optimistic mirror image of the cyber-threat story: the same model that can weaponise a vulnerability is, in friendly hands, surfacing them at industrial scale. The catch the SANS/OWASP report names is the one that actually bites mid-market teams, finding 10,000 flaws is only useful if you can patch them, and most patching pipelines are sized for a human rate of discovery. The question to explore is whether adopting AI-assisted vulnerability discovery would simply hand your team a backlog it cannot clear; the bottleneck is shifting from detection to remediation capacity.",
    "topics": [
      "ai-security",
      "enterprise",
      "infrastructure"
    ],
    "sourceName": "CNBC",
    "sourceUrl": "https://www.cnbc.com/2026/06/02/anthropic-mythos-ai-project-glasswing.html",
    "importance": "medium"
  },
  {
    "id": "snowflake-snowflake-and-anthropic-deepen-governed-",
    "vendor": "Snowflake",
    "vendorDomain": "snowflake.com",
    "date": "2026-06-01",
    "headline": "Snowflake and Anthropic deepen governed-AI partnership at Snowflake Summit 26",
    "summary": "At Snowflake Summit on 1 June, Snowflake and Anthropic reported momentum in integrating Claude directly into Snowflake Cortex AI, letting enterprises run production agents on governed data without moving sensitive information outside their systems. Snowflake highlighted Cortex Code (its fastest-growing product ever, 7,100-plus users), Snowflake Intelligence and Cortex Agents, with customers including Block, Carvana, Indeed and Notion. Snowflake also joined the Claude Marketplace as a launch partner.",
    "take": "The recurring 2026 theme is visible again: bring the model to the governed data rather than exporting the data to the model. For a mid-market organisation, the question to explore is whether your analytics warehouse is becoming the natural home for AI agents, and whether that consolidates governance helpfully or simply concentrates dependency on one data platform. Worth weighing the convenience of agents-on-your-warehouse against the portability you give up by wiring reasoning into a single vendor's stack.",
    "topics": [
      "enterprise",
      "agents",
      "infrastructure"
    ],
    "sourceName": "Snowflake Newsroom",
    "sourceUrl": "https://www.snowflake.com/en/news/press-releases/snowflake-and-anthropic-accelerate-enterprise-ai-adoption-driven-by-rising-demand-for-governed-ai/",
    "importance": "medium"
  },
  {
    "id": "anthropic-claude-opus-4-8-leans-into-honesty-and-r",
    "vendor": "Anthropic",
    "vendorDomain": "anthropic.com",
    "date": "2026-05-28",
    "headline": "Claude Opus 4.8 leans into honesty and reliability over raw capability gains",
    "summary": "Anthropic released Claude Opus 4.8 on 28 May 2026, emphasising honesty and reliability: the company reports it is roughly four times less likely than Opus 4.7 to let flaws in its own generated code pass unremarked. It is the only model to complete every case end-to-end on Anthropic's Super-Agent benchmark, scores 84% on Online-Mind2Web, and runs at 2.5x speed in fast mode. Pricing held at $5/$25 per million input/output tokens, with a fast mode at $10/$50.",
    "take": "The headline here is a shift in what counts as progress: fewer silently-wrong outputs rather than another benchmark record. For an organisation putting models into real workflows, a measurable drop in undetected coding errors is arguably more valuable than a few points on a leaderboard, because it changes how much human review each output needs. The question to explore is whether your current evaluation harness even measures self-caught error rates, or whether you are still selecting models purely on capability scores that say little about reliability in production.",
    "topics": [
      "frontier-models",
      "coding",
      "ai-security"
    ],
    "sourceName": "Anthropic",
    "sourceUrl": "https://www.anthropic.com/news/claude-opus-4-8",
    "importance": "high"
  },
  {
    "id": "anthropic-claude-opus-4-8-takes-the-top-usable-spo",
    "vendor": "Anthropic",
    "vendorDomain": "anthropic.com",
    "date": "2026-05-28",
    "headline": "Claude Opus 4.8 takes the top usable spot on the Artificial Analysis Intelligence Index with a focus on reliability over raw scores",
    "summary": "Anthropic released Claude Opus 4.8 on 28 May 2026, describing it as a modest but tangible improvement on Opus 4.7. It became the leading generally available model on the Artificial Analysis Intelligence Index and ranks #1 on LMArena's overall board among shipping models. Anthropic emphasised reliability gains, around four times less likely to let flaws in its own generated code pass unremarked, and alignment improvements, with pricing held flat at $5/$25 per million tokens.",
    "take": "The framing here is the interesting part: Anthropic led with honesty and self-checking rather than a headline benchmark jump, which tracks a broader shift from peak-score chasing to dependability. For a mid-market org modernising with AI, a model that catches its own coding errors more often is worth more in production than a point or two on an academic test, because the cost is in the failures, not the averages. The question worth asking is whether your evaluation of models weights reliability and error rates on your own tasks, not just public index position.",
    "topics": [
      "frontier-models",
      "coding",
      "enterprise"
    ],
    "sourceName": "TechCrunch",
    "sourceUrl": "https://techcrunch.com/2026/05/28/anthropic-releases-opus-4-8-with-new-dynamic-workflow-tool/",
    "importance": "medium"
  },
  {
    "id": "google-deepmind-google-opens-the-gemini-3-5-family-with-",
    "vendor": "Google DeepMind",
    "vendorDomain": "deepmind.google",
    "date": "2026-05-19",
    "headline": "Google opens the Gemini 3.5 family with the cost-efficient 3.5 Flash",
    "summary": "On 19 May 2026 Google released Gemini 3.5 Flash, the first public model in the 3.5 family, following the December 2025 Gemini 3 Flash. The Flash line targets frontier-level reasoning at low latency and cost: the prior Gemini 3 Flash posted 90.4% on GPQA Diamond and 78% on SWE-bench Verified at $0.50/$3 per million input/output tokens while running about 3x faster than 2.5 Pro and using roughly 30% fewer tokens. The 3.5 family marks Google's next iteration on that efficiency-first positioning.",
    "take": "Flash-class models are where most production volume actually lands, because the economics work at scale in a way premium tiers do not. The strategic question for a modernising organisation is portfolio design: which jobs route to a cheap, fast Flash model and which genuinely need a Fable, Opus or GPT-5.5-Pro. Getting that routing right is often a larger lever on your AI bill than any single model choice, and it is worth building before you commit to volume on a premium tier.",
    "topics": [
      "frontier-models",
      "multimodal",
      "coding"
    ],
    "sourceName": "Google",
    "sourceUrl": "https://blog.google/products/gemini/gemini-3-flash/",
    "importance": "medium"
  },
  {
    "id": "google-google-retires-gemini-cli-and-moves-ever",
    "vendor": "Google",
    "vendorDomain": "google.com",
    "date": "2026-05-19",
    "headline": "Google retires Gemini CLI and moves everyone to Antigravity CLI on 18 June",
    "summary": "Google announced that on 18 June 2026 Gemini CLI and the Gemini Code Assist IDE extensions stop serving requests for free, Pro and Ultra users, with paid Enterprise licences retained. From the same date Antigravity CLI, a Go-built terminal interface for its agent-first platform, becomes available to everyone, carrying over Agent Skills, Hooks, Subagents and Extensions (now Antigravity plugins) and sharing the agent system behind Antigravity 2.0's desktop app.",
    "take": "This is a forced migration with a hard cutover date, and it landed with reports of broken developer setups when Antigravity 2.0 shipped. The pattern is worth filing: vendors are consolidating multiple coding-tool brands into single agent platforms and sunsetting the older entry points quickly. For an organisation standardising on a vendor's CLI or IDE extension, the question to explore is how much of your automation and onboarding is pinned to a specific tool name and command surface that the vendor may rename or retire on a few weeks' notice.",
    "topics": [
      "agents",
      "coding",
      "infrastructure"
    ],
    "sourceName": "Google Developers Blog",
    "sourceUrl": "https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/",
    "importance": "medium"
  },
  {
    "id": "cursor-cursor-ships-a-typescript-sdk-that-turns",
    "vendor": "Cursor",
    "vendorDomain": "cursor.com",
    "date": "2026-04-29",
    "headline": "Cursor ships a TypeScript SDK that turns its coding agent into deployable infrastructure",
    "summary": "Cursor released a TypeScript SDK exposing the same agent runtime, harness and models behind the IDE, so teams can run programmatic agents locally or in Cursor's cloud with each cloud agent getting a dedicated VM and the repository pre-cloned. It bundles codebase indexing and semantic search, MCP server support, reusable skill definitions and loop hooks, and is in public beta with token-based pricing, aimed at embedding agents in CI/CD pipelines and backend services.",
    "take": "This reframes a coding assistant from a thing developers open to a service other systems call, which is where real automation value and real operational risk both live. An agent that can read a failing pipeline, write a fix and open a pull request unattended is genuinely useful and genuinely capable of committing a confident mistake at scale. The question to explore is what guardrails, blast-radius limits and human checkpoints you would put around a programmatic agent before letting it act inside your delivery pipeline rather than alongside a developer.",
    "topics": [
      "agents",
      "coding",
      "infrastructure"
    ],
    "sourceName": "DevOps.com",
    "sourceUrl": "https://devops.com/cursors-new-sdk-turns-ai-coding-agents-into-deployable-infrastructure/",
    "importance": "medium"
  },
  {
    "id": "deepseek-deepseek-previews-the-v4-series-with-1m-",
    "vendor": "DeepSeek",
    "vendorDomain": "deepseek.com",
    "date": "2026-04-24",
    "headline": "DeepSeek previews the V4 series with 1M context under an MIT licence",
    "summary": "On 24 April 2026 DeepSeek released a preview of its V4 series: the 1.6-trillion-parameter DeepSeek-V4-Pro and the 284-billion-parameter DeepSeek-V4-Flash, both with a 1-million-token context window and shipped under the permissive MIT licence. The models are available on web, app and API. The long-rumoured R2 reasoning model still does not appear in DeepSeek's official model list as of June 2026.",
    "take": "Open-weights frontier-class models with permissive licensing and very long context change the build-versus-buy calculus for organisations with data-residency or cost-control concerns, because the weights can be self-hosted rather than rented. The question to explore is whether your team has the MLOps maturity to actually run a model of this scale economically, or whether the headline of 'free weights' hides a serious infrastructure bill. For most mid-market buyers the realistic path is a managed endpoint, where the licence matters less than latency, support and data handling.",
    "topics": [
      "frontier-models",
      "open-source",
      "infrastructure"
    ],
    "sourceName": "DeepSeek",
    "sourceUrl": "https://www.deepseek.com/en/",
    "importance": "medium"
  },
  {
    "id": "openai-openai-releases-gpt-5-5-with-a-1m-contex",
    "vendor": "OpenAI",
    "vendorDomain": "openai.com",
    "date": "2026-04-23",
    "headline": "OpenAI releases GPT-5.5 with a 1M context window and a step up in agentic coding",
    "summary": "OpenAI released GPT-5.5 on 23 April 2026, with API access following on 24 April. The model carries a 1M-token context window and reported scores of 82.7% on Terminal-Bench 2.0, 51.7% on FrontierMath Tier 1-3, and 74.0% on the MRCR long-context test. API pricing is $5 per million input and $30 per million output tokens, with GPT-5.5 Pro at $30/$180. TechCrunch framed the launch as a step toward OpenAI's 'super app' ambitions.",
    "take": "The notable move is pricing: GPT-5.5 output roughly doubles the prior generation's rate, with OpenAI arguing fewer output tokens offset much of the increase. For a mid-market buyer that nets out to a real cost question rather than a clear saving, so the thing to test is your own token economics on representative tasks rather than trusting the vendor's 'effectively cheaper' framing. The 1M context window is genuinely useful for document-heavy and agentic work, but only if your retrieval and orchestration are built to exploit it rather than just stuff the window.",
    "topics": [
      "frontier-models",
      "agents",
      "coding"
    ],
    "sourceName": "TechCrunch",
    "sourceUrl": "https://techcrunch.com/2026/04/23/openai-chatgpt-gpt-5-5-ai-model-superapp/",
    "importance": "high"
  }
];

export const BOARDS = {
  "models": [
    {
      "rank": 1,
      "name": "Claude Fable 5",
      "company": "Anthropic",
      "domain": "anthropic.com",
      "score": 95,
      "pillars": {
        "reasoning": 97,
        "coding": 96,
        "speed": 78,
        "cost": 60,
        "context": 90
      },
      "delta": "new",
      "blurb": "Anthropic's first generally available Mythos-class model. State-of-the-art on nearly all tested benchmarks and 80.3% on SWE-Bench Pro; launched at #1 on the Artificial Analysis Intelligence Index. Premium priced at $10/$50 per million tokens."
    },
    {
      "rank": 2,
      "name": "GPT-5.5",
      "company": "OpenAI",
      "domain": "openai.com",
      "score": 92,
      "pillars": {
        "reasoning": 94,
        "coding": 92,
        "speed": 80,
        "cost": 68,
        "context": 95
      },
      "delta": "new",
      "blurb": "OpenAI's April flagship with a 1M context window, 82.7% on Terminal-Bench 2.0 and strong long-context recall. $5/$30 per million tokens, with a Pro tier at $30/$180."
    },
    {
      "rank": 3,
      "name": "Claude Opus 4.8",
      "company": "Anthropic",
      "domain": "anthropic.com",
      "score": 90,
      "pillars": {
        "reasoning": 93,
        "coding": 93,
        "speed": 82,
        "cost": 74,
        "context": 88
      },
      "delta": "+1",
      "blurb": "The reliability-focused Opus revision: roughly 4x less likely than 4.7 to let its own code flaws pass, tops Anthropic's Super-Agent benchmark and scores 84% on Online-Mind2Web. $5/$25 per million tokens."
    },
    {
      "rank": 4,
      "name": "Gemini 3.1 Pro",
      "company": "Google DeepMind",
      "domain": "deepmind.google",
      "score": 89,
      "pillars": {
        "reasoning": 91,
        "coding": 89,
        "speed": 79,
        "cost": 72,
        "context": 96
      },
      "delta": "=",
      "blurb": "Google's flagship Pro reasoning model in the Gemini 3 line, strong on multimodal understanding and agentic coding with a very large context window. Released February 2026."
    },
    {
      "rank": 5,
      "name": "Gemini 3.5 Flash",
      "company": "Google DeepMind",
      "domain": "deepmind.google",
      "score": 84,
      "pillars": {
        "reasoning": 85,
        "coding": 84,
        "speed": 96,
        "cost": 94,
        "context": 92
      },
      "delta": "new",
      "blurb": "Frontier-level reasoning at Flash latency and cost. The 3 Flash predecessor posted 90.4% GPQA Diamond and 78% SWE-bench Verified at $0.50/$3 per million tokens. The volume workhorse of the Gemini line."
    },
    {
      "rank": 6,
      "name": "GLM-5.2",
      "company": "Zhipu AI",
      "domain": "z.ai",
      "score": 82,
      "pillars": {
        "reasoning": 83,
        "coding": 84,
        "speed": 80,
        "cost": 92,
        "context": 90
      },
      "delta": "new",
      "blurb": "Leading open-weights model on the Artificial Analysis index (score 51), seven points clear of rivals. 744B MoE with 40B active, 1M usable context, MIT licence; GDPval agentic score effectively level with GPT-5.5."
    },
    {
      "rank": 7,
      "name": "DeepSeek-V4-Pro",
      "company": "DeepSeek",
      "domain": "deepseek.com",
      "score": 80,
      "pillars": {
        "reasoning": 81,
        "coding": 82,
        "speed": 76,
        "cost": 93,
        "context": 95
      },
      "delta": "new",
      "blurb": "1.6T-parameter open-weights model with a 1M context window under MIT licence. Ties MiniMax-M3 at 44 on the Artificial Analysis open-weights index; the long-rumoured R2 reasoner remains unreleased."
    },
    {
      "rank": 8,
      "name": "Grok 4.20 Beta 2",
      "company": "xAI",
      "domain": "x.ai",
      "score": 78,
      "pillars": {
        "reasoning": 80,
        "coding": 79,
        "speed": 82,
        "cost": 74,
        "context": 80
      },
      "delta": "=",
      "blurb": "xAI's current flagship while the 6T-parameter Grok 5 slips past its Q1 window into Q2 2026. Competitive with but not clearly leading GPT-5.4 or Opus 4.7 across major benchmarks."
    }
  ],
  "products": [
    {
      "rank": 1,
      "name": "Microsoft 365 Copilot + Agent 365",
      "company": "Microsoft",
      "domain": "microsoft.com",
      "score": 89,
      "pillars": {
        "capability": 86,
        "integration": 94,
        "governance": 92,
        "value": 84
      },
      "delta": "+1",
      "blurb": "Deepest reach into the apps enterprises already run, now paired with an Agent 365 control plane that discovers and governs agents across clouds. Governance and integration are the standout pillars; KPMG's 276,000-person rollout shows it scales."
    },
    {
      "rank": 2,
      "name": "Salesforce Agentforce",
      "company": "Salesforce",
      "domain": "salesforce.com",
      "score": 86,
      "pillars": {
        "capability": 85,
        "integration": 88,
        "governance": 87,
        "value": 82
      },
      "delta": "+2",
      "blurb": "Summer '26 brings multi-agent orchestration and Data Cloud triggered agents, and the Databricks partnership shores up the governed-data foundation. Strongest where the CRM is already the system of record; value depends on data readiness."
    },
    {
      "rank": 3,
      "name": "Gemini Enterprise",
      "company": "Google",
      "domain": "google.com",
      "score": 84,
      "pillars": {
        "capability": 88,
        "integration": 84,
        "governance": 82,
        "value": 83
      },
      "delta": "+3",
      "blurb": "Unified agent platform succeeding Vertex AI, with 200-plus models, a no-code Agent Designer and tightening Workspace canvas actions. High capability and fast growth; default-on model changes raise governance questions for the cautious."
    },
    {
      "rank": 4,
      "name": "ChatGPT Enterprise",
      "company": "OpenAI",
      "domain": "openai.com",
      "score": 83,
      "pillars": {
        "capability": 90,
        "integration": 78,
        "governance": 80,
        "value": 80
      },
      "delta": "=",
      "blurb": "Frontier capability and a strong spreadsheet-native push into Excel and Sheets, now with usage analytics and spend controls. Governance is maturing; the move to credit-based billing makes cost forecasting the live question."
    },
    {
      "rank": 5,
      "name": "Claude for Enterprise",
      "company": "Anthropic",
      "domain": "anthropic.com",
      "score": 82,
      "pillars": {
        "capability": 89,
        "integration": 76,
        "governance": 85,
        "value": 78
      },
      "delta": "+2",
      "blurb": "Top of the Artificial Analysis index and the model of choice for regulated-industry alliances (DXC, TCS, Snowflake). Self-hosted sandboxes and managed MCP strengthen governance; integration leans on partners more than first-party surfaces."
    },
    {
      "rank": 6,
      "name": "Snowflake Cortex AI",
      "company": "Snowflake",
      "domain": "snowflake.com",
      "score": 79,
      "pillars": {
        "capability": 80,
        "integration": 83,
        "governance": 88,
        "value": 76
      },
      "delta": "new",
      "blurb": "Agents that run on governed data without moving it, with Claude wired directly into Cortex. Governance is the headline strength for data-sensitive teams; value is tied to already standardising on the warehouse."
    },
    {
      "rank": 7,
      "name": "Databricks Agent Bricks",
      "company": "Databricks",
      "domain": "databricks.com",
      "score": 77,
      "pillars": {
        "capability": 81,
        "integration": 82,
        "governance": 84,
        "value": 74
      },
      "delta": "new",
      "blurb": "The data-and-AI foundation behind the Salesforce shared-foundation deal, strong on governed enterprise data and lakehouse-native agents. Most compelling for organisations whose centre of gravity is the data platform rather than the app suite."
    }
  ],
  "tools": [
    {
      "rank": 1,
      "name": "Claude Code",
      "company": "Anthropic",
      "domain": "anthropic.com",
      "score": 92,
      "pillars": {
        "autonomy": 90,
        "codeQuality": 95,
        "integration": 88,
        "ecosystem": 90
      },
      "delta": "=",
      "blurb": "Anthropic's terminal-native agent, now paired with Fable 5 and the new ultracode xhigh effort mode. Mythos-class models give it the strongest code-quality ceiling; benchmark leadership on SWE-bench Verified (Fable 5 at 95 percent) anchors its reputation."
    },
    {
      "rank": 2,
      "name": "Codex",
      "company": "OpenAI",
      "domain": "openai.com",
      "score": 91,
      "pillars": {
        "autonomy": 93,
        "codeQuality": 90,
        "integration": 90,
        "ecosystem": 92
      },
      "delta": "+1",
      "blurb": "Named a Gartner Leader with 4M-plus weekly users. Runs across VS Code, Cursor and Windsurf plus a multi-agent desktop app, can self-schedule and resume long-running work, and leads Terminal-Bench at 83.4 percent."
    },
    {
      "rank": 3,
      "name": "GitHub Copilot",
      "company": "GitHub / Microsoft",
      "domain": "github.com",
      "score": 88,
      "pillars": {
        "autonomy": 85,
        "codeQuality": 86,
        "integration": 95,
        "ecosystem": 94
      },
      "delta": "=",
      "blurb": "Deepest IDE and platform reach, now extended with a parallel-agent desktop app, Copilot CLI agent picker, remote control and Agent finder on the open ARD discovery standard. Integration and ecosystem are its decisive pillars."
    },
    {
      "rank": 4,
      "name": "Cursor",
      "company": "Cursor (Anysphere)",
      "domain": "cursor.com",
      "score": 86,
      "pillars": {
        "autonomy": 88,
        "codeQuality": 87,
        "integration": 84,
        "ecosystem": 82
      },
      "delta": "=",
      "blurb": "Added Automations with always-on agents, faster Bugbot reviews (~90s) and a TypeScript SDK that makes its agent deployable infrastructure with sandboxed cloud VMs, subagents and hooks. Strong autonomy story for programmatic use."
    },
    {
      "rank": 5,
      "name": "Antigravity",
      "company": "Google",
      "domain": "google.com",
      "score": 84,
      "pillars": {
        "autonomy": 86,
        "codeQuality": 85,
        "integration": 82,
        "ecosystem": 80
      },
      "delta": "+1",
      "blurb": "Google's agent-first platform and CLI, Gemini 3 Pro under the hood, replacing the retired Gemini CLI from 18 June. Go-built, asynchronous, multi-agent orchestration; rapid 2.0 rollout caused some developer disruption."
    },
    {
      "rank": 6,
      "name": "Jules",
      "company": "Google",
      "domain": "google.com",
      "score": 80,
      "pillars": {
        "autonomy": 85,
        "codeQuality": 82,
        "integration": 76,
        "ecosystem": 76
      },
      "delta": "=",
      "blurb": "Google's always-on autonomous coding agent for AI subscribers, now running Gemini 3 Pro with improved multi-step reliability. Integrates with IDEs and CLI and runs asynchronously, but ecosystem reach trails the IDE-native incumbents."
    },
    {
      "rank": 7,
      "name": "LangGraph",
      "company": "LangChain",
      "domain": "langchain.com",
      "score": 78,
      "pillars": {
        "autonomy": 80,
        "codeQuality": 72,
        "integration": 84,
        "ecosystem": 88
      },
      "delta": "=",
      "blurb": "The most adopted multi-agent framework, modelling workflows as typed-state directed graphs with explicit, visual control over agent sequencing. Not a coding assistant itself but the dominant substrate for building custom autonomous agents."
    }
  ]
};
