import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';

const script = new URL('./deploy-site.mjs', import.meta.url).pathname;
const site = 'gre1795-website-db-staging';

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function fixture(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'deploy-test-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, 'bin'));
  await mkdir(join(cwd, 'src'));
  await mkdir(join(cwd, 'scripts'));
  await mkdir(join(cwd, 'contracts'));
  await writeFile(join(cwd, '.gitignore'), 'bin/\nnetlify-args.txt\n');
  git(cwd, 'init', '-q', '-b', 'main');
  git(cwd, 'config', 'user.email', 'test@example.invalid');
  git(cwd, 'config', 'user.name', 'Test');
  await writeFile(join(cwd, 'src', 'app.js'), 'original');
  await writeFile(join(cwd, 'contracts', 'check.mjs'), `if (process.argv[2] !== '--site-speaks' || process.argv[3] !== '1' || process.env.CONTRACT_CHECK_FAIL === '1') process.exitCode = 1;\n`);
  // Stand-ins for the editor alias step (GRE-2804): the prepared copy carries src and scripts
  // from this checkout, and the alias upload logs its site and the engine commit it must report.
  await mkdir(join(cwd, 'next-proof', 'scripts'), { recursive: true });
  await writeFile(join(cwd, 'next-proof', 'scripts', 'prepare-netlify.mjs'), `import { cpSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
for (const name of ['src', 'scripts']) cpSync(resolve(root, name), resolve(process.argv[2], name), { recursive: true });
`);
  await writeFile(join(cwd, 'scripts', 'deploy-editor-alias.mjs'), `import { appendFileSync } from 'node:fs';
appendFileSync(process.env.DEPLOY_LOG, \`alias \${process.argv[2]} \${process.env.GSAM_ENGINE_COMMIT}\\n\`);
if (process.env.ALIAS_FAIL === '1') process.exitCode = 1;
`);
  git(cwd, 'add', '.gitignore', 'src/app.js', 'contracts/check.mjs', 'next-proof/scripts/prepare-netlify.mjs', 'scripts/deploy-editor-alias.mjs');
  git(cwd, 'commit', '-qm', 'base');
  const base = git(cwd, 'rev-parse', 'HEAD');
  git(cwd, 'checkout', '-qb', 'test-pr');
  const log = join(cwd, 'netlify-args.txt');
  await writeFile(join(cwd, 'bin', 'gh'), '#!/bin/sh\nprintf "%s" "$FAKE_PR_JSON"\n', { mode: 0o755 });
  // TREE_LOG records which source tree npm and the upload ran in (config refresh tests).
  await writeFile(join(cwd, 'bin', 'netlify'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$DEPLOY_LOG"\n[ "$1" != build ] || [ -z "$NETLIFY_BUILD_FAIL" ] || exit 9\n[ -z "$TREE_LOG" ] || printf "netlify in %s\\n" "$(cat src/app.js)" >> "$TREE_LOG"\nsleep "${DEPLOY_SLEEP:-0}"\n', { mode: 0o755 });
  await writeFile(join(cwd, 'bin', 'npm'), '#!/bin/sh\nprintf "npm %s in %s\\n" "$1" "$(cat src/app.js)" >> "$TREE_LOG"\n', { mode: 0o755 });
  let comments = [];
  let interactions = [];
  let deploys = [];
  const served = [site];
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.includes('/api/v1/sites/') && !served.some((name) => req.url.includes(`${name}.netlify.app/deploys`))) {
      res.statusCode = 404;
      res.end('{}');
      return;
    }
    res.end(JSON.stringify(req.url.includes('/comments') ? comments : req.url.includes('/interactions') ? interactions : deploys));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  const env = {
    ...process.env, PATH: `${join(cwd, 'bin')}:${process.env.PATH}`,
    NODE_ENV: 'test', NETLIFY_AUTH_TOKEN: 'test-token', NETLIFY_TEST_API_URL: url,
    GSAM_API_URL: url, GSAM_API_KEY: 'test-key', GSAM_TASK_ID: 'test-task', DEPLOY_LOG: log,
  };
  function commit(path, content) {
    return mkdir(dirname(join(cwd, path)), { recursive: true })
      .then(() => writeFile(join(cwd, path), content)).then(() => {
      git(cwd, 'add', path); git(cwd, 'commit', '-qm', 'change');
      env.FAKE_PR_JSON = JSON.stringify({ number: 12, state: 'OPEN', isDraft: false,
        headRefOid: git(cwd, 'rev-parse', 'HEAD'), baseRefOid: base, labels: [{ name: 'preview' }] });
    });
  }
  async function run(mode = 'preview', targetSite = site) {
    const child = spawn(process.execPath, [script, mode, targetSite, '12'], { cwd, env });
    let stdout = '', stderr = '';
    child.stdout.on('data', (part) => { stdout += part; });
    child.stderr.on('data', (part) => { stderr += part; });
    const status = await new Promise((resolve) => child.on('exit', resolve));
    return { status, stdout, stderr };
  }
  return { cwd, base, env, log, commit, run,
    setComments: (value) => { comments = value; }, setInteractions: (value) => { interactions = value; },
    setDeploys: (value) => { deploys = value; }, servePublicSite: () => { served.push('greatstone-home'); } };
}

function stagingCard(sha, changes = {}) {
  return { kind: 'request_confirmation', status: 'accepted', requestedResolverPolicy: 'human_only',
    effectiveResolverPolicy: 'human_only',
    resolvedByUserId: 'UGJwnXKO0P0yBvVh4krv4LH3EThDwrRP', resolvedByAgentId: null,
    idempotencyKey: `confirmation:GRE-2064:staging-deploy:${sha}`,
    payload: { detailsMarkdown: `Approve production deploy: ${site} ${sha}` }, ...changes };
}

test('contract mismatch stops an otherwise approved upload before Netlify runs', async (t) => {
  const f = await fixture(t);
  await f.commit('src/app.js', 'new site code');
  f.env.CONTRACT_CHECK_FAIL = '1';
  const refused = await f.run();
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /contracts\/check\.mjs failed/);
  await assert.rejects(readFile(f.log));
  delete f.env.CONTRACT_CHECK_FAIL;
  const accepted = await f.run();
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(await readFile(f.log, 'utf8'), /deploy --site/);
});

