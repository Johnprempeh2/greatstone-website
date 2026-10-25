import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const EDITOR_SITE_ID = 'b546812d-8d25-49dc-94c2-e04a5b31bde4';
export const EDITOR_CONTRACT = '2';
const EDITOR_URL = 'https://gsam-editor--greatstone-home.netlify.app/editor/home';

function metaContent(html, name) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attributes = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
    if (attributes.name === name) return attributes.content;
  }
  return undefined;
}

export function checkEditorHtml(html) {
  const siteId = metaContent(html, 'gsam-editor-site-id');
  const contract = metaContent(html, 'gsam-editor-contract');
  if (siteId !== EDITOR_SITE_ID || contract !== EDITOR_CONTRACT) {
    throw new Error(`Editor alias mismatch: siteId=${siteId || 'missing'}, contract=${contract || 'missing'}; expected ${EDITOR_SITE_ID}, ${EDITOR_CONTRACT}`);
  }
  return { siteId, contract };
}

export async function verifyEditorAlias(fetchPage = fetch) {
  const response = await fetchPage(EDITOR_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Editor alias returned HTTP ${response.status}`);
  return checkEditorHtml(await response.text());
}

async function main() {
  const [site, option] = process.argv.slice(2);
  if (!site || (option && option !== '--check-only')) throw new Error('Usage: node scripts/deploy-editor-alias.mjs <Netlify site UUID> [--check-only]');
  if (!option) {
    if (!process.env.NETLIFY_AUTH_TOKEN) throw new Error('NETLIFY_AUTH_TOKEN is required');
    const config = await readFile('netlify.toml', 'utf8');
    if (!config.includes(`GSAM_EDITOR_SITE_ID = "${EDITOR_SITE_ID}"`)) throw new Error('Editor build config has the wrong GSAM site ID');
    const result = spawnSync('npx', ['--yes', 'netlify-cli', 'deploy', '--alias', 'gsam-editor', '--no-build', '--dir', '.netlify/static', '--site', site], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Netlify alias deploy failed (${result.status})`);
  }
  const result = await verifyEditorAlias();
  console.log(`Editor alias verified: siteId=${result.siteId}, contract=${result.contract}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
