import { spawnSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const sites = new Set(['greatstone-home', 'gre1795-website-db-staging']);
const mikeyId = '8950d7f0-4d3b-40b0-93d8-b67aead0a2f7';
const johnId = 'UGJwnXKO0P0yBvVh4krv4LH3EThDwrRP';
const [mode, site, prNumber] = process.argv.slice(2);
const issueId = process.env.GSAM_TASK_ID;
const token = process.env.NETLIFY_AUTH_TOKEN;
const base = process.env.GSAM_API_URL?.replace(/\/?api\/?$/, '').replace(/\/$/, '');

function command(bin, args) {
  const result = spawnSync(bin, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${bin} ${args[0]} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

async function json(url, auth) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${auth}` } });
  if (!response.ok) throw new Error(`GET ${new URL(url).pathname}: ${response.status}`);
  return response.json();
}

function onlyNonSiteFiles(files) {
  return files.length > 0 && files.every((file) =>
    /^(?:docs\/|\.github\/|README\.md$|HANDOVER\.md$|DATA-MODEL\.md$)/.test(file) ||
    /(?:^|\/)(?:__tests__\/|[^/]+\.test\.[cm]?[jt]sx?$)/.test(file));
}

async function comments() {
  if (!base || !process.env.GSAM_API_KEY || !issueId) throw new Error('GSAM task credentials are required');
  return json(`${base}/api/issues/${issueId}/comments`, process.env.GSAM_API_KEY);
}

async function gate(sha) {
  if (mode === 'prod') {
    if (command('git', ['branch', '--show-current']) !== 'main') throw new Error('production requires main');
    const approval = `Approve production deploy: ${site} ${sha}`;
    if (!(await comments()).some((c) => c.authorType === 'user' && c.body.trim() === approval))
      throw new Error(`production refused: a person must comment exactly "${approval}" on this task`);
    return null;
  }
  if (!/^\d+$/.test(prNumber || '')) throw new Error('preview requires a PR number');
  const pr = JSON.parse(command('gh', ['pr', 'view', prNumber, '--json', 'number,state,isDraft,headRefOid,baseRefOid,labels']));
  if (pr.state !== 'OPEN' || pr.isDraft || pr.headRefOid !== sha) throw new Error('preview requires an open, ready PR at HEAD');
  const labelled = pr.labels.some((label) => label.name === 'preview');
  const ready = labelled || (await comments()).some((c) =>
    ((c.authorType === 'user' && c.authorUserId === johnId) || c.authorAgentId === mikeyId) &&
    c.body.trim() === `Preview ready for PR #${pr.number}`);
  if (!ready) throw new Error('preview refused: add the preview label or get Mikey or John to mark the PR ready');
  return pr.baseRefOid;
}

async function lastDeployedCommit() {
  if (!token) throw new Error('NETLIFY_AUTH_TOKEN is required');
  const api = process.env.NODE_ENV === 'test' && token === 'test-token'
    ? process.env.NETLIFY_TEST_API_URL : 'https://api.netlify.com';
  const deploys = await json(`${api}/api/v1/sites/${site}.netlify.app/deploys?per_page=100`, token);
  const marker = new RegExp(`^gsam-source:${mode}:${mode === 'preview' ? `${prNumber}:` : ''}([0-9a-f]{40})$`);
  for (const deploy of deploys) {
    const match = marker.exec(deploy.title || '');
    if (deploy.state === 'ready' && match) return match[1];
  }
  return null;
}

async function inspectSite() {
  if (!token) throw new Error('NETLIFY_AUTH_TOKEN is required');
  const response = await json(`https://api.netlify.com/api/v1/sites/${site}.netlify.app/deploys?per_page=100`, token);
  const ready = response.find((deploy) => deploy.state === 'ready' && /^gsam-source:(preview|prod):/.test(deploy.title || ''));
  console.log(`${site}: Netlify lookup succeeded; latest guarded ready deploy: ${ready?.title || 'none'}`);
}

function processIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return null;
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'lstart=', '-o', 'command='], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

async function lockAndDeploy(sha) {
  const dir = join(tmpdir(), `greatstone-deploy-${site}-${mode}`);
  const own = randomUUID();
  const identity = processIdentity(process.pid);
  if (!identity || !identity.includes('deploy-site.mjs')) throw new Error('cannot verify deploy process identity');
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'owner.json');
  let previous;
  try { previous = JSON.parse(await readFile(file, 'utf8')); } catch { /* no earlier run */ }
  await writeFile(file, JSON.stringify({ pid: process.pid, identity, own }));
  if (previous?.pid && previous.pid !== process.pid && previous.identity &&
      previous.identity.includes('deploy-site.mjs') && processIdentity(previous.pid) === previous.identity) {
    try { process.kill(previous.pid, 'SIGTERM'); console.log(`Superseded stale run ${previous.pid}`); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  const controller = new AbortController();
  process.on('SIGTERM', () => controller.abort());
  try {
    if (JSON.parse(await readFile(file, 'utf8')).own !== own) throw new Error('newer run superseded this deploy');
    const args = ['deploy', '--site', site, '--message', `gsam-source:${mode}:${mode === 'preview' ? `${prNumber}:` : ''}${sha}`];
    if (mode === 'prod') args.push('--prod');
    console.log(`Deploying ${site} ${mode} at ${sha}`);
    const child = spawn('netlify', args, { stdio: 'inherit', signal: controller.signal });
    const code = await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); });
    if (code !== 0) throw new Error(`netlify deploy exited ${code}`);
    if (JSON.parse(await readFile(file, 'utf8')).own !== own) throw new Error('newer run superseded this deploy');
  } finally {
    try { if (JSON.parse(await readFile(file, 'utf8')).own === own) await rm(file); } catch { /* newer run owns it */ }
  }
}

async function main() {
  if (mode === 'inspect' && sites.has(site)) return inspectSite();
  if (!['preview', 'prod'].includes(mode) || !sites.has(site)) throw new Error('usage: npm run deploy:preview|deploy:prod -- <allowed site> [PR number]');
  if (command('git', ['status', '--porcelain'])) throw new Error('deploy requires a clean checkout');
  const sha = command('git', ['rev-parse', 'HEAD']);
  const fallback = await gate(sha);
  const baseline = await lastDeployedCommit() || fallback;
  if (baseline) {
    command('git', ['cat-file', '-e', `${baseline}^{commit}`]);
    const files = command('git', ['diff', '--name-only', baseline, sha]).split('\n').filter(Boolean);
    if (files.length === 0 || onlyNonSiteFiles(files)) {
      console.log(`Skipped ${site}: ${files.length ? 'docs, tests or CI only' : 'no changes'} since ${baseline}`);
      return;
    }
  }
  await lockAndDeploy(sha);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
