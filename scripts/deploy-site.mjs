import { spawnSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { SITE_CONTRACT } from '../next-proof/site-contract.mjs';

const sites = new Map([
  ['greatstone-home', '3b1e97e6-e184-4251-badd-deed532be3ab'],
  ['gre1795-website-db-staging', '8c1135a6-6f8e-43f4-b9b2-3c4d5b6a36cb'],
  ['gre3833-next-db-staging', '6689e558-855b-40b1-be45-c530531fed45'],
]);
// Staging sites take a staging card for a prod-mode upload. Greatstone website staging (gre3833) is the one
// staging site since GRE-4202. Staging holds the edits (John, 7 Nov): every merge to main goes there with no
// card (deploy:staging) on its own Netlify Database. Since the Next cutover decision (7 Nov) it holds the Next
// build, the site greatstoneint.com moves to, so its upload is the prepared Next copy of the commit.
// "Deploy these changes" promotes its commit.
const stagingSites = new Set(['gre1795-website-db-staging', 'gre3833-next-db-staging']);
const stagingSite = 'gre3833-next-db-staging';
// The public site runs the same Next build as staging (Next cutover step 4, through John's Deploy card).
const nextSites = new Set([stagingSite, 'greatstone-home']);
// The public pages and APIs a promote checks on the live site straight after the upload. A product page from the
// promoted release is checked too, and /shop must list a product (8 Nov: release 1 went live with 0 products).
export const PAGE_CHECKS = ['/', '/dev-tools', '/about', '/contact', '/shop', '/consultancy', '/_release'];
// The pages staging must serve before its release may go to the public site (GRE-4707), plus one product page
// and one vendor page taken from the release.
export const KEY_PAGES = ['/', '/shop', '/consultancy', '/consultancy/transformation-services', '/about', '/contact'];
export const API_CHECKS = ['/api/auth/get-session', '/api/catalogue', '/api/popularity', '/api/compose-problems'];
// The CLI build cannot read the catalogue as anon, so the Next build reads the live public catalogue over HTTP
// (the same projection /api/catalogue serves, public data only), and the release build still requires it.
const catalogueApi = 'https://greatstoneint.com/api/catalogue';
const mikeyId = '8950d7f0-4d3b-40b0-93d8-b67aead0a2f7';
const johnId = 'UGJwnXKO0P0yBvVh4krv4LH3EThDwrRP';
const [mode, site, prNumber] = process.argv.slice(2);
// A config refresh re-uploads to production, so it shares production's marker and lock.
// A rehearsal runs the public promote on staging, so it shares staging's marker and lock.
const channel = mode === 'refresh' ? 'prod' : mode === 'rehearse' ? 'staging' : mode;
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

// The weekly release card (GRE-2641) uses the `weekly-release` key. It covers staging like a
// staging card does, and it is the only card that can authorise the public site, for its exact SHA.
async function stagingCardApproved(sha, exact = false, mustName = null) {
  if (!base || !process.env.GSAM_API_KEY || !issueId) throw new Error('GSAM task credentials are required');
  const cards = await json(`${base}/api/issues/${issueId}/interactions`, process.env.GSAM_API_KEY);
  const kinds = site === 'greatstone-home' ? 'weekly-release' : 'staging-deploy|weekly-release';
  const key = new RegExp(`^confirmation:GRE-\\d+:(?:${kinds}):([0-9a-f]{40})(?::v[1-9]\\d*)?$`);
  for (const card of cards) {
    const approvedSha = key.exec(card.idempotencyKey || '')?.[1];
    if (card.kind !== 'request_confirmation' || card.status !== 'accepted' ||
        card.requestedResolverPolicy !== 'human_only' || card.effectiveResolverPolicy !== 'human_only' ||
        !card.resolvedByUserId || card.resolvedByAgentId || !approvedSha ||
        !card.payload?.detailsMarkdown?.includes(`Approve production deploy: ${site} ${approvedSha}`) ||
        (mustName && !card.payload.detailsMarkdown.includes(mustName))) continue;
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

// John's single cut-over card on GRE-2567 (plan step J) also covers the switch (step 6): the public site only, and
// only its exact SHA. It is the same card carrier-deploy.mjs publish checks, so the cut-over needs one approval.
async function cutoverCardApproved(sha) {
  if (site !== 'greatstone-home') return false;
  const cards = await json(`${base}/api/issues/${issueId}/interactions`, process.env.GSAM_API_KEY);
  const key = new RegExp(`^confirmation:GRE-2567:cutover:${sha}(?::v[1-9]\\d*)?$`);
  return cards.some((card) => card.kind === 'request_confirmation' && card.status === 'accepted' &&
    card.requestedResolverPolicy === 'human_only' && card.effectiveResolverPolicy === 'human_only' &&
    card.resolvedByUserId && !card.resolvedByAgentId && key.test(card.idempotencyKey || '') &&
    card.payload?.detailsMarkdown?.includes(`Approve cut-over: greatstone-home ${sha}`));
}

async function gate(sha, content = null) {
  if (mode === 'prod') {
    // The public site takes main, or the exact commit staging holds (a promote while main moved on).
    if (!onMain(sha) && !(site === 'greatstone-home' && await stagedCommit() === sha))
      throw new Error('production requires main (or a detached HEAD at origin main), or the commit on staging');
    // A content release rides with the commit only when the person's approval names it.
    const named = content ? contentLine(content) : null;
    const approval = `Approve production deploy: ${site} ${sha}${named ? ` with ${named}` : ''}`;
    const exactComment = (await comments()).some((c) => c.authorType === 'user' && c.body.trim() === approval);
    const stagingCard = !exactComment && (await stagingCardApproved(sha, site === 'greatstone-home', named) ||
      (!named && await cutoverCardApproved(sha)));
    if (!exactComment && !stagingCard)
      throw new Error(stagingSites.has(site)
        ? `production refused: this task needs an accepted human-only staging card for ${site} and ${sha}, or the exact approval comment`
        : `production refused: this task needs an accepted human-only weekly release card for ${site} and ${sha}${named ? ` naming "${named}"` : ''}, or a person must comment exactly "${approval}" on this task`);
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

async function lastDeployedCommit(name = site, from = channel) {
  if (!token) throw new Error('NETLIFY_AUTH_TOKEN is required');
  const api = process.env.NODE_ENV === 'test' && token === 'test-token'
    ? process.env.NETLIFY_TEST_API_URL : 'https://api.netlify.com';
  const deploys = await json(`${api}/api/v1/sites/${name}.netlify.app/deploys?per_page=100`, token);
  const marker = new RegExp(`^gsam-source:${from}:${from === 'preview' ? `${prNumber}:` : ''}([0-9a-f]{40})$`);
  for (const deploy of deploys) {
    const match = marker.exec(deploy.title || '');
    if (deploy.state === 'ready' && match) return match[1];
  }
  return null;
}

/** The commit staging serves now: its newest ready upload. */
function stagedCommit() {
  return lastDeployedCommit(stagingSite, 'staging');
}

async function netlifyApi(path, method = 'GET') {
  const api = process.env.NODE_ENV === 'test' && token === 'test-token' ? process.env.NETLIFY_TEST_API_URL : 'https://api.netlify.com';
  const response = await fetch(`${api}/api/v1${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status}`);
  return response.json();
}

async function status(url) {
  try { return (await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000) })).status; } catch { return 0; }
}

// The checked promote (Next cutover step 4). Netlify attaches the site's database only to an upload built as a
// production deploy (an upload built unpublished keeps "Auth database is not configured" even after it is
// published, found in the 7 Nov rehearsal), so the upload goes live at once and is checked there: the key pages
// and the APIs that need the database. If any fails, the deploy that was live before is put back at once. That
// earlier deploy stays on Netlify, so a person can also restore it by hand: its id is printed first.
async function checkLive({ deploy_id: deployId, deploy_url: deployUrl }, before, samples = []) {
  const siteId = sites.get(site);
  const live = process.env.NODE_ENV === 'test' ? deployUrl : site === 'greatstone-home' ? 'https://greatstoneint.com' : `https://${site}.netlify.app`;
  const failures = [];
  const pages = [...PAGE_CHECKS, ...samples];
  for (const path of [...pages, ...API_CHECKS]) if (await status(live + path) !== 200) failures.push(path);
  if (site === 'greatstone-home' && !failures.includes('/shop') && !listsProducts((await page(live + '/shop')).body))
    failures.push('/shop (0 products)');
  // A rehearsal can plant one failing check to prove the restore fires; the public promote never reads this.
  const planted = mode === 'rehearse' ? process.env.REHEARSE_FAIL_API : null;
  if (planted && !failures.includes(planted)) failures.push(`${planted} (planted)`);
  if (failures.length) {
    if (before) await netlifyApi(`/sites/${siteId}/deploys/${before}/restore`, 'POST');
    throw new Error(`${failures.join(', ')} failed after publishing ${deployId}; restored ${before}`);
  }
  console.log(`Published ${deployId}: ${pages.length} pages and ${API_CHECKS.length} APIs answered 200`);
}

/** A page fetched with redirects followed (a 308 to a 200 passes), with its body. */
async function page(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    return { status: response.status, body: await response.text(), headers: response.headers };
  } catch { return { status: 0, body: '', headers: new Headers() }; }
}

// The shop's product cards link to /product/<slug>; with 0 products it shows "Catalogue unavailable" instead.
const listsProducts = (html) => /href="\/product\/[^"]/.test(html);

