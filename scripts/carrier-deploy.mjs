// The carrier deploy for the GRE-2567 cut-over (plan section 4, step 3; tool H3, GRE-3901). A carrier is the live
// 12 Jul site, file for file, plus the Netlify Database migrations and the one-time importer at the card SHA. Visitors
// see no change; publishing it makes Netlify run the migrations, and the importer can then move the rows.
//
// It calls the deploy API directly, not the Netlify CLI. Rehearsal H built the carrier with a patched CLI and hit two
// faults this tool checks for (plan section 11):
//   1. an empty deploy folder made the CLI's walker skip the migrations folder, so the deploy had no migrations
//   2. a symlinked node_modules left @netlify/blobs out of the importer bundle, and the functions cache reused it
//
//   plan    --site <target> --sha <card sha>   build and check everything; no Netlify writes
//   deploy  --site <target> --sha <card sha>   plan, then create the deploy, upload, wait, and check it. Not published:
//                                              the target must have auto-publish locked (plan step 1)
//   check   --site <target> --deploy <id>      parity again for a carrier made by deploy
//   publish --site <target> --deploy <id>      dry-run the deploy's migrations, publish it, and check all applied.
//                                              greatstone-home needs John's accepted cut-over card for that SHA
//
// Order: lock auto-publish, `owner-import-run.mjs prepare` (the window reaches functions only through a new deploy),
// deploy, publish. Needs NETLIFY_AUTH_TOKEN; publish on greatstone-home also needs the GSAM task credentials.
// It prints counts, digests and statuses only.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { builtinModules } from 'node:module';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { inflateRawSync } from 'node:zlib';

const API = 'https://api.netlify.com/api/v1';
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

// The only deploy whose files a carrier may carry: greatstone-home's published 12 Jul deploy.
export const SOURCE = Object.freeze({ site: 'greatstone-home', siteId: '3b1e97e6-e184-4251-badd-deed532be3ab', deployId: '6a5380842226c7e8a7a93fce' });
export const TARGETS = Object.freeze({
  'greatstone-home': '3b1e97e6-e184-4251-badd-deed532be3ab',
  'gre2567-cutover-rehearsal': '6dce28c9-4b0d-4141-bf95-731dc0c4c843',
});
// _headers and _redirects as they were last committed before 12 Jul. Each must match the live digest byte for byte.
export const PINNED = Object.freeze([
  { path: '/_headers', commit: '9b5410547663fdb2a09be2e9df56df98b4355bed', file: 'public/_headers', sha1: '8e8a3f7423c35ce12faed1d60e06f1d4e7eabce8' },
  { path: '/_redirects', commit: 'a5f0576249215bfb0430ee06b469ca25a5a90c65', file: 'public/_redirects', sha1: 'e993a61299c0f96eb6d3a1dcd3252b0d8c8edb76' },
]);
// No card SHA may predate unique migration numbers (PR #187, plan section 7).
export const SHA_FLOOR = '5adcc45';
export const IMPORTER = Object.freeze({ name: 'owner-import', file: 'netlify/functions/owner-import.mjs', schedule: '*/5 * * * *' });
export const MIGRATIONS_SRC = 'netlify/database/migrations';
export const MIGRATIONS_PREFIX = '/.netlify/internal/db/migrations/';
const MIGRATION_DIR = /^\d+_[a-z0-9_-]+$/;
const TITLE = /^gsam-carrier:([0-9a-f]{40}):([0-9a-f]{24})$/;