test('accepted human-only staging card permits exact SHA and guard-only drift', async (t) => {
  const f = await fixture(t);
  git(f.cwd, 'checkout', '-q', 'main');
  f.setInteractions([stagingCard(f.base)]);
  let result = await f.run('prod');
  assert.equal(result.status, 0, result.stderr);
  await f.commit('scripts/deploy-site.mjs', 'guard');
  result = await f.run('prod');
  assert.equal(result.status, 0, result.stderr);
});

test('accepted revised staging card permits its approved SHA', async (t) => {
  const f = await fixture(t);
  git(f.cwd, 'checkout', '-q', 'main');
  f.setInteractions([stagingCard(f.base, {
    idempotencyKey: `confirmation:GRE-2064:staging-deploy:${f.base}:v2`,
  })]);
  const result = await f.run('prod');
  assert.equal(result.status, 0, result.stderr);
});

test('staging card rejects unaccepted, wrong site/SHA, agent resolution, and protected drift', async (t) => {
  const f = await fixture(t);
  git(f.cwd, 'checkout', '-q', 'main');
  const cases = [
    stagingCard(f.base, { status: 'rejected' }),
    stagingCard(f.base, { payload: { detailsMarkdown: `Approve production deploy: greatstone-home ${f.base}` } }),
    stagingCard('a'.repeat(40)),
    stagingCard(f.base, { resolvedByUserId: null, resolvedByAgentId: 'agent-id' }),
    stagingCard(f.base, { requestedResolverPolicy: 'anyone' }),
  ];
  for (const card of cases) {
    f.setInteractions([card]);
    const result = await f.run('prod');
    assert.equal(result.status, 1, JSON.stringify(card));
    assert.match(result.stderr, /production refused/);
  }
  f.setInteractions([stagingCard(f.base)]);
  await f.commit('netlify/functions/lib/admin-bridge-store.mjs', 'changed');
  const result = await f.run('prod');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /production refused/);
});