/** The catalogue a published release carries: its products (offerings), categories and vendors. */
export function releaseCatalogue(release) {
  const rows = (key) => {
    const collection = release?.collections?.[key];
    return (Array.isArray(collection) ? collection : collection?.entries || []).map((entry) => entry?.fields?.data || {});
  };
  const products = rows('offerings');
  const vendors = rows('vendors');
  return { products: products.length, categories: rows('categories').length, vendors: vendors.length,
    product: products.find((item) => item.slug)?.slug || null, vendor: vendors.find((item) => item.slug)?.slug || null };
}

// The pre-Deploy gate (GRE-4707). On 8 Nov a Deploy put content release 1 on greatstoneint.com with no /consultancy
// and 0 products. Before anything uploads or the content pointer moves, staging's release must carry products,
// categories and vendors, and staging (which serves that release) must answer 200 on the key pages, one product
// page and one vendor page. It only reads; any problem refuses the Deploy with greatstone-home untouched.
// Returns the product and vendor pages, which the live check repeats after the upload.
async function checkStagedRelease(staged) {
  const refuse = (problems) => new Error(`Deploy refused before upload: ${problems.join('; ')}. Nothing changed on greatstone-home.`);
  if (!staged) throw refuse(["staging's store has no content release"]);
  const file = await (await contentStore(stagingSite)).get(staged.key);
  if (!file) throw refuse([`staging has no ${staged.key} for content release ${staged.release}`]);
  if (createHash('sha256').update(file).digest('hex') !== staged.sha256)
    throw refuse([`content release ${staged.release} on staging does not match its sha256`]);
  let catalogue;
  try { catalogue = releaseCatalogue(JSON.parse(file.toString('utf8'))); }
  catch { throw refuse([`content release ${staged.release} on staging is not valid JSON`]); }
  const named = `staging's ${contentLine(staged)}`;
  const problems = [];
  const empty = ['products', 'categories', 'vendors'].filter((key) => !catalogue[key]);
  if (empty.length) problems.push(`${named} has ${empty.map((key) => `0 ${key}`).join(', ')}`);
  const samples = [
    catalogue.product ? `/product/${encodeURIComponent(catalogue.product)}` : null,
    catalogue.vendor ? `/shop/${encodeURIComponent(catalogue.vendor)}` : null,
  ].filter(Boolean);
  const host = process.env.NODE_ENV === 'test' ? `${process.env.NETLIFY_TEST_API_URL}/staging` : `https://${stagingSite}.netlify.app`;
  const served = (await page(`${host}/_release`)).headers.get('x-gsam-release');
  if (served !== String(staged.release)) problems.push(`${stagingSite} serves content release ${served ?? 'unknown'}, not ${staged.release}`);
  for (const path of [...KEY_PAGES, ...samples]) {
    const answer = await page(host + path);
    if (answer.status !== 200) problems.push(`${path} answered ${answer.status || 'no response'} on ${stagingSite}`);
    else if (path === '/shop' && !listsProducts(answer.body)) problems.push(`/shop lists 0 products on ${stagingSite}`);
  }
  if (problems.length) throw refuse(problems);
  console.log(`Pre-Deploy gate passed: ${named} has ${catalogue.products} products, ${catalogue.categories} categories, ` +
    `${catalogue.vendors} vendors; ${KEY_PAGES.length + samples.length} key pages answered 200 on ${stagingSite}`);
  return samples;
}