const sha1 = (data) => createHash('sha1').update(data).digest('hex');
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function run(bin, args, options = {}) {
  const result = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0)
    throw new Error(`${bin} ${args[0]} failed: ${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout;
}

// ---- checks (pure; scripts/carrier-deploy.test.mjs covers each) ----

// Netlify's own rule (db_setup/validation.js): a numbered folder with migration.sql; numbers unique.
export function migrationNames(entries) {
  const names = entries.filter((e) => e.dir && MIGRATION_DIR.test(e.name)).map((e) => e.name).sort();
  const numbers = new Map();
  for (const name of names) {
    if (!entries.find((e) => e.name === name).hasSql) throw new Error(`Migration ${name} has no migration.sql`);
    const n = Number(/^(\d+)_/.exec(name)[1]);
    if (numbers.has(n)) throw new Error(`Duplicate migration number ${n}: ${numbers.get(n)}, ${name}`);
    numbers.set(n, name);
  }
  if (!names.length) throw new Error('No migrations found');
  return names;
}

// The file map the deploy sends: the 12 Jul digests as they are, plus one migration.sql per migration.
// Fault 1: a carrier whose deploy folder is empty, or whose map lost the migrations, must never be created.
export function carrierManifest({ sourceFiles, deployFolder, migrations }) {
  if (!Object.keys(deployFolder).length) throw new Error('The deploy folder is empty (rehearsal fault 1: the migrations would be skipped)');
  if (Object.keys(sourceFiles).length < 100 || !sourceFiles['/index.html']) throw new Error('The 12 Jul digest list looks incomplete');
  for (const pin of PINNED) {
    if (deployFolder[pin.path] !== pin.sha1) throw new Error(`${pin.path} in the deploy folder is not ${pin.commit.slice(0, 7)}:${pin.file}`);
    if (sourceFiles[pin.path] !== pin.sha1) throw new Error(`${pin.path} differs from the 12 Jul deploy`);
  }
  for (const [path, sha] of Object.entries(deployFolder))
    if (sourceFiles[path] !== sha) throw new Error(`${path} in the deploy folder is not the 12 Jul file`);
  for (const path of Object.keys(sourceFiles))
    if (path.startsWith('/.netlify/') || path === '/netlify.toml') throw new Error(`The 12 Jul deploy unexpectedly has ${path}`);
  const migrationFiles = {};
  for (const [name, sha] of Object.entries(migrations)) {
    if (!MIGRATION_DIR.test(name)) throw new Error(`Bad migration name ${name}`);
    migrationFiles[`${MIGRATIONS_PREFIX}${name}/migration.sql`] = sha;
  }
  if (!Object.keys(migrationFiles).length) throw new Error('The carrier has no migrations (rehearsal fault 1)');
  return { ...sourceFiles, ...migrationFiles };
}

// The bare and relative imports of an esbuild-bundled entry.
export function importsOf(code) {
  const specs = new Set();
  for (const m of code.matchAll(/(?:^|[;\s])(?:import|export)\s*(?:[^'"`;]*?\sfrom\s*)?["']([^"']+)["']/g)) specs.add(m[1]);
  for (const m of code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) specs.add(m[1]);
  return [...specs].filter((s) => !s.startsWith('node:') && !BUILTINS.has(s.split('/')[0]));
}
const BUILTINS = new Set(builtinModules);
const packageOf = (spec) => spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/');

// Fault 2: every package the importer imports must be inside its zip, and @netlify/blobs above all.
export function checkBundle(zip, entryFile = IMPORTER.file) {
  const names = new Set(zip.keys());
  if (!names.has(entryFile)) throw new Error(`The bundle has no ${entryFile}`);
  const code = zip.get(entryFile)().toString('utf8');
  const packages = new Set(['@netlify/blobs']);
  for (const spec of importsOf(code)) {
    if (spec.startsWith('.')) {
      const target = join(entryFile, '..', spec).split(sep).join('/');
      if (!names.has(target)) throw new Error(`The bundle imports ${spec} but does not contain it`);
    } else packages.add(packageOf(spec));
  }
  for (const pkg of packages)
    if (!names.has(`node_modules/${pkg}/package.json`)) throw new Error(`The bundle is missing ${pkg} (rehearsal fault 2)`);
  return [...packages].sort();
}

// The deploy may ask for the migrations and the importer only. Anything else means a 12 Jul digest is unknown.
export function checkRequired(deploy, migrationShas, functionSha) {
  const extra = (deploy.required || []).filter((sha) => !migrationShas.has(sha));
  if (extra.length) throw new Error(`The deploy asks for ${extra.length} file(s) that are not migrations`);
  const extraFns = (deploy.required_functions || []).filter((sha) => sha !== functionSha);
  if (extraFns.length) throw new Error('The deploy asks for a function that is not the importer');
  return { files: (deploy.required || []).length, functions: (deploy.required_functions || []).length };
}

