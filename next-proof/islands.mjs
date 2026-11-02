// GRE-3776: the island tag contract for schema 2 (HTML) pages.
// Page HTML places and configures an island with <gs-island name="…" data-…>; the engine renders it.
// Only names listed here render, and only the data attributes listed for that name reach the island.
// Every attribute value must match its pattern; anything else is dropped by the sanitiser.

const formKey = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const ISLANDS = {
  'enquiry-form': { block: 'BookDeepDive', attributes: { 'data-form': { prop: 'formKey', pattern: formKey } } },
  'ai-baseline-survey': { block: 'AiBaselineSurvey', attributes: { 'data-form': { prop: 'formKey', pattern: formKey } } },
  'ai-cost-calculator': { block: 'AiCostCalculator', attributes: { 'data-form': { prop: 'formKey', pattern: formKey } } },
  'cookie-settings': { component: 'CookieSettings', attributes: {} },
  // GRE-3778: the frozen landing (Two Doors, v15) renders its published blocks unchanged.
  'two-doors-landing': { component: 'TwoDoorsLanding', attributes: {} },
};

// Returns the island's props and accepted attributes, or null when the name is not registered.
// `removed` collects each attribute the registry refused.
export function islandProps(name, attributes, removed = []) {
  const island = Object.hasOwn(ISLANDS, name) ? ISLANDS[name] : null;
  if (!island) return null;
  const props = {};
  const accepted = {};
  for (const [attribute, value] of attributes) {
    if (attribute === 'name') continue;
    const rule = Object.hasOwn(island.attributes, attribute) ? island.attributes[attribute] : null;
    if (rule && rule.pattern.test(value)) { props[rule.prop] = value; accepted[attribute] = value; }
    else removed.push(`gs-island[${name}] @${attribute}`);
  }
  return { props, attributes: accepted };
}