async function inspectSite() {
  if (!token) throw new Error('NETLIFY_AUTH_TOKEN is required');
  const response = await json(`https://api.netlify.com/api/v1/sites/${site}.netlify.app/deploys?per_page=100`, token);
  const ready = response.find((deploy) => deploy.state === 'ready' && /^gsam-source:(preview|prod):/.test(deploy.title || ''));
  console.log(`${site}: Netlify lookup succeeded; latest guarded ready deploy: ${ready?.title || 'none'}`);
}

// GSAM content releases (Next cutover, content wiring, 7 Nov). Publish in GSAM's Website module writes page edits
// as a release to STAGING's store (`current` plus `releases/<n>.json` and `media/*`), and staging rebuilds from it.
// Deploy promotes that release with the commit: the files are copied to the public site's store and its `current`
// is pointed at the same release before the upload builds, and put back if the promote fails.
const contentStoreName = process.env.GSAM_RELEASE_BLOBS_STORE || 'gsam-content';

async function contentStore(name) {
  if (process.env.NODE_ENV === 'test' && token === 'test-token') {
    const dir = process.env.CONTENT_STORE_DIR;
    const path = dir ? join(dir, `${name}.json`) : null;
    const load = async () => { try { return path ? JSON.parse(await readFile(path, 'utf8')) : {}; } catch { return {}; } };
    const edit = async (fn) => { const all = await load(); fn(all); await writeFile(path, JSON.stringify(all)); };
    return {
      async get(key) { const all = await load(); return key in all ? Buffer.from(all[key], 'base64') : null; },
      async set(key, body) { await edit((all) => { all[key] = Buffer.from(body).toString('base64'); }); },
      async remove(key) { await edit((all) => { delete all[key]; }); },
      async keys(prefix) { return Object.keys(await load()).filter((key) => key.startsWith(prefix)); },
    };
  }
  const { getStore } = await import('@netlify/blobs');
  const store = getStore({ name: contentStoreName, siteID: sites.get(name), token, consistency: 'strong' });
  return {
    async get(key) { const body = await store.get(key, { type: 'arrayBuffer' }); return body ? Buffer.from(body) : null; },
    async set(key, body) { await store.set(key, new Blob([body])); },
    async remove(key) { await store.delete(key); },
    async keys(prefix) { return (await store.list({ prefix })).blobs.map((blob) => blob.key); },
  };
}

