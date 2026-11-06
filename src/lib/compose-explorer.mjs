// ComposeExplorer model (GRE-3407): pure helpers so the block stays thin and the rules are testable.
// Services are matched by slug against the live catalogue; a slug the catalogue no longer has is dropped, and a
// problem left with no services is hidden, so a catalogue edit can never light up a ghost.
import { serviceSlug } from '../store/services.mjs';

// The source file lists slugs; the studio's array field stores { slug } rows. Both resolve the same way.
const slugOf = (s) => (typeof s === 'string' ? s : (s && s.slug) || '');

export function resolveProblems(problems, services) {
  const known = new Set((services || []).map(serviceSlug));
  return (Array.isArray(problems) ? problems : [])
    .map((p) => ({ ...p, services: [...new Set(((p && p.services) || []).map(slugOf))].filter((slug) => known.has(slug)) }))
    .filter((p) => p.id && p.title && p.services.length);
}

// The catalogue grouped by category, in the catalogue's category order (unknown categories appended).
export function groupServices(services, categories) {
  const groups = new Map();
  (categories || []).forEach((c) => groups.set(c.name, []));
  for (const s of services || []) {
    const c = (s && s.category) || 'Other';
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(s);
  }
  return [...groups].filter(([, list]) => list.length).map(([name, list]) => ({ name, services: list }));
}

export function toggleSlug(selected, slug) {
  const next = new Set(selected);
  if (next.has(slug)) next.delete(slug); else next.add(slug);
  return next;
}

// What the summary shows: the chosen services in catalogue order, and the areas (categories) they touch.
export function summarise(selected, services) {
  const chosen = (services || []).filter((s) => selected.has(serviceSlug(s)));
  const areas = [...new Set(chosen.map((s) => s.category || 'Other'))];
  return { chosen, count: chosen.length, areas };
}

// With a problem picked, the message names it ("For too much manual admin: 6 services across 3 areas."), so the answer
// still says what it answers once the tapped card has scrolled away on a phone.
export function countMessage({ count, areas }, problemTitle) {
  if (!count) return 'No services selected.';
  const s = count === 1 ? 'service' : 'services';
  const a = areas.length === 1 ? 'area' : 'areas';
  if (!problemTitle) return `${count} ${s} selected, across ${areas.length} ${a}.`;
  const t = /^[A-Z][a-z]/.test(problemTitle) ? problemTitle[0].toLowerCase() + problemTitle.slice(1) : problemTitle;
  return `For ${t}: ${count} ${s} across ${areas.length} ${a}.`;
}