test('staging card covers a later main with front-end-only drift', async (t) => {
  const f = await fixture(t);
  git(f.cwd, 'checkout', '-q', 'main');
  f.setInteractions([stagingCard(f.base)]);
  await f.commit('src/app.js', 'nav');
  await f.commit('app/ProofBlocks.jsx', 'blocks');
  await f.commit('public/_redirects', '/old /new 301');
  await f.commit('docs/screenshots/GRE-1/home.png', 'png');
  const result = await f.run('prod');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`Staging card for ${f.base} covers`));
  assert.match(await readFile(f.log, 'utf8'), /--prod/);
});

test('staging card never covers drift into migrations, functions, auth or build config', async (t) => {
  const protectedPaths = [
    'netlify/database/migrations/054_x/migration.sql', 'netlify/functions/auth.mjs',
    'netlify/edge-functions/gate.mjs', 'supabase/migrations/1_x.sql', 'db/seed.sql',
    'app/media/[file]/route.js', 'app/api/hook.js', 'middleware.js', 'netlify.toml',
    'package.json', 'package-lock.json', 'next.config.mjs', 'vite.config.js', '.env.production',
    'public/_headers', 'scripts/list-edge-secrets.mjs', 'src/cms/auth.js', 'src/store/adminAuth.mjs',
    'src/store/PasswordInput.jsx', 'src/lib/login.js',
  ];
  for (const path of protectedPaths) {
    const f = await fixture(t);
    git(f.cwd, 'checkout', '-q', 'main');
    f.setInteractions([stagingCard(f.base)]);
    await f.commit('src/app.js', 'front-end');
    await f.commit(path, 'protected');
    const result = await f.run('prod');
    assert.equal(result.status, 1, path);
    assert.match(result.stderr, /production refused/, path);
  }
});

async function assertProtectedDriftRefused(t, path) {
  const f = await fixture(t);
  git(f.cwd, 'checkout', '-q', 'main');
  f.setInteractions([stagingCard(f.base)]);
  await f.commit('src/app.js', 'front-end');
  await f.commit(path, 'protected');
  const result = await f.run('prod');
  assert.equal(result.status, 1, path);
  assert.match(result.stderr, /production refused/, path);
}

test('staging card never covers drift into CI config', async (t) => {
  await assertProtectedDriftRefused(t, '.github/workflows/ci.yml');
});

test('staging card never covers drift into a TypeScript Next config', async (t) => {
  await assertProtectedDriftRefused(t, 'next.config.ts');
});

test('staging card never covers drift into a nested Netlify config', async (t) => {
  await assertProtectedDriftRefused(t, 'next-proof/netlify.editor.toml');
});

test('front-end drift never lets a staging card reach the public site', async (t) => {
  const f = await fixture(t);
  git(f.cwd, 'checkout', '-q', 'main');
  f.setInteractions([stagingCard(f.base)]);
  await f.commit('src/app.js', 'front-end');
  const result = await f.run('prod', 'greatstone-home');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /production refused/);
});

test('a staging card never authorises the public site', async (t) => {
  const f = await fixture(t);
  git(f.cwd, 'checkout', '-q', 'main');
  f.setInteractions([stagingCard(f.base)]);
  const result = await f.run('prod', 'greatstone-home');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /production refused/);
});

function weeklyCard(sha, changes = {}) {
  return stagingCard(sha, { idempotencyKey: `confirmation:GRE-2641:weekly-release:${sha}`,
    payload: { detailsMarkdown: `Approve production deploy: greatstone-home ${sha}\nApprove production deploy: ${site} ${sha}` },
    ...changes });
}

test('a weekly release card authorises both sites for its exact SHA', async (t) => {
  const f = await fixture(t);
  git(f.cwd, 'checkout', '-q', 'main');
  f.setInteractions([weeklyCard(f.base)]);
  // The fake Netlify API only serves the staging site, so the public run passes the gate
  // and then stops at the deploy lookup.
  let result = await f.run('prod', 'greatstone-home');
  assert.doesNotMatch(result.stderr, /production refused/);
  assert.match(result.stderr, /greatstone-home\.netlify\.app\/deploys: 404/);
  result = await f.run('prod');
  assert.equal(result.status, 0, result.stderr);
});

