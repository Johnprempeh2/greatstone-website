// GRE-1936: compare the live site's published pages with GSAM's pages for release 1.
// Run `npm run build:next` (or `node next-proof/scripts/export-pages.mjs`) first so
// data/release.json is the current live content, then:
//   node next-proof/scripts/plan-gsam-release-1.mjs <gsam-site-id> [--json <file>]
//   node next-proof/scripts/plan-gsam-release-1.mjs <gsam-site-id> --apply <record-file>
// Without --apply it is read-only. --apply saves the live content as a new GSAM draft
// revision on each changed page (GRE-3711) and writes the revision each one replaced to
// <record-file>, for the restore after publish. It never approves or publishes.
// Needs GSAM_API_URL, GSAM_API_KEY and GSAM_COMPANY_ID.
import { writeFile } from 'node:fs/promises';
import release from '../data/release.json' with { type: 'json' };
import { applyPlan, describePlan, planRelease1 } from '../release-1-sync.mjs';

const [siteId, flag, output] = process.argv.slice(2);
const { GSAM_API_URL, GSAM_API_KEY, GSAM_COMPANY_ID, GSAM_RUN_ID } = process.env;
if (!siteId || !GSAM_API_URL || !GSAM_API_KEY || !GSAM_COMPANY_ID || (flag && !output)) {
  throw new Error('Usage: plan-gsam-release-1.mjs <gsam-site-id> [--json <file> | --apply <record-file>], with GSAM_API_URL, GSAM_API_KEY and GSAM_COMPANY_ID set');
}
const base = `${GSAM_API_URL.replace(/\/$/, '').replace(/\/api$/, '')}/api/companies/${GSAM_COMPANY_ID}/website/sites/${siteId}`;
const headers = { Authorization: `Bearer ${GSAM_API_KEY}`, ...(GSAM_RUN_ID ? { 'X-Paperclip-Run-Id': GSAM_RUN_ID } : {}) };
const get = async (path) => {
  const response = await fetch(`${base}${path}`, { headers });
  if (!response.ok) throw new Error(`GSAM ${path}: ${response.status}`);
  return response.json();
};

const listed = await get('/pages');
const pages = await Promise.all((Array.isArray(listed) ? listed : listed.pages).map((page) => get(`/pages/${page.id}`)));
const plan = planRelease1(release, pages);
console.log(describePlan(plan));
const count = (action) => plan.filter((entry) => entry.action === action).length;
console.log(`\n${plan.length} live pages: ${count('unchanged')} unchanged, ${count('update')} to update, ${count('missing')} missing in GSAM`);
if (flag === '--json') await writeFile(output, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });

if (flag === '--apply') {
  const save = async (entry) => {
    const response = await fetch(`${base}/pages/${entry.pageId}/content`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevisionId: entry.baseRevisionId,
        content: entry.content,
        changeSummary: `GRE-1936 release 1: live content of ${entry.path}`,
      }),
    });
    return response.json().catch(() => ({ state: 'failed', message: `GSAM answered ${response.status}` }));
  };
  const { ok, record } = await applyPlan(plan, save);
  await writeFile(output, `${JSON.stringify({ siteId, appliedAt: new Date().toISOString(), record }, null, 2)}\n`);
  for (const entry of record) {
    console.log(`${entry.gsamSlug}: ${entry.action}${entry.previousRevisionId ? ` (replaced ${entry.previousRevisionId})` : ''}${entry.message ? ` ${entry.message}` : ''}`);
  }
  if (!ok) process.exitCode = 1;
}
