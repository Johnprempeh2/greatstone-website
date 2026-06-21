// AI Intelligence Hub — the dataset the hub renders. Curated by Greatstone analysts (for now, the agent
// on the nightly loop) from the fixed source roster below; a news API can later write into the same shape.
// Every briefing carries its real source link; leaderboard scores follow the published weighting. This
// module is the single source of truth the UI reads. `briefings` and `boards` are refreshed each pass.

export const TOPICS = [
  { id: 'frontier-models', label: 'Frontier models', hue: 84 },
  { id: 'agents', label: 'Agents', hue: 168 },
  { id: 'coding', label: 'Coding', hue: 200 },
  { id: 'enterprise', label: 'Enterprise', hue: 270 },
  { id: 'ai-security', label: 'AI security', hue: 6 },
  { id: 'regulation', label: 'Regulation', hue: 38 },
  { id: 'funding', label: 'Funding', hue: 132 },
  { id: 'infrastructure', label: 'Infrastructure', hue: 220 },
  { id: 'multimodal', label: 'Multimodal', hue: 300 },
  { id: 'hardware', label: 'Hardware', hue: 18 },
  { id: 'open-source', label: 'Open source', hue: 150 },
];
export const TOPIC_LABEL = Object.fromEntries(TOPICS.map((t) => [t.id, t.label]));
export const TOPIC_HUE = Object.fromEntries(TOPICS.map((t) => [t.id, t.hue]));

// Leaderboard weightings — shown publicly in "How this is sourced" so every score is explainable.
export const WEIGHTS = {
  models: { reasoning: 0.3, coding: 0.25, speed: 0.15, cost: 0.15, context: 0.15 },
  products: { capability: 0.3, integration: 0.25, governance: 0.25, value: 0.2 },
  tools: { autonomy: 0.3, codeQuality: 0.3, integration: 0.2, ecosystem: 0.2 },
};
export const BOARD_META = {
  models: { label: 'Frontier models', tagline: 'Reasoning, coding, speed, cost, context' },
  products: { label: 'Enterprise products', tagline: 'Capability, integration, governance, value' },
  tools: { label: 'Dev tools & agents', tagline: 'Autonomy, code quality, integration, ecosystem' },
};

export const SOURCES = [
  { name: 'OpenAI', url: 'https://openai.com/news', kind: 'newsroom' },
  { name: 'Anthropic', url: 'https://www.anthropic.com/news', kind: 'newsroom' },
  { name: 'Google DeepMind', url: 'https://deepmind.google/discover/blog', kind: 'newsroom' },
  { name: 'Microsoft AI', url: 'https://blogs.microsoft.com/ai', kind: 'newsroom' },
  { name: 'Meta AI', url: 'https://ai.meta.com/blog', kind: 'newsroom' },
  { name: 'Mistral AI', url: 'https://mistral.ai/news', kind: 'newsroom' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/category/artificial-intelligence', kind: 'newswire' },
  { name: 'The Verge', url: 'https://www.theverge.com/ai-artificial-intelligence', kind: 'newswire' },
  { name: 'The Information', url: 'https://www.theinformation.com', kind: 'newswire' },
  { name: 'Reuters', url: 'https://www.reuters.com/technology/artificial-intelligence', kind: 'newswire' },
  { name: 'Artificial Analysis', url: 'https://artificialanalysis.ai', kind: 'benchmark' },
  { name: 'LMArena', url: 'https://lmarena.ai', kind: 'benchmark' },
  { name: 'SWE-bench', url: 'https://www.swebench.com', kind: 'benchmark' },
];

// Vendor directory (logos resolve via logo.dev by domain, as the catalogue already does).
export const VENDORS = [
  { id: 'openai', name: 'OpenAI', domain: 'openai.com' },
  { id: 'anthropic', name: 'Anthropic', domain: 'anthropic.com' },
  { id: 'google', name: 'Google', domain: 'google.com' },
  { id: 'microsoft', name: 'Microsoft', domain: 'microsoft.com' },
  { id: 'meta', name: 'Meta', domain: 'meta.com' },
  { id: 'mistral', name: 'Mistral AI', domain: 'mistral.ai' },
  { id: 'xai', name: 'xAI', domain: 'x.ai' },
  { id: 'nvidia', name: 'NVIDIA', domain: 'nvidia.com' },
  { id: 'deepseek', name: 'DeepSeek', domain: 'deepseek.com' },
];

// --- Curated content (refreshed each loop pass from the roster), generated into ai-intel-content.mjs.
// Each briefing carries its real source link + date + Greatstone's house "take". ---
export { META, BRIEFINGS, BOARDS } from './ai-intel-content.mjs';
import { META, BRIEFINGS, BOARDS } from './ai-intel-content.mjs';

// Compose the object the hub consumes.
export function buildIntel() {
  return { meta: META, topics: TOPICS, weights: WEIGHTS, boardMeta: BOARD_META, sources: SOURCES, vendors: VENDORS, briefings: BRIEFINGS, boards: BOARDS };
}

export default buildIntel;