test('a weekly release card never covers public-site drift, other sites or agent resolution', async (t) => {
  const f = await fixture(t);
  git(f.cwd, 'checkout', '-q', 'main');
  const cases = [
    weeklyCard(f.base, { status: 'pending' }),
    weeklyCard(f.base, { resolvedByUserId: null, resolvedByAgentId: 'agent-id' }),
    weeklyCard(f.base, { payload: { detailsMarkdown: `Approve production deploy: ${site} ${f.base}` } }),
    weeklyCard('a'.repeat(40)),
  ];
  for (const card of cases) {
    f.setInteractions([card]);
    const result = await f.run('prod', 'greatstone-home');
    assert.equal(result.status, 1, JSON.stringify(card));
    assert.match(result.stderr, /production refused/);
  }
  f.setInteractions([weeklyCard(f.base)]);
  await f.commit('src/app.js', 'front-end');
  const result = await f.run('prod', 'greatstone-home');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /production refused/);
});

async function weeklyTrain(t) {
  const f = await fixture(t);
  git(f.cwd, 'checkout', '-q', 'main');
  f.servePublicSite();
  f.setInteractions([weeklyCard(f.base)]);
  f.env.TREE_LOG = join(f.cwd, 'bin', 'tree.txt');
  return f;
}

test('the weekly train deploys the public site, then the editor alias from the same commit', async (t) => {
  const f = await weeklyTrain(t);
  const result = await f.run('prod', 'greatstone-home');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(f.log, 'utf8'),
    `deploy --site 3b1e97e6-e184-4251-badd-deed532be3ab --message gsam-source:prod:${f.base} --prod\n` +
    'build --context branch:gsam-editor\n' +
    `alias 3b1e97e6-e184-4251-badd-deed532be3ab ${f.base}\n`);
  // npm and the editor build run in the prepared copy of this checkout.
  assert.equal(await readFile(f.env.TREE_LOG, 'utf8'), 'netlify in original\nnpm ci in original\nnetlify in original\n');
  for (const step of ['prepare', 'install', 'build', 'upload and check'])
    assert.match(result.stdout, new RegExp(`Editor alias step "${step}" at ${f.base}`));
});

test('the editor alias still ships when the public upload is skipped', async (t) => {
  const f = await weeklyTrain(t);
  f.setDeploys([{ state: 'ready', title: `gsam-source:prod:${f.base}` }]);
  const result = await f.run('prod', 'greatstone-home');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Skipped greatstone-home: no changes/);
  assert.equal(await readFile(f.log, 'utf8'),
    `build --context branch:gsam-editor\nalias 3b1e97e6-e184-4251-badd-deed532be3ab ${f.base}\n`);
});

test('a failed editor alias step fails the train and names the step', async (t) => {
  let f = await weeklyTrain(t);
  f.env.ALIAS_FAIL = '1';
  let result = await f.run('prod', 'greatstone-home');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /train failed at editor alias step "upload and check" \(exit 1\)/);
  assert.match(await readFile(f.log, 'utf8'), /--prod\n/);

  f = await weeklyTrain(t);
  f.env.NETLIFY_BUILD_FAIL = '1';
  result = await f.run('prod', 'greatstone-home');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /train failed at editor alias step "build" \(exit 9\)/);
  assert.doesNotMatch(await readFile(f.log, 'utf8'), /^alias /m);
});

test('staging production and previews never touch the editor alias', async (t) => {
  const f = await fixture(t);
  git(f.cwd, 'checkout', '-q', 'main');
  f.setInteractions([weeklyCard(f.base)]);
  const result = await f.run('prod');
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /Editor alias step/);
  assert.doesNotMatch(await readFile(f.log, 'utf8'), /branch:gsam-editor|^alias /m);
});