/** The content release a site's store points at (`current`), or null. */
async function contentRelease(name) {
  const raw = await (await contentStore(name)).get('current');
  return raw ? JSON.parse(raw.toString('utf8')) : null;
}

export function contentLine(current) {
  return `Content release ${current.release} (sha256 ${String(current.sha256).slice(0, 12)})`;
}

/** Copies staging's release to the public site's store and switches its `current`; returns the undo. */
async function promoteContent(staged) {
  const from = await contentStore(stagingSite);
  const to = await contentStore(site);
  const file = await from.get(staged.key);
  if (!file) throw new Error(`staging has no ${staged.key} for content release ${staged.release}`);
  if (createHash('sha256').update(file).digest('hex') !== staged.sha256)
    throw new Error(`content release ${staged.release} on staging does not match its sha256`);
  const have = new Set(await to.keys('media/'));
  for (const key of await from.keys('media/')) if (!have.has(key)) await to.set(key, await from.get(key));
  await to.set(staged.key, file);
  const previous = await to.get('current');
  await to.set('current', Buffer.from(JSON.stringify(staged)));
  console.log(`Promoted ${contentLine(staged)} to ${site}`);
  return async () => {
    if (previous) await to.set('current', previous); else await to.remove('current');
    console.log(`Put ${site}'s content pointer back to ${previous ? JSON.parse(previous.toString('utf8')).release : 'none'}`);
  };
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

// The lock every machine sees (7 Nov): the local lock above only covers one checkout, and on 7 Nov a PC agent's
// staging deploy published in the middle of a Mac rehearsal. One key per site and channel in the target site's
// Blobs, created only if new; a holder is passed over only when it is over an hour old or a dead process on this
// host. Tests use a file in place of Blobs.
export const SHARED_LOCK_MAX_MS = 60 * 60 * 1000;

async function sharedLockStore() {
  if (process.env.NODE_ENV === 'test' && token === 'test-token') {
    const path = process.env.SHARED_LOCK_FILE;
    const load = async () => { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return {}; } };
    const save = (all) => writeFile(path, JSON.stringify(all));
    return {
      async create(key, value) { const all = await load(); if (all[key]) return false; all[key] = { value, etag: randomUUID() }; await save(all); return true; },
      async read(key) { return (await load())[key] || null; },
      async replace(key, value, etag) { const all = await load(); if (all[key]?.etag !== etag) return false; all[key] = { value, etag: randomUUID() }; await save(all); return true; },
      async remove(key, own) { const all = await load(); if (all[key]?.value.own === own) { delete all[key]; await save(all); } },
    };
  }
  const { getStore } = await import('@netlify/blobs');
  const store = getStore({ name: 'gsam-deploy-locks', siteID: sites.get(site), token, consistency: 'strong' });
  return {
    async create(key, value) { return (await store.setJSON(key, value, { onlyIfNew: true })).modified; },
    async read(key) { const found = await store.getWithMetadata(key, { type: 'json' }); return found ? { value: found.data, etag: found.etag } : null; },
    async replace(key, value, etag) { return (await store.setJSON(key, value, { onlyIfMatch: etag })).modified; },
    async remove(key, own) { const found = await store.getWithMetadata(key, { type: 'json' }); if (found?.data?.own === own) await store.delete(key); },
  };
}

