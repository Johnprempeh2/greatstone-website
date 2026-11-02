// Front door package (GRE-468, spec GRE-416 rev 2 §4 "Handover at sale", B8): the visitor's three employees
// as an Agent Companies package (`agentcompanies/v1-draft`), so setup imports them into the client's new
// company with the import GS Agentic Manager has today. No platform change.
// The package is a file map { path: markdown }: COMPANY.md plus agents/<slug>/AGENTS.md for each employee.
// The edge function saves it on the lead row at S5 (column agent_package, migration 0034); the studio leads
// tab downloads it as a .zip (src/lib/package-zip.mjs), which is what the import page takes.
// Pure ESM with no Deno or Node APIs, like the other front-door modules.

export const PACKAGE_SCHEMA = 'agentcompanies/v1-draft';

// Frontmatter values are written as JSON strings. JSON is valid YAML, and the importer's small YAML reader
// parses a value that starts with a quote as JSON, so a colon, a hash or a quote in a name cannot break it.
const q = (v) => JSON.stringify(v == null ? null : v);
const frontmatter = (fields) =>
  '---\n' + Object.entries(fields).filter(([, v]) => v !== undefined).map(([k, v]) => k + ': ' + q(v)).join('\n') + '\n---\n';

// Markdown body text comes from the visitor and the model. One line each, and no leading characters that
// would turn a line into a heading, a list or a frontmatter fence.
const line = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().replace(/^[#>\-*+|=`~]+\s*/, '');
const list = (v) => (Array.isArray(v) ? v : []).map(line).filter(Boolean);

export function slugify(s, fallback) {
  const slug = String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
  return slug || fallback;
}

// The lead first, then the other two in the order the proposal gave them. Slugs are unique in the package.
function slotAgents(agents) {
  const all = (Array.isArray(agents) ? agents : []).slice(0, 3);
  const ordered = [...all.filter((a) => a && a.is_lead === true).slice(0, 1), ...all.filter((a) => !(a && a.is_lead === true))];
  const used = new Set();
  return ordered.map((a, i) => {
    let slug = slugify(a && a.name, 'employee-' + (i + 1));
    for (let n = 2; used.has(slug); n++) slug = slugify(a && a.name, 'employee') + '-' + n;
    used.add(slug);
    return { agent: a || {}, slug };
  });
}

function agentDoc({ agent, slug }, leadSlug, company) {
  const name = line(agent.name) || slug;
  const role = line(agent.role);
  const isLead = slug === leadSlug;
  const body = [
    '# ' + name,
    '',
    role ? name + ' is the ' + role.charAt(0).toLowerCase() + role.slice(1) + ' at ' + company + '.' : '',
    isLead ? name + ' leads the team: guards the brand and the standard of the work, and checks what the other two produce before it goes out.' : '',
    '',
    '## Personality',
    '',
    ...list(agent.personality).map((t) => '- ' + t),
    '',
    '## First tasks',
    '',
    ...list(agent.first_tasks).map((t) => '- ' + t),
    '',
    '## Works with the team',
    '',
    line(agent.works_with),
  ];
  return frontmatter({
    name,
    title: role || undefined,
    slug,
    reportsTo: isLead || !leadSlug ? null : leadSlug,
  }) + '\n' + body.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim() + '\n';
}

function companyDoc({ intake, slots, slug }) {
  const company = line(intake.company);
  const words = list(intake.words);
  const body = [
    '# ' + company,
    '',
    'The first three employees proposed for ' + company + ' at the Greatstone website front door.',
    '',
    '- Industry: ' + (line(intake.industry) || 'not given'),
    '- Team size: ' + (line(intake.teamSize) || 'not given'),
    '- Brand words: ' + (words.length ? words.join(', ') : 'not given'),
    '',
    '## The team',
    '',
    ...slots.map(({ agent, slug: s }, i) =>
      '- ' + (line(agent.name) || s) + (i === 0 && agent.is_lead === true ? ' (lead)' : '') + ': ' + line(agent.role) + ' (agents/' + s + '/AGENTS.md)'),
  ];
  return frontmatter({
    schema: PACKAGE_SCHEMA,
    kind: 'company',
    slug,
    name: company,
    description: 'First three employees from the website front door.',
  }) + '\n' + body.join('\n') + '\n';
}

// intake: normaliseIntake()'s output { industry, company, words, teamSize }. agents: a validated 'ok'
// proposal's agents (GRE-466 schema). Returns the file map, or null when there is nothing to package.
export function buildAgentPackage({ intake, agents }) {
  if (!intake || !line(intake.company) || !Array.isArray(agents) || !agents.length) return null;
  const slots = slotAgents(agents);
  const leadSlug = slots[0] && slots[0].agent.is_lead === true ? slots[0].slug : null;
  const company = line(intake.company);
  const files = { 'COMPANY.md': companyDoc({ intake, slots, slug: slugify(company, 'front-door-team') }) };
  for (const s of slots) files['agents/' + s.slug + '/AGENTS.md'] = agentDoc(s, leadSlug, company);
  return files;
}

// The .zip's folder name and file name for a lead's package.
export const packageFolder = (companyName) => slugify(companyName, 'front-door-team') + '-team';