test('docs-only skips; site changes deploy only with preview gate', async (t) => {
  const f = await fixture(t);
  await f.commit('README.md', 'docs');
  let result = await f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Skipped.*docs, tests or CI only/);
  await assert.rejects(readFile(f.log));
  await f.commit('src/app.js', 'changed');
  f.env.FAKE_PR_JSON = JSON.stringify({ ...JSON.parse(f.env.FAKE_PR_JSON), isDraft: true });
  result = await f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /open, ready PR/);
  f.env.FAKE_PR_JSON = JSON.stringify({ ...JSON.parse(f.env.FAKE_PR_JSON), labels: [] });
  f.env.FAKE_PR_JSON = JSON.stringify({ ...JSON.parse(f.env.FAKE_PR_JSON), isDraft: false });
  result = await f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /preview refused/);
  f.setComments([{ authorAgentId: '8950d7f0-4d3b-40b0-93d8-b67aead0a2f7', body: 'Preview ready for PR #12' }]);
  result = await f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(f.log, 'utf8'), /^deploy --site 8c1135a6-6f8e-43f4-b9b2-3c4d5b6a36cb --message gsam-source:preview:12:[0-9a-f]{40}\n$/);
});

test('another board user cannot mark an unlabelled PR ready for preview', async (t) => {
  const f = await fixture(t);
  await f.commit('src/app.js', 'changed');
  f.env.FAKE_PR_JSON = JSON.stringify({ ...JSON.parse(f.env.FAKE_PR_JSON), labels: [] });
  f.setComments([{ authorType: 'user', authorUserId: 'another-board-user', body: 'Preview ready for PR #12' }]);
  const refused = await f.run();
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /preview refused/);
  await assert.rejects(readFile(f.log));

  f.setComments([{ authorType: 'user', authorUserId: 'UGJwnXKO0P0yBvVh4krv4LH3EThDwrRP', body: 'Preview ready for PR #12' }]);
  const approved = await f.run();
  assert.equal(approved.status, 0, approved.stderr);
  assert.match(await readFile(f.log, 'utf8'), /gsam-source:preview:12:/);
});

test('unapproved production is refused before upload', async (t) => {
  const f = await fixture(t);
  git(f.cwd, 'checkout', '-q', 'main');
  const result = await f.run('prod');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /production refused/);
  await assert.rejects(readFile(f.log));
  f.setComments([{ authorType: 'user', body: `Approve production deploy: ${site} ${f.base}` }]);
  const approved = await f.run('prod');
  assert.equal(approved.status, 0, approved.stderr);
  assert.match(await readFile(f.log, 'utf8'), /^deploy --site 8c1135a6-6f8e-43f4-b9b2-3c4d5b6a36cb --message gsam-source:prod:[0-9a-f]{40} --prod\n$/);
});

test('newer run supersedes an in-flight run for the same site', async (t) => {
  const f = await fixture(t);
  await f.commit('src/app.js', 'changed');
  f.env.DEPLOY_SLEEP = '2';
  const first = spawn(process.execPath, [script, 'preview', site, '12'], { cwd: f.cwd, env: f.env });
  const firstExit = new Promise((resolve) => first.on('exit', resolve));
  let firstOutput = '';
  first.stdout.on('data', (part) => { firstOutput += part; });
  for (let i = 0; i < 150 && !firstOutput.includes('Deploying'); i++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(firstOutput, /Deploying/);
  const second = await f.run();
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Superseded stale run/);
  const firstCode = await firstExit;
  assert.notEqual(firstCode, 0);
});

test('a stale lock with a reused PID does not stop an unrelated process', async (t) => {
  const f = await fixture(t);
  await f.commit('src/app.js', 'changed');
  const dir = join(f.cwd, '.git', 'gsam-deploy-locks', `${site}-preview-12`);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'owner.json'), JSON.stringify({ pid: process.pid, identity: 'old deploy-site.mjs process', own: 'old' }));
  const result = await f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /Superseded stale run/);
});

test('a preview from another PR is not the change baseline', async (t) => {
  const f = await fixture(t);
  await f.commit('src/app.js', 'changed');
  const sha = git(f.cwd, 'rev-parse', 'HEAD');
  f.setDeploys([{ state: 'ready', title: `gsam-source:preview:99:${sha}` }]);
  const result = await f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(f.log, 'utf8'), /gsam-source:preview:12:/);
});