async function takeSharedLock(own) {
  const store = await sharedLockStore();
  const key = `${site}-${channel}${channel === 'preview' ? `-${prNumber}` : ''}`;
  const mine = { own, host: hostname(), pid: process.pid, identity: processIdentity(process.pid), at: new Date().toISOString() };
  if (!await store.create(key, mine)) {
    const held = await store.read(key);
    const holder = held?.value;
    const stale = !holder || Date.now() - Date.parse(holder.at) > SHARED_LOCK_MAX_MS ||
      (holder.host === mine.host && processIdentity(holder.pid) !== holder.identity);
    if (!stale || !await store.replace(key, mine, held.etag))
      throw new Error(`another deploy of ${site} (${channel}) is running on ${holder?.host || 'another machine'} since ${holder?.at || 'just now'}`);
    console.log(`Took over a stale deploy lock from ${holder?.host || 'an unknown machine'}`);
  }
  return () => store.remove(key, own);
}

async function lockAndDeploy(sha, cwd, content = null, samples = []) {
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
  let releaseShared = null;
  let undoContent = null;
  let promoted = false;
  try {
    if (JSON.parse(await readFile(file, 'utf8')).own !== own) throw new Error('newer run superseded this deploy');
    releaseShared = await takeSharedLock(own);
    const args = ['deploy', '--site', sites.get(site), '--message', `gsam-source:${channel}:${channel === 'preview' ? `${prNumber}:` : ''}${sha}`];
    // The public site (and a rehearsal) is checked live straight after a production upload, and restored on failure.
    const checked = (channel === 'prod' && site === 'greatstone-home') || mode === 'rehearse';
    // Staging's own production URL is the staging site, so it is a --prod upload to that site.
    if (channel === 'prod' || channel === 'staging') args.push('--prod');
    if (checked) args.push('--json');
    let before = null;
    if (checked) {
      before = (await netlifyApi(`/sites/${sites.get(site)}`)).published_deploy?.id;
      console.log(`Fallback: the deploy live before this one is ${before}. Restore it with: netlify api restoreSiteDeploy --data '{"site_id":"${sites.get(site)}","deploy_id":"${before}"}'`);
    }
    console.log(`Deploying ${site} ${mode} at ${sha}${content ? ` with ${contentLine(content)}` : ''}`);
    // The public build bakes the content release from its own store, so the pointer moves first.
    if (content) undoContent = await promoteContent(content);
    const child = spawn('netlify', args, { stdio: checked ? ['ignore', 'pipe', 'inherit'] : 'inherit', signal: controller.signal, cwd });
    let out = '';
    child.stdout?.on('data', (part) => { out += part; });
    const code = await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); });
    if (code !== 0) throw new Error(`netlify deploy exited ${code}`);
    if (checked) await checkLive(JSON.parse(out.slice(out.indexOf('{'))), before, samples);
    promoted = true;
    if (JSON.parse(await readFile(file, 'utf8')).own !== own) throw new Error('newer run superseded this deploy');
  } finally {
    if (undoContent && !promoted) await undoContent();
    await releaseShared?.().catch(() => { /* an expired lock is passed over after an hour */ });
    try { if (JSON.parse(await readFile(file, 'utf8')).own === own) await rm(file); } catch { /* newer run owns it */ }
  }
}