// Same status, body and the headers that matter; a Location on the deploy's own host is compared as a path.
// A redirect is compared by its target only: Netlify serves the 12 Jul deploy's redirects without the _headers rules
// and a new deploy's with them, whatever the files say.
export function compareResponses(a, b, headerNames) {
  if (a.status !== b.status) return [`status ${a.status} != ${b.status}`];
  if (a.status >= 300 && a.status < 400) return a.headers.location === b.headers.location ? [] : ['location'];
  const diffs = [];
  if (a.bodySha1 !== b.bodySha1) diffs.push('body');
  for (const name of headerNames) if ((a.headers[name] ?? null) !== (b.headers[name] ?? null)) diffs.push(name);
  return diffs;
}

// Strict-Transport-Security is left out: Netlify sets it per domain, so a netlify.app carrier always differs.
export function headerNamesFrom(headersFile) {
  const names = new Set(['content-type', 'cache-control', 'location']);
  for (const line of headersFile.split('\n')) {
    const m = /^\s+([A-Za-z0-9-]+)\s*:/.exec(line);
    if (m) names.add(m[1].toLowerCase());
  }
  names.delete('strict-transport-security');
  return [...names].sort();
}

// Real packages, inside the tree: a symlinked node_modules (fault 2) or package is refused.
export function checkRealInstall(tree, packages) {
  const modules = join(tree, 'node_modules');
  if (!existsSync(modules) || lstatSync(modules).isSymbolicLink()) throw new Error('node_modules is missing or a symlink (rehearsal fault 2)');
  for (const pkg of packages) {
    const dir = join(modules, pkg);
    if (!existsSync(join(dir, 'package.json'))) throw new Error(`${pkg} is not installed`);
    if (lstatSync(dir).isSymbolicLink() || !realpathSync(dir).startsWith(realpathSync(modules) + sep))
      throw new Error(`${pkg} is a symlink out of the tree (rehearsal fault 2)`);
  }
}

// Card on GRE-2567 for the cut-over (step J): accepted by a person, for exactly this SHA.
export function cutoverApproved(cards, sha) {
  const key = new RegExp(`^confirmation:GRE-2567:cutover:${sha}(?::v[1-9]\\d*)?$`);
  return cards.some((card) => card.kind === 'request_confirmation' && card.status === 'accepted' &&
    card.requestedResolverPolicy === 'human_only' && card.effectiveResolverPolicy === 'human_only' &&
    card.resolvedByUserId && !card.resolvedByAgentId && key.test(card.idempotencyKey || '') &&
    card.payload?.detailsMarkdown?.includes(`Approve cut-over: greatstone-home ${sha}`));
}

// A zip reader for the bundle check (stored and deflated entries; zisi writes no zip64).
export function readZip(buffer) {
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('Not a zip file');
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(at) !== 0x02014b50) throw new Error('Bad zip directory');
    const method = buffer.readUInt16LE(at + 10);
    const size = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const skip = buffer.readUInt16LE(at + 30) + buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw new Error(`Zip method ${method} in ${name}`);
    entries.set(name, () => (method === 8 ? inflateRawSync(data) : Buffer.from(data)));
    at += 46 + nameLength + skip;
  }
  return entries;
}

// ---- Netlify ----

