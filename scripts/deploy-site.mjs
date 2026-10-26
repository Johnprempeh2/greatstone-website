import { spawnSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SITE_CONTRACT } from '../next-proof/site-contract.mjs';

const sites = new Map([
  ['greatstone-home', '3b1e97e6-e184-4251-badd-deed532be3ab'],
  ['gre1795-website-db-staging', '8c1135a6-6f8e-43f4-b9b2-3c4d5b6a36cb'],
]);
const mikeyId = '8950d7f0-4d3b-40b0-93d8-b67aead0a2f7';
const johnId = 'UGJwnXKO0P0yBvVh4krv4LH3EThDwrRP';
const [mode, site, prNumber] = process.argv.slice(2);
// A config refresh re-uploads to production, so it shares production's marker and lock.
const channel = mode === 'refresh' ? 'prod' : mode;
const issueId = process.env.GSAM_TASK_ID;
const token = process.env.NETLIFY_AUTH_TOKEN;
const base = process.env.GSAM_API_URL?.replace(/\/?api\/?$/, '').replace(/\/$/, '');

function command(bin, args, cwd) {
  const result = spawnSync(bin, args, { encoding: 'utf8', cwd });
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

// A staging card names one main commit, and main often moves before the deploy runs.
// A later main still counts as approved when nothing between the two commits touches
// migrations, functions, server routes, auth, secrets, dependencies, build config or
// these scripts. Anything that matches here needs a card for the exact commit.
function protectedFile(file) {
  return /^(?:netlify|supabase|scripts|\.github)\//.test(file) || /(?:^|\/)netlify[^/]*\.toml$/.test(file) ||
    /^(?:middleware\.[cm]?[jt]s|package(?:-lock)?\.json|next\.config\.[cm]?[jt]s|vite\.config\.[cm]?js|public\/_headers)$/.test(file) ||
    /(?:^|\/)\.env/.test(file) || /\.sql$/.test(file) ||
    /^app\/(?:.+\/)?route\.[cm]?[jt]sx?$/.test(file) || /^app\/api\//.test(file) ||
    /auth|password|passwd|credential|secret|login|sign-?in/i.test(file);
}

function frontEndOnly(files) {
  return files.length > 0 && files.every((file) => !protectedFile(file));
}

async function comments() {
  if (!base || !process.env.GSAM_API_KEY || !issueId) throw new Error('GSAM task credentials are required');
  return json(`${base}/api/issues/${issueId}/comments`, process.env.GSAM_API_KEY);
}

async function stagingCardApproved(sha, exact = false) {
  if (!base || !process.env.GSAM_API_KEY || !issueId) throw new Error('GSAM task credentials are required');
  const cards = await json(`${base}/api/issues/${issueId}/interactions`, process.env.GSAM_API_KEY);
  for (const card of cards) {
    const approvedSha = /^confirmation:GRE-\d+:staging-deploy:([0-9a-f]{40})(?::v[1-9]\d*)?$/.exec(card.idempotencyKey || '')?.[1];
    if (card.kind !== 'request_confirmation' || card.status !== 'accepted' ||
        card.requestedResolverPolicy !== 'human_only' || card.effectiveResolverPolicy !== 'human_only' ||
        !card.resolvedByUserId || card.resolvedByAgentId || !approvedSha ||
        !card.payload?.detailsMarkdown?.includes(`Approve production deploy: ${site} ${approvedSha}`)) continue;
    if (approvedSha === sha) return true;
    if (exact) continue;
    const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', approvedSha, sha]);
    if (ancestor.status !== 0) continue;
    const files = command('git', ['diff', '--name-only', '--no-renames', approvedSha, sha]).split('\n').filter(Boolean);
    if (files.length && files.every((file) =>
      ['scripts/deploy-site.mjs', 'scripts/deploy-site.test.mjs', 'README.md'].includes(file))) return true;
    if (frontEndOnly(files)) {
      console.log(`Staging card for ${approvedSha} covers ${sha}: ${files.length} front-end file(s) since, no protected paths`);
      return true;
    }
  }
  return false;
}

// A task worktree cannot check out main while the primary checkout holds it, so a
// detached HEAD is accepted when it is exactly the remote main commit.
function onMain(sha) {
  const branch = command('git', ['branch', '--show-current']);
  if (branch === 'main') return true;
  if (branch) return false;
  return command('git', ['ls-remote', 'origin', 'refs/heads/main']).split(/\s/)[0] === sha;
}

async function gate(sha) {
  if (mode === 'prod') {
    if (!onMain(sha)) throw new Error('production requires main (or a detached HEAD at origin main)');
    const approval = `Approve production deploy: ${site} ${sha}`;
    const exactComment = (await comments()).some((c) => c.authorType === 'user' && c.body.trim() === approval);
    const stagingCard = !exactComment && site === 'gre1795-website-db-staging' && await stagingCardApproved(sha);
    if (!exactComment && !stagingCard)
      throw new Error(site === 'gre1795-website-db-staging'
        ? `production refused: this task needs an accepted human-only staging card for ${site} and ${sha}, or the exact approval comment`
        : `production refused: a person must comment exactly "${approval}" on this task`);
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
  const marker = new RegExp(`^gsam-source:${channel}:${channel === 'preview' ? `${prNumber}:` : ''}([0-9a-f]{40})$`);
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

// Locks live in the git common dir: every worktree of this repo shares it, while
// the OS temp dir is private to each agent run. Previews lock per PR, so a preview
// for one PR never stops another PR's preview.
function lockDir() {
  const common = resolve(command('git', ['rev-parse', '--git-common-dir']));
  return join(common, 'gsam-deploy-locks', `${site}-${channel}${channel === 'preview' ? `-${prNumber}` : ''}`);
}

async function lockAndDeploy(sha, cwd) {
  const dir = lockDir();
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
    const args = ['deploy', '--site', sites.get(site), '--message', `gsam-source:${channel}:${channel === 'preview' ? `${prNumber}:` : ''}${sha}`];
    if (channel === 'prod') args.push('--prod');
    console.log(`Deploying ${site} ${mode} at ${sha}`);
    const child = spawn('netlify', args, { stdio: 'inherit', signal: controller.signal, cwd });
    const code = await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); });
    if (code !== 0) throw new Error(`netlify deploy exited ${code}`);
    if (JSON.parse(await readFile(file, 'utf8')).own !== own) throw new Error('newer run superseded this deploy');
  } finally {
    try { if (JSON.parse(await readFile(file, 'utf8')).own === own) await rm(file); } catch { /* newer run owns it */ }
  }
}

