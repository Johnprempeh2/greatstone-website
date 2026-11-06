// Print every old URL, its sitemap decision and where it lands today, as a Markdown table (GRE-1822).
//   node next-proof/scripts/legacy-table.mjs
import release from '../data/release.json' with { type: 'json' };
import { SITEMAP_REVISION } from '../legacy-decisions.mjs';
import { legacyLanding, legacyPaths } from '../legacy-routes.mjs';

const pages = release.pages.map((page) => page.path);
const counts = {};
console.log(`| Old URL | Sitemap action | Sitemap target | Lands on today | State |\n| --- | --- | --- | --- | --- |`);
for (const path of legacyPaths) {
  const { to, state, decision } = legacyLanding(path, pages);
  counts[state] = (counts[state] || 0) + 1;
  console.log(`| \`${path}\` | ${decision.action} | \`${decision.target}\` | \`${to}\` | ${state} |`);
}
console.log(`\nSitemap revision ${SITEMAP_REVISION}. ${legacyPaths.length} old URLs: ` +
  Object.entries(counts).map(([state, count]) => `${count} ${state}`).join(', ') + '.');
