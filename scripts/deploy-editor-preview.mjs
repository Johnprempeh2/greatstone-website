import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkEditorHtml } from './deploy-editor-alias.mjs';
import { EDITOR_PREVIEW_ALIAS, EDITOR_PREVIEW_HOST, EDITOR_PREVIEW_ORIGIN } from '../next-proof/editor-preview-target.mjs';

export const EDITOR_PREVIEW_URL = `https://${EDITOR_PREVIEW_HOST}/editor/home`;

export async function verifyEditorPreview(fetchPage = fetch, commit = process.env.GSAM_ENGINE_COMMIT) {
  const response = await fetchPage(EDITOR_PREVIEW_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Editor preview returned HTTP ${response.status}`);
  const csp = response.headers.get('content-security-policy') || '';
  const ancestors = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith('frame-ancestors '));
  if (ancestors !== `frame-ancestors ${EDITOR_PREVIEW_ORIGIN}` || csp.includes("'unsafe-eval'")) {
    throw new Error(`Editor preview frame policy mismatch: ${csp}`);
  }
  return checkEditorHtml(await response.text(), commit);
}

async function main() {
  const [site, option] = process.argv.slice(2);
  if (!site || (option && option !== '--check-only')) throw new Error('Usage: node scripts/deploy-editor-preview.mjs <Netlify site UUID> [--check-only]');
  if (!/^[a-f0-9-]{36}$/i.test(site)) throw new Error('Pass the existing greatstone-home Netlify site UUID.');
  if (!/^[a-f0-9]{40}$/i.test(process.env.GSAM_ENGINE_COMMIT || '')) throw new Error('GSAM_ENGINE_COMMIT must be the reviewed 40-character engine SHA.');
  if (!option) {
    if (!process.env.NETLIFY_AUTH_TOKEN) throw new Error('NETLIFY_AUTH_TOKEN is required');
    const config = await readFile('next-proof/editor-preview-config.mjs', 'utf8');
    if (!config.includes(EDITOR_PREVIEW_HOST) || !config.includes(EDITOR_PREVIEW_ORIGIN)) throw new Error('Build is not the isolated preview package.');
    const result = spawnSync('npx', ['--yes', 'netlify-cli', 'deploy', '--alias', EDITOR_PREVIEW_ALIAS, '--no-build', '--dir', '.netlify/static', '--site', site], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Netlify preview alias deploy failed (${result.status})`);
  }
  const verified = await verifyEditorPreview();
  console.log(`Preview editor verified: ${EDITOR_PREVIEW_URL}, siteId=${verified.siteId}, engine.commit=${verified.commit}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