// Netlify applies a changed environment variable only on a new upload, and main() skips
// a commit that is already live. This staging-only path re-uploads the live commit after
// a config change. The guard runs from origin main, but the upload is an export of the
// live commit's tree, so main's newer code never rides along. It needs the accepted
// human-only card for exactly that commit; guard-only drift does not count here.
async function refreshStaging(sha) {
  if (site !== 'gre1795-website-db-staging') throw new Error('config refresh is only for gre1795-website-db-staging');
  if (command('git', ['ls-remote', 'origin', 'refs/heads/main']).split(/\s/)[0] !== sha)
    throw new Error('config refresh requires a checkout at exactly origin main');
  const live = await lastDeployedCommit();
  if (!live) throw new Error(`config refresh refused: ${site} has no guarded production upload to refresh`);
  if (spawnSync('git', ['merge-base', '--is-ancestor', live, sha]).status !== 0)
    throw new Error(`config refresh refused: live commit ${live} is not on main`);
  if (!await stagingCardApproved(live, true))
    throw new Error(`config refresh refused: this task needs an accepted human-only staging card for ${site} and ${live}`);
  const dir = await mkdtemp(join(tmpdir(), 'gsam-refresh-'));
  try {
    const tree = join(dir, 'tree');
    await mkdir(tree);
    command('git', ['archive', '--format=tar', '-o', join(dir, 'source.tar'), live]);
    command('tar', ['-xf', join(dir, 'source.tar'), '-C', tree]);
    command('npm', ['ci', '--no-audit', '--no-fund', '--loglevel=error'], tree);
    console.log(`Refreshing ${site} config: re-uploading live commit ${live}`);
    await lockAndDeploy(live, tree);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  if (mode === 'inspect' && sites.has(site)) return inspectSite();
  if (!['preview', 'prod', 'refresh'].includes(mode) || !sites.has(site)) throw new Error('usage: npm run deploy:preview|deploy:prod -- <allowed site> [PR number]');
  command('node', ['contracts/check.mjs', '--site-speaks', String(SITE_CONTRACT)]);
  if (command('git', ['status', '--porcelain'])) throw new Error('deploy requires a clean checkout');
  const sha = command('git', ['rev-parse', 'HEAD']);
  if (mode === 'refresh') return refreshStaging(sha);
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