async function netlify(method, path, { body, raw, ok = [] } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.NETLIFY_AUTH_TOKEN}`, 'Content-Type': raw ? 'application/octet-stream' : 'application/json' },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  if (!response.ok && !ok.includes(response.status)) throw new Error(`${method} ${path.split('?')[0]}: ${response.status} ${(await response.text()).slice(0, 200)}`);
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null };
}
const get = async (path) => (await netlify('GET', path)).json;

async function deployFiles(deployId) {
  const files = {};
  for (let page = 1; ; page++) {
    const batch = await get(`/deploys/${deployId}/files?page=${page}&per_page=100`);
    if (!batch.length) return files;
    for (const file of batch) files[file.path] = file.sha;
  }
}

// The live site is the parity reference: Netlify serves redirects on the 12 Jul deploy's permalink without the
// _headers rules, while greatstoneint.com and the carrier both apply them. So it must still publish 12 Jul.
async function sourceSite() {
  const site = await get(`/sites/${SOURCE.siteId}`);
  if (site.name !== SOURCE.site || site.published_deploy?.id !== SOURCE.deployId)
    throw new Error(`${SOURCE.site} no longer publishes ${SOURCE.deployId}; refusing any other source deploy`);
  const deploy = await get(`/deploys/${SOURCE.deployId}`);
  if (deploy.site_id !== SOURCE.siteId || deploy.state !== 'ready' || deploy.context !== 'production')
    throw new Error('The source deploy is not a ready production deploy of greatstone-home');
  return { files: await deployFiles(SOURCE.deployId), origin: site.ssl_url };
}

async function target(name) {
  if (!Object.hasOwn(TARGETS, name || '')) throw new Error(`Site ${name} is not a carrier target`);
  const site = await get(`/sites/${TARGETS[name]}`);
  if (site.name !== name) throw new Error('Site id and name differ');
  return site;
}

async function window(site) {
  const read = async (key) => (await netlify('GET', `/accounts/${site.account_id}/env/${key}?site_id=${site.id}`, { ok: [404] })).json
    ?.values?.find((v) => v.context === 'production' || v.context === 'all')?.value;
  const [name, until] = [await read('OWNER_IMPORT_SITE'), await read('OWNER_IMPORT_UNTIL')];
  return name === site.name && Date.parse(until) > Date.now() ? until : null;
}

async function waitFor(deployId, states, minutes = 20) {
  for (const end = Date.now() + minutes * 60_000; Date.now() < end; await sleep(2000)) {
    const deploy = await get(`/deploys/${deployId}`);
    if (deploy.state === 'error') throw new Error(`Deploy ${deployId} failed: ${deploy.error_message || 'error'}`);
    if (states.includes(deploy.state)) return deploy;
  }
  throw new Error(`Deploy ${deployId} did not reach ${states.join('/')}`);
}

// ---- build ----

// The deploy folder: _headers and _redirects from their pinned commits.
function readPinned() {
  const deployFolder = {};
  const pinned = {};
  for (const pin of PINNED) {
    const data = spawnSync('git', ['show', `${pin.commit}:${pin.file}`], { cwd: ROOT, maxBuffer: 1 << 24 });
    if (data.status !== 0) throw new Error(`Cannot read ${pin.commit}:${pin.file}`);
    deployFolder[pin.path] = sha1(data.stdout);
    pinned[pin.path] = data.stdout.toString('utf8');
  }
  return { deployFolder, pinned };
}

async function build(sha, scratch) {
  if (!/^[0-9a-f]{40}$/.test(sha || '')) throw new Error('--sha must be a full 40-character commit');
  run('git', ['fetch', '-q', 'origin', 'main'], { cwd: ROOT });
  for (const [older, newer, why] of [[SHA_FLOOR, sha, `older than the floor ${SHA_FLOOR}`], [sha, 'origin/main', 'not on origin/main']])
    if (spawnSync('git', ['merge-base', '--is-ancestor', older, newer], { cwd: ROOT }).status !== 0) throw new Error(`${sha} is ${why}`);

  // The card SHA's tree with a real, locked install (fault 2: never a symlink to another checkout).
  const tree = join(scratch, 'tree');
  mkdirSync(tree);
  run('git', ['archive', '--format=tar', '-o', join(scratch, 'tree.tar'), sha], { cwd: ROOT });
  run('tar', ['-xf', join(scratch, 'tree.tar'), '-C', tree]);
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: tree });

  const { deployFolder, pinned } = readPinned();

  const src = join(tree, MIGRATIONS_SRC);
  const names = migrationNames(readdirSync(src, { withFileTypes: true }).map((e) => ({
    name: e.name, dir: e.isDirectory(), hasSql: e.isDirectory() && existsSync(join(src, e.name, 'migration.sql')),
  })));
  const migrations = {};
  const migrationBodies = new Map();
  for (const name of names) {
    const body = readFileSync(join(src, name, 'migration.sql'));
    migrations[name] = sha1(body);
    migrationBodies.set(sha1(body), { path: `${MIGRATIONS_PREFIX}${name}/migration.sql`, body });
  }

  // The importer alone, bundled by the pinned zisi into an empty folder: no functions cache to reuse.
  const bundler = join(scratch, 'bundler');
  cpSync(join(ROOT, 'scripts', 'carrier-deploy'), bundler, { recursive: true });
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: bundler });
  const { zipFunction } = await import(pathToFileURL(join(bundler, 'node_modules', '@netlify', 'zip-it-and-ship-it', 'dist', 'main.js')).href);
  const zips = join(scratch, 'zips');
  mkdirSync(zips);
  const fn = await zipFunction(join(tree, IMPORTER.file), zips, { basePath: tree, repositoryRoot: tree, config: { '*': { nodeBundler: 'esbuild' } } });
  if (fn?.name !== IMPORTER.name || fn.schedule !== IMPORTER.schedule) throw new Error('The importer did not bundle as a scheduled function');
  const zip = readFileSync(fn.path);
  const packages = checkBundle(readZip(zip));
  checkRealInstall(tree, packages);
  return { deployFolder, pinned, migrations, migrationBodies, fn, zip, zipSha: sha256(zip), packages };
}

async function prepareCarrier(sha, scratch) {
  const source = await sourceSite();
  const sourceFiles = source.files;
  const built = await build(sha, scratch);
  const files = carrierManifest({ sourceFiles, deployFolder: built.deployFolder, migrations: built.migrations });
  console.log(`Source ${SOURCE.deployId}: ${Object.keys(sourceFiles).length} files; _headers and _redirects match their pinned commits`);
  console.log(`Migrations at ${sha.slice(0, 7)}: ${Object.keys(built.migrations).length}; importer zip ${built.zipSha.slice(0, 12)} (${built.zip.length} bytes) with ${built.packages.join(', ')}`);
  return { source, files, ...built };
}

// ---- parity ----

async function fetchShape(url) {
  const response = await fetch(url, { redirect: 'manual', headers: { 'Cache-Control': 'no-cache' } });
  const body = Buffer.from(await response.arrayBuffer());
  const headers = Object.fromEntries([...response.headers].map(([k, v]) => [k, v]));
  if (headers.location) headers.location = headers.location.replace(new URL(url).origin, '');
  return { status: response.status, bodySha1: sha1(body), headers };
}

async function parity(carrierOrigin, { files: sourceFiles, origin: sourceOrigin }, pinned) {
  const headerNames = headerNamesFrom(pinned['/_headers']);
  const index = await (await fetch(`${sourceOrigin}/`)).text();
  const assets = [...index.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)].map((m) => m[1]);
  const redirects = pinned['/_redirects'].split('\n')
    .map((l) => l.trim().split(/\s+/)[0]).filter((p) => p?.startsWith('/') && !/[*:]/.test(p)).slice(0, 15);
  const all = Object.keys(sourceFiles).sort();
  const step = Math.max(1, Math.floor(all.length / 120));
  const paths = [...new Set(['/', '/shop', '/portal', `/carrier-parity-missing-${Date.now()}`, ...assets, ...redirects, ...all.filter((_, i) => i % step === 0)])];
  const failed = [];
  const fresh = `?carrier-parity=${Date.now()}`; // past the CDN's cached copies on both sides
  for (let i = 0; i < paths.length; i += 8) {
    await Promise.all(paths.slice(i, i + 8).map(async (path) => {
      const [a, b] = await Promise.all([fetchShape(`${sourceOrigin}${encodeURI(path)}${fresh}`), fetchShape(`${carrierOrigin}${encodeURI(path)}${fresh}`)]);
      const diffs = compareResponses(a, b, headerNames);
      if (diffs.length) failed.push(`${path}: ${diffs.join(', ')}`);
    }));
  }
  if (failed.length) throw new Error(`Parity failed on ${failed.length}/${paths.length} paths:\n  ${failed.slice(0, 20).join('\n  ')}`);
  console.log(`Parity with ${sourceOrigin} (${SOURCE.deployId}): ${paths.length} paths equal (status, body SHA-1, ${headerNames.length} headers; redirects by target)`);
}

// ---- commands ----

async function deploy(siteName, sha, scratch) {
  const site = await target(siteName);
  if (site.published_deploy?.locked !== true) throw new Error(`Lock auto-publish on ${siteName} first (plan step 1), so the carrier is not published on upload`);
  const until = await window(site);
  if (!until) throw new Error(`No import window on ${siteName}: run owner-import-run.mjs prepare first (env reaches functions only through a new deploy)`);
  const c = await prepareCarrier(sha, scratch);
  const { fn } = c;
  const body = {
    files: c.files,
    functions: { [IMPORTER.name]: c.zipSha },
    function_schedules: [{ name: IMPORTER.name, cron: IMPORTER.schedule }],
    functions_config: { [IMPORTER.name]: { build_data: fn.buildData, priority: fn.priority, routes: fn.routes?.length ? fn.routes : undefined } },
    async: true,
    draft: false,
  };
  const created = (await netlify('POST', `/sites/${site.id}/deploys?title=${encodeURIComponent(`gsam-carrier:${sha}:${SOURCE.deployId}`)}`, { body })).json;
  console.log(`Created deploy ${created.id} on ${siteName} (window until ${until})`);
  const diffed = await waitFor(created.id, ['prepared', 'uploading', 'uploaded', 'ready']);
  const required = checkRequired(diffed, new Set(c.migrationBodies.keys()), c.zipSha);
  console.log(`Netlify asks for ${required.files} migration file(s) and ${required.functions} function(s); every 12 Jul file is already held`);
  for (const sha of diffed.required || []) {
    const { path, body: data } = c.migrationBodies.get(sha);
    await netlify('PUT', `/deploys/${created.id}/files${encodeURI(path)}`, { raw: data });
  }
  if (diffed.required_functions?.length) {
    const query = new URLSearchParams({ runtime: fn.runtimeVersion || fn.runtime, ...(fn.invocationMode ? { invocation_mode: fn.invocationMode } : {}), ...(fn.timeout ? { timeout: String(fn.timeout) } : {}) });
    await netlify('PUT', `/deploys/${created.id}/functions/${IMPORTER.name}?${query}`, { raw: c.zip });
  }
  const ready = await waitFor(created.id, ['ready']);
  const fns = (ready.available_functions || []).map((f) => f.n);
  if (fns.length !== 1 || fns[0] !== IMPORTER.name) throw new Error(`The deploy has functions ${fns.join(', ') || 'none'}, not the importer alone`);
  if (JSON.stringify(ready.function_schedules) !== JSON.stringify([{ name: IMPORTER.name, cron: IMPORTER.schedule }])) throw new Error('The importer schedule is wrong');
  const listed = await deployFiles(created.id);
  const missing = Object.entries(c.files).filter(([path, sha]) => listed[path] !== sha);
  if (missing.length || Object.keys(listed).length !== Object.keys(c.files).length)
    throw new Error(`The deploy's file list differs from the carrier map (${missing.length} missing or changed)`);
  console.log(`Deploy ${ready.id} ready: ${Object.keys(listed).length} files (${Object.keys(c.migrations).length} migrations), importer only, schedule ${IMPORTER.schedule}`);
  await parity(`https://${ready.id}--${siteName}.netlify.app`, c.source, c.pinned);
  console.log(`Not published. Next: carrier-deploy.mjs publish --site ${siteName} --deploy ${ready.id}`);
}