test('preview does not stop an approved production upload', async (t) => {
  const f = await fixture(t);
  f.env.DEPLOY_SLEEP = '2';
  f.setComments([{ authorType: 'user', body: `Approve production deploy: ${site} ${f.base}` }]);
  git(f.cwd, 'checkout', '-q', 'main');
  const prod = spawn(process.execPath, [script, 'prod', site], { cwd: f.cwd, env: f.env });
  let output = '';
  prod.stdout.on('data', (part) => { output += part; });
  const done = new Promise((resolve) => prod.on('exit', resolve));
  for (let i = 0; i < 150 && !output.includes('Deploying'); i++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(output, /Deploying/);
  git(f.cwd, 'checkout', '-q', 'test-pr');
  await f.commit('src/app.js', 'changed');
  const preview = await f.run();
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(await done, 0);
});

async function runIn(f, args, cwd = f.cwd) {
  const child = spawn(process.execPath, [script, ...args], { cwd, env: f.env });
  let stdout = '', stderr = '';
  child.stdout.on('data', (part) => { stdout += part; });
  child.stderr.on('data', (part) => { stderr += part; });
  const status = await new Promise((resolve) => child.on('exit', resolve));
  return { status, stdout, stderr };
}

async function startDeploy(f, args, cwd = f.cwd) {
  const child = spawn(process.execPath, [script, ...args], { cwd, env: f.env });
  let output = '';
  child.stdout.on('data', (part) => { output += part; });
  child.stderr.on('data', (part) => { output += part; });
  const exit = new Promise((resolve) => child.on('exit', resolve));
  for (let i = 0; i < 150 && !output.includes('Deploying'); i++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(output, /Deploying/);
  return { exit, output: () => output };
}

test('a newer run in another worktree supersedes the same PR preview', async (t) => {
  const f = await fixture(t);
  await f.commit('src/app.js', 'changed');
  f.env.DEPLOY_SLEEP = '2';
  const first = await startDeploy(f, ['preview', site, '12']);
  const other = join(await mkdtemp(join(tmpdir(), 'deploy-wt-')), 'wt');
  t.after(() => rm(other, { recursive: true, force: true }));
  git(f.cwd, 'worktree', 'add', '-q', '--detach', other, 'HEAD');
  const second = await runIn(f, ['preview', site, '12'], other);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Superseded stale run/);
  assert.notEqual(await first.exit, 0);
});

test('previews for different PRs do not stop each other', async (t) => {
  const f = await fixture(t);
  await f.commit('src/app.js', 'changed');
  f.env.DEPLOY_SLEEP = '2';
  const first = await startDeploy(f, ['preview', site, '12']);
  f.env.FAKE_PR_JSON = JSON.stringify({ ...JSON.parse(f.env.FAKE_PR_JSON), number: 13 });
  const second = await runIn(f, ['preview', site, '13']);
  assert.equal(second.status, 0, second.stderr);
  assert.doesNotMatch(second.stdout, /Superseded stale run/);
  assert.equal(await first.exit, 0, first.output());
});

test('production from a detached HEAD needs exactly origin main', async (t) => {
  const f = await fixture(t);
  const remote = await mkdtemp(join(tmpdir(), 'deploy-remote-'));
  t.after(() => rm(remote, { recursive: true, force: true }));
  git(f.cwd, 'init', '-q', '--bare', remote);
  git(f.cwd, 'remote', 'add', 'origin', remote);
  git(f.cwd, 'push', '-q', 'origin', 'main');
  f.setComments([{ authorType: 'user', body: `Approve production deploy: ${site} ${f.base}` }]);
  git(f.cwd, 'checkout', '-q', '--detach', 'main');
  const approved = await f.run('prod');
  assert.equal(approved.status, 0, approved.stderr);
  await f.commit('src/app.js', 'changed');
  git(f.cwd, 'checkout', '-q', '--detach', 'HEAD');
  const refused = await f.run('prod');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /production requires main/);
});

