// GRE-1936: compare the live site's published pages with GSAM's pages for release 1.
// Read-only. Run `npm run build:next` (or `node next-proof/scripts/export-pages.mjs`)
// first so data/release.json is the current live content, then:
//   node next-proof/scripts/plan-gsam-release-1.mjs <gsam-site-id> [--json <file>]
// Needs GSAM_API_URL, GSAM_API_KEY and GSAM_COMPANY_ID. It never saves, approves or publishes.
import { writeFile } from 'node:fs/promises';
import release from '../data/release.json' with { type: 'json' };
import { describePlan, planRelease1 } from '../release-1-sync.mjs';

const [siteId, flag, output] = process.argv.slice(2);
const { GSAM_API_URL, GSAM_API_KEY, GSAM_COMPANY_ID } = process.env;
if (!siteId || !GSAM_API_URL || !GSAM_API_KEY || !GSAM_COMPANY_ID) {
  throw new Error('Usage: plan-gsam-release-1.mjs <gsam-site-id> [--json <file>], with GSAM_API_URL, GSAM_API_KEY and GSAM_COMPANY_ID set');
}
const base = `${GSAM_API_URL.replace(/\/$/, '').replace(/\/api$/, '')}/api/companies/${GSAM_COMPANY_ID}/website/sites/${siteId}`;
const get = async (path) => {
  const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${GSAM_API_KEY}` } });
  if (!response.ok) throw new Error(`GSAM ${path}: ${response.status}`);
  return response.json();
};

const listed = await get('/pages');
const pages = await Promise.all((Array.isArray(listed) ? listed : listed.pages).map((page) => get(`/pages/${page.id}`)));
const plan = planRelease1(release, pages);
console.log(describePlan(plan));
const count = (action) => plan.filter((entry) => entry.action === action).length;
console.log(`\n${plan.length} live pages: ${count('unchanged')} unchanged, ${count('update')} to update, ${count('missing')} missing in GSAM`);
if (flag === '--json' && output) await writeFile(output, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