// Netlify applies a changed environment variable only on a new upload, and main() skips
// a commit that is already live. This staging-only path re-uploads the live commit after
// a config change. The guard runs from origin main, but the upload is an export of the
// live commit's tree, so main's newer code never rides along. It needs the accepted
// human-only card for exactly that commit; guard-only drift does not count here.
async function refreshStaging(sha) {
  if (!stagingSites.has(site)) throw new Error('config refresh is only for a staging site');
  if (command('git', ['ls-remote', 'origin', 'refs/heads/main']).split(/\s/)[0] !== sha)
    throw new Error('config refresh requires a checkout at exactly origin main');
  const live = await lastDeployedCommit();
  if (!live) throw new Error(`config refresh refused: ${site} has no guarded production upload to refresh`);
  if (spawnSync('git', ['merge-base', '--is-ancestor', live, sha]).status !== 0)
    throw new Error(`config refresh refused: live commit ${live} is not on main`);
  if (!await stagingCardApproved(live, true))
    throw new Error(`config refresh refused: this task needs an accepted human-only staging card for ${site} and ${live}`);
  console.log(`Refreshing ${site} config: re-uploading live commit ${live}`);
  await deployInstalled(live);
}

// Every upload is an export of the commit with a fresh `npm ci`. The working checkout's
// node_modules may be missing or stale, and Netlify bundles functions from whatever it
// finds there: 9376a4e reached staging without @netlify/database and every admin-bridge
// call gave 502 (GRE-4105).
async function deployInstalled(sha, content = null, samples = []) {
  const dir = await mkdtemp(join(tmpdir(), 'gsam-deploy-'));
  try {
    const tree = join(dir, 'tree');
    await mkdir(tree);
    command('git', ['archive', '--format=tar', '-o', join(dir, 'source.tar'), sha]);
    command('tar', ['-xf', join(dir, 'source.tar'), '-C', tree]);
    const upload = nextSites.has(site) ? await prepareNext(tree, join(dir, 'next')) : tree;
    command('npm', ['ci', '--no-audit', '--no-fund', '--loglevel=error'], upload);
    await lockAndDeploy(sha, upload, content, samples);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// The Next copy of the exported commit, with its functions and Netlify Database migrations. The CLI build
// gets only the read-only database role, which cannot SET ROLE anon for the catalogue export, so the build
// uses the checked-in catalogue fixture instead (next-proof/README.md). /api/catalogue still reads the site's database.
// The weekly train (GRE-2804) also ships the gsam-editor alias on greatstone-home from the same
// commit. The Vite upload does not contain the Next editor, so the editor is built from this
// checkout in a prepared copy, then uploaded and checked by deploy-editor-alias.mjs (site ID,
// contract, engine commit, links). Any failed step fails the train and names the step.
// `netlify build` has no --site flag and a fresh clone has no .netlify link, so the site ID
// goes in NETLIFY_SITE_ID (GRE-4199).
async function prepareNext(tree, target) {
  command(process.execPath, ['next-proof/scripts/prepare-netlify.mjs', target], tree);
  const config = join(target, 'netlify.toml');
  const toml = await readFile(config, 'utf8');
  if (!toml.includes('NEXT_CATALOGUE_REQUIRED = "1"')) throw new Error('next-proof/netlify.toml has no NEXT_CATALOGUE_REQUIRED line to extend');
  await writeFile(config, toml.replace('NEXT_CATALOGUE_REQUIRED = "1"', `NEXT_CATALOGUE_REQUIRED = "1"\n  NEXT_CATALOGUE_API = "${catalogueApi}"`));
  return target;
}

async function deployEditorAlias(sha) {
  const dir = await mkdtemp(join(tmpdir(), 'gsam-editor-'));
  const home = sites.get('greatstone-home');
  const env = { ...process.env, GSAM_ENGINE_COMMIT: sha, NETLIFY_SITE_ID: home };
  const steps = [
    ['prepare', process.execPath, ['next-proof/scripts/prepare-netlify.mjs', join(dir, 'editor'), '--editor'], process.cwd()],
    ['install', 'npm', ['ci', '--no-audit', '--no-fund', '--loglevel=error'], join(dir, 'editor')],
    ['build', 'netlify', ['build', '--context', 'branch:gsam-editor'], join(dir, 'editor')],
    ['upload and check', process.execPath, ['scripts/deploy-editor-alias.mjs', home], join(dir, 'editor')],
  ];
  try {
    for (const [name, bin, args, cwd] of steps) {
      console.log(`Editor alias step "${name}" at ${sha}`);
      const result = spawnSync(bin, args, { stdio: 'inherit', cwd, env });
      if (result.error || result.status !== 0)
        throw new Error(`train failed at editor alias step "${name}" (${result.error?.message || `exit ${result.status}`}); ` +
          `the ${site} production step before it already ran`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  if (mode === 'inspect' && sites.has(site)) return inspectSite();
  if (mode === 'content') {
    for (const name of [stagingSite, 'greatstone-home']) {
      const current = await contentRelease(name);
      console.log(`${name}: ${current ? contentLine(current) : 'no content release'}`);
    }
    return;
  }
  // A dry run of the pre-Deploy gate: reads staging only, uploads nothing, needs no card.
  if (mode === 'check' && site === 'greatstone-home') {
    await checkStagedRelease(await contentRelease(stagingSite));
    return;
  }
  if (!['preview', 'prod', 'refresh', 'staging', 'rehearse'].includes(mode) || !sites.has(site)) throw new Error('usage: npm run deploy:preview|deploy:prod|deploy:staging|deploy:rehearse -- <allowed site> [PR number], or deploy-site.mjs content, or deploy-site.mjs check greatstone-home');
  if ((mode === 'staging' || mode === 'rehearse') && site !== stagingSite) throw new Error(`${mode} deploys only ${stagingSite}`);
  command('node', ['contracts/check.mjs', '--site-speaks', String(SITE_CONTRACT)]);
  if (command('git', ['status', '--porcelain'])) throw new Error('deploy requires a clean checkout');
  const sha = command('git', ['rev-parse', 'HEAD']);
  if (mode === 'refresh') return refreshStaging(sha);
  // Staging takes main with no card; it never touches the public site or its database.
  if ((mode === 'staging' || mode === 'rehearse') && !onMain(sha)) throw new Error(`${mode} requires main (or a detached HEAD at origin main)`);
  // Content waiting: the staging watch's task names the release GSAM published (GSAM_CONTENT_RELEASE), and the
  // public promote carries what staging's store holds when the public store points elsewhere.
  let content = null;
  let contentChanged = false;
  let samples = [];
  let promoting = null;
  if (mode === 'staging' && process.env.GSAM_CONTENT_RELEASE) {
    const staged = await contentRelease(stagingSite);
    if (String(staged?.release) !== process.env.GSAM_CONTENT_RELEASE)
      throw new Error(`staging's store holds content release ${staged?.release ?? 'none'}, not ${process.env.GSAM_CONTENT_RELEASE}`);
    contentChanged = true;
  }
  if (mode === 'prod' && site === 'greatstone-home') {
    const staged = promoting = await contentRelease(stagingSite);
    const live = await contentRelease(site);
    if (staged && (staged.release !== live?.release || staged.sha256 !== live?.sha256)) { content = staged; contentChanged = true; }
  }
  const fallback = mode === 'staging' || mode === 'rehearse' ? null : await gate(sha, content);
  // Before any upload or the content pointer moves, staging's release must be fit to go live (GRE-4707).
  if (mode === 'prod' && site === 'greatstone-home') samples = await checkStagedRelease(promoting);
  const baseline = await lastDeployedCommit() || fallback;
  let files = null;
  if (baseline) {
    command('git', ['cat-file', '-e', `${baseline}^{commit}`]);
    files = command('git', ['diff', '--name-only', baseline, sha]).split('\n').filter(Boolean);
  }
  // A rehearsal always uploads: it exists to exercise the promote, not to save a build.
  if (mode !== 'rehearse' && !contentChanged && files && (files.length === 0 || onlyNonSiteFiles(files)))
    console.log(`Skipped ${site}: ${files.length ? 'docs, tests or CI only' : 'no changes'} since ${baseline}`);
  else await deployInstalled(sha, content, samples);
  // The alias keeps its own deploy history, so it ships even when the public upload was skipped.
  // The editor shows what staging holds, so the alias follows every staging upload (and the public site).
  if ((mode === 'prod' && site === 'greatstone-home') || mode === 'staging') await deployEditorAlias(sha);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