async function carrierOf(site, deployId) {
  const deploy = await get(`/deploys/${deployId}`);
  const [, sha, source] = TITLE.exec(deploy.title || '') || [];
  if (deploy.site_id !== site.id || deploy.state !== 'ready' || source !== SOURCE.deployId) throw new Error(`${deployId} is not a ready carrier of ${site.name}`);
  return sha;
}

async function check(siteName, deployId) {
  const site = await target(siteName);
  await carrierOf(site, deployId);
  await parity(`https://${deployId}--${siteName}.netlify.app`, await sourceSite(), readPinned().pinned);
}

async function cards() {
  const base = process.env.GSAM_API_URL?.replace(/\/?api\/?$/, '').replace(/\/$/, '');
  if (!base || !process.env.GSAM_API_KEY) throw new Error('GSAM task credentials are required to publish on greatstone-home');
  const response = await fetch(`${base}/api/issues/GRE-2567/interactions`, { headers: { Authorization: `Bearer ${process.env.GSAM_API_KEY}` } });
  if (!response.ok) throw new Error(`GSAM interactions: ${response.status}`);
  return response.json();
}

async function publish(siteName, deployId) {
  const site = await target(siteName);
  const sha = await carrierOf(site, deployId);
  if (siteName === 'greatstone-home' && !cutoverApproved(await cards(), sha))
    throw new Error(`publish refused: GRE-2567 needs John's accepted cut-over card for greatstone-home ${sha}`);
  if (!await window(site)) throw new Error('The import window has ended; run clear, then prepare and deploy a new carrier');
  const shipped = Object.keys(await deployFiles(deployId)).filter((p) => p.startsWith(MIGRATIONS_PREFIX))
    .map((p) => p.slice(MIGRATIONS_PREFIX.length).split('/')[0]);
  const { json: dry } = await netlify('POST', `/sites/${site.id}/database/migrations/${deployId}`, { body: { dry_run: true } });
  if (dry?.total_migration_count !== shipped.length) throw new Error(`Migrations dry run saw ${dry?.total_migration_count} of ${shipped.length} migrations`);
  console.log(`Migrations dry run: ${dry.total_migration_count} in the deploy, database at version ${dry.current_version ?? 'none'}`);
  await netlify('POST', `/sites/${site.id}/deploys/${deployId}/restore`);
  for (let i = 0; i < 60 && (await get(`/sites/${site.id}`)).published_deploy?.id !== deployId; i++) await sleep(2000);
  if ((await get(`/sites/${site.id}`)).published_deploy?.id !== deployId) throw new Error(`${deployId} was not published within 2 minutes`);
  const { migrations = [] } = await get(`/sites/${site.id}/database/migrations`);
  const applied = new Set(migrations.filter((m) => m.applied).map((m) => m.name));
  const pending = shipped.filter((name) => !applied.has(name));
  if (!shipped.length || pending.length) throw new Error(`Published, but ${pending.length || 'all'} migration(s) are not applied: ${pending.slice(0, 5).join(', ')}`);
  console.log(`Published ${deployId} on ${siteName}: all ${shipped.length} migrations applied`);
}

async function main() {
  const { positionals: [command], values } = parseArgs({ allowPositionals: true, options: { site: { type: 'string' }, sha: { type: 'string' }, deploy: { type: 'string' } } });
  if (!process.env.NETLIFY_AUTH_TOKEN) throw new Error('NETLIFY_AUTH_TOKEN is required');
  if (command === 'publish') return publish(values.site, values.deploy);
  if (command === 'check') return check(values.site, values.deploy);
  if (command !== 'plan' && command !== 'deploy') throw new Error('usage: carrier-deploy.mjs plan|deploy --site <target> --sha <sha> | check|publish --site <target> --deploy <id>');
  const scratch = mkdtempSync(join(process.env.GSAM_RUN_SCRATCH_DIR || tmpdir(), 'carrier-'));
  try {
    if (command === 'deploy') await deploy(values.site, values.sha, scratch);
    else { await target(values.site); await prepareCarrier(values.sha, scratch); console.log('Plan only: nothing was sent to Netlify'); }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