async function refreshFixture(t) {
  const f = await fixture(t);
  const remote = await mkdtemp(join(tmpdir(), 'deploy-remote-'));
  t.after(() => rm(remote, { recursive: true, force: true }));
  git(f.cwd, 'init', '-q', '--bare', remote);
  git(f.cwd, 'remote', 'add', 'origin', remote);
  git(f.cwd, 'checkout', '-q', 'main');
  f.env.TREE_LOG = join(f.cwd, 'bin', 'tree.txt');
  f.setDeploys([{ state: 'ready', title: `gsam-source:prod:${f.base}` }]);
  f.setInteractions([stagingCard(f.base)]);
  // main moves on with site code after the approved upload; a refresh must not ship it.
  await f.commit('src/app.js', 'newer main code');
  git(f.cwd, 'push', '-q', 'origin', 'main');
  return f;
}

test('config refresh re-uploads the live approved commit tree from origin main', async (t) => {
  const f = await refreshFixture(t);
  const result = await f.run('refresh');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`re-uploading live commit ${f.base}`));
  assert.equal(await readFile(f.log, 'utf8'),
    `deploy --site 8c1135a6-6f8e-43f4-b9b2-3c4d5b6a36cb --message gsam-source:prod:${f.base} --prod\n`);
  assert.equal(await readFile(f.env.TREE_LOG, 'utf8'), 'npm ci in original\nnetlify in original\n');
});

test('config refresh never targets the public site', async (t) => {
  const f = await refreshFixture(t);
  const result = await f.run('refresh', 'greatstone-home');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /config refresh is only for gre1795-website-db-staging/);
  await assert.rejects(readFile(f.log));
});

test('config refresh refuses without the exact accepted card for the live commit', async (t) => {
  const f = await refreshFixture(t);
  const guardOnly = git(f.cwd, 'rev-parse', 'HEAD');
  const cases = [
    [],
    [stagingCard(f.base, { status: 'pending' })],
    [stagingCard(f.base, { resolvedByUserId: null, resolvedByAgentId: 'agent-id' })],
    [stagingCard(f.base, { effectiveResolverPolicy: 'anyone' })],
    [stagingCard(f.base, { payload: { detailsMarkdown: `Approve production deploy: greatstone-home ${f.base}` } })],
    [stagingCard(guardOnly)],
  ];
  for (const cards of cases) {
    f.setInteractions(cards);
    const result = await f.run('refresh');
    assert.equal(result.status, 1, JSON.stringify(cards));
    assert.match(result.stderr, /config refresh refused: this task needs an accepted human-only staging card/);
  }
  // A card for an older commit does not stretch to a live commit reached by guard-only drift.
  git(f.cwd, 'reset', '-q', '--hard', f.base);
  await f.commit('scripts/deploy-site.mjs', 'guard');
  git(f.cwd, 'push', '-q', '--force', 'origin', 'main');
  const drifted = git(f.cwd, 'rev-parse', 'HEAD');
  f.setDeploys([{ state: 'ready', title: `gsam-source:prod:${drifted}` }]);
  f.setInteractions([stagingCard(f.base)]);
  const result = await f.run('refresh');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /config refresh refused: this task needs an accepted human-only staging card/);
  await assert.rejects(readFile(f.log));
});

test('config refresh refuses off origin main, a dirty checkout, or no live upload', async (t) => {
  const f = await refreshFixture(t);
  await writeFile(join(f.cwd, 'src', 'app.js'), 'uncommitted');
  let result = await f.run('refresh');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /clean checkout/);
  git(f.cwd, 'checkout', '-q', '--', 'src/app.js');

  await f.commit('src/app.js', 'local only');
  result = await f.run('refresh');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /config refresh requires a checkout at exactly origin main/);
  git(f.cwd, 'reset', '-q', '--hard', 'HEAD~1');

  f.setDeploys([{ state: 'error', title: `gsam-source:prod:${f.base}` },
    { state: 'ready', title: `gsam-source:preview:12:${f.base}` }]);
  result = await f.run('refresh');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /has no guarded production upload to refresh/);

  f.setDeploys([{ state: 'ready', title: `gsam-source:prod:${'a'.repeat(40)}` }]);
  f.setInteractions([stagingCard('a'.repeat(40))]);
  result = await f.run('refresh');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is not on main/);
  await assert.rejects(readFile(f.log));
});
