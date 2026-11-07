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
if (!process.argv[3]) cpSync(resolve(root, 'next-proof/netlify.toml'), resolve(process.argv[2], 'netlify.toml'));
`);
  await writeFile(join(cwd, 'next-proof', 'netlify.toml'), '[build.environment]\n  NEXT_CATALOGUE_REQUIRED = "1"\n');
  await writeFile(join(cwd, 'scripts', 'deploy-editor-alias.mjs'), `import { appendFileSync } from 'node:fs';
appendFileSync(process.env.DEPLOY_LOG, \`alias \${process.argv[2]} \${process.env.GSAM_ENGINE_COMMIT}\\n\`);
if (process.env.ALIAS_FAIL === '1') process.exitCode = 1;
`);
  git(cwd, 'add', '.gitignore', 'src/app.js', 'contracts/check.mjs', 'next-proof/scripts/prepare-netlify.mjs', 'next-proof/netlify.toml', 'scripts/deploy-editor-alias.mjs');
  git(cwd, 'commit', '-qm', 'base');
  const base = git(cwd, 'rev-parse', 'HEAD');
  git(cwd, 'checkout', '-qb', 'test-pr');
  const log = join(cwd, 'netlify-args.txt');
  await writeFile(join(cwd, 'bin', 'gh'), '#!/bin/sh\nprintf "%s" "$FAKE_PR_JSON"\n', { mode: 0o755 });
  // TREE_LOG records which source tree npm and the upload ran in (config refresh tests).
  // Like the real CLI, `netlify build` in an unlinked checkout fails unless NETLIFY_SITE_ID names the site (GRE-4199).
  await writeFile(join(cwd, 'bin', 'netlify'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$DEPLOY_LOG"\n[ "$1" != build ] || [ -n "$NETLIFY_SITE_ID" ] || [ -f .netlify/state.json ] || { echo "Error: Could not find the project ID" >&2; exit 4; }\n[ "$1" != build ] || printf "build site %s\\n" "$NETLIFY_SITE_ID" >> "$DEPLOY_LOG"\n[ "$1" != build ] || [ -z "$NETLIFY_BUILD_FAIL" ] || exit 9\n[ -z "$TREE_LOG" ] || printf "netlify in %s\\n" "$(cat src/app.js)" >> "$TREE_LOG"\n[ -z "$TOML_LOG" ] || [ "$1" != deploy ] || cat netlify.toml >> "$TOML_LOG"\nsleep "${DEPLOY_SLEEP:-0}"\ncase "$*" in *--json*) printf \'{"deploy_id":"draft-1","deploy_url":"%s/draft"}\\n\' "$NETLIFY_TEST_API_URL";; esac\n', { mode: 0o755 });
  await writeFile(join(cwd, 'bin', 'npm'), '#!/bin/sh\n[ -z "$TREE_LOG" ] || printf "npm %s in %s\\n" "$1" "$(cat src/app.js)" >> "$TREE_LOG"\n', { mode: 0o755 });
  let comments = [];
  let interactions = [];
  let deploys = [];
  const served = [site];
  const restores = [];
  const failing = new Set();
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    // The public promote (Next cutover step 4): the live deploy, publish and restore calls, and the upload's pages.
    if (req.url.startsWith('/draft')) {
      res.statusCode = failing.has(req.url.slice('/draft'.length)) ? 500 : 200;
      res.end('{}');
      return;
    }
    const restore = /^\/api\/v1\/sites\/[^/]+\/deploys\/([^/]+)\/restore$/.exec(req.url);
    if (restore && req.method === 'POST') {
      restores.push(restore[1]);
      res.end('{}');
      return;
    }
    if (/^\/api\/v1\/sites\/(?:3b1e97e6-e184-4251-badd-deed532be3ab|6689e558-855b-40b1-be45-c530531fed45)$/.test(req.url)) {
      res.end(JSON.stringify({ published_deploy: { id: 'live-before' } }));
      return;
    }
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
  const { NETLIFY_SITE_ID: _linked, ...parentEnv } = process.env;
  const env = {
    ...parentEnv, PATH: `${join(cwd, 'bin')}:${process.env.PATH}`,
    NODE_ENV: 'test', NETLIFY_AUTH_TOKEN: 'test-token', NETLIFY_TEST_API_URL: url,
    GSAM_API_URL: url, GSAM_API_KEY: 'test-key', GSAM_TASK_ID: 'test-task', DEPLOY_LOG: log,
    SHARED_LOCK_FILE: join(cwd, 'bin', 'shared-lock.json'),
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
    setDeploys: (value) => { deploys = value; }, servePublicSite: () => { served.push('greatstone-home'); },
    serve: (name) => { served.push(name); }, restores, failing };
}

function stagingCard(sha, changes = {}, cardSite = site) {
  return { kind: 'request_confirmation', status: 'accepted', requestedResolverPolicy: 'human_only',
    effectiveResolverPolicy: 'human_only',
    resolvedByUserId: 'UGJwnXKO0P0yBvVh4krv4LH3EThDwrRP', resolvedByAgentId: null,
    idempotencyKey: `confirmation:GRE-2064:staging-deploy:${sha}`,
    payload: { detailsMarkdown: `Approve production deploy: ${cardSite} ${sha}` }, ...changes };
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

test('every upload runs npm ci in an export of the commit, not the working checkout (GRE-4105)', async (t) => {
  const f = await fixture(t);
  await f.commit('src/app.js', 'committed code');
  await writeFile(join(f.cwd, 'src', 'app.js'), 'uncommitted edit');
  git(f.cwd, 'update-index', '--assume-unchanged', 'src/app.js');
  f.env.TREE_LOG = join(f.cwd, 'bin', 'tree.txt');
  const result = await f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(f.env.TREE_LOG, 'utf8'), 'npm ci in committed code\nnetlify in committed code\n');
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

function cutoverCard(sha, changes = {}) {
  return stagingCard(sha, { idempotencyKey: `confirmation:GRE-2567:cutover:${sha}`,
    payload: { detailsMarkdown: `Approve cut-over: greatstone-home ${sha}` }, ...changes });
}

test('the GRE-2567 cut-over card authorises the public site for its exact SHA', async (t) => {
  const f = await fixture(t);
  git(f.cwd, 'checkout', '-q', 'main');
  f.servePublicSite();
  f.setInteractions([cutoverCard(f.base)]);
  f.env.TREE_LOG = join(f.cwd, 'bin', 'tree.txt');
  const result = await f.run('prod', 'greatstone-home');
  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(f.log, 'utf8'), /--prod --json/);
  assert.deepEqual(f.restores, []);
});

test('the cut-over card never covers staging, another SHA, drift, agent resolution or other text', async (t) => {
  const f = await fixture(t);
  git(f.cwd, 'checkout', '-q', 'main');
  f.servePublicSite();
  f.setInteractions([cutoverCard(f.base)]);
  let result = await f.run('prod');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /production refused/);
  const cases = [
    cutoverCard(f.base, { status: 'pending' }),
    cutoverCard(f.base, { resolvedByUserId: null, resolvedByAgentId: 'agent-id' }),
    cutoverCard(f.base, { requestedResolverPolicy: 'anyone' }),
    cutoverCard(f.base, { idempotencyKey: `confirmation:GRE-9999:cutover:${f.base}` }),
    cutoverCard(f.base, { payload: { detailsMarkdown: `Approve cut-over: ${site} ${f.base}` } }),
    cutoverCard('a'.repeat(40)),
  ];
  for (const card of cases) {
    f.setInteractions([card]);
    result = await f.run('prod', 'greatstone-home');
    assert.equal(result.status, 1, JSON.stringify(card));
    assert.match(result.stderr, /production refused/);
  }
  f.setInteractions([cutoverCard(f.base)]);
  await f.commit('src/app.js', 'front-end');
  result = await f.run('prod', 'greatstone-home');
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
    `deploy --site 3b1e97e6-e184-4251-badd-deed532be3ab --message gsam-source:prod:${f.base} --prod --json\n` +
    'build --context branch:gsam-editor\nbuild site 3b1e97e6-e184-4251-badd-deed532be3ab\n' +
    `alias 3b1e97e6-e184-4251-badd-deed532be3ab ${f.base}\n`);
  // The public upload installs in an export of the commit; the editor installs and builds in its prepared copy.
  assert.equal(await readFile(f.env.TREE_LOG, 'utf8'), 'npm ci in original\nnetlify in original\nnpm ci in original\nnetlify in original\n');
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
    'build --context branch:gsam-editor\nbuild site 3b1e97e6-e184-4251-badd-deed532be3ab\n' +
    `alias 3b1e97e6-e184-4251-badd-deed532be3ab ${f.base}\n`);
});

// GRE-4199: a prod train from a fresh clone has no .netlify/state.json, and `netlify build` has no
// --site flag, so the build step must name the site through NETLIFY_SITE_ID, overriding any stray value.
test('the editor alias builds from a fresh, unlinked clone', async (t) => {
  const f = await weeklyTrain(t);
  f.env.NETLIFY_SITE_ID = '00000000-0000-0000-0000-000000000000';
  const result = await f.run('prod', 'greatstone-home');
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /Could not find the project ID/);
  assert.match(await readFile(f.log, 'utf8'),
    new RegExp(`^build site 3b1e97e6-e184-4251-badd-deed532be3ab\\nalias 3b1e97e6-e184-4251-badd-deed532be3ab ${f.base}$`, 'm'));
});

test('a failed editor alias step fails the train and names the step', async (t) => {
  let f = await weeklyTrain(t);
  f.env.ALIAS_FAIL = '1';
  let result = await f.run('prod', 'greatstone-home');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /train failed at editor alias step "upload and check" \(exit 1\)/);
  assert.match(await readFile(f.log, 'utf8'), /--prod --json\n/);

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
  assert.match(result.stderr, /config refresh is only for a staging site/);
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

// GRE-4202: Greatstone website staging (gre3833) is the one staging site, and it serves the Next copy.
const nextStaging = 'gre3833-next-db-staging';

async function nextStagingFixture(t) {
  const f = await fixture(t);
  f.serve(nextStaging);
  git(f.cwd, 'checkout', '-q', 'main');
  f.env.TREE_LOG = join(f.cwd, 'bin', 'tree.txt');
  f.env.TOML_LOG = join(f.cwd, 'bin', 'toml.txt');
  return f;
}

test('Greatstone website staging uploads the prepared Next copy of the commit with its own staging card', async (t) => {
  const f = await nextStagingFixture(t);
  f.setInteractions([stagingCard(f.base, {}, nextStaging)]);
  const result = await f.run('prod', nextStaging);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(f.log, 'utf8'),
    `deploy --site 6689e558-855b-40b1-be45-c530531fed45 --message gsam-source:prod:${f.base} --prod\n`);
  assert.equal(await readFile(f.env.TREE_LOG, 'utf8'), 'npm ci in original\nnetlify in original\n');
  // The CLI build cannot read the catalogue as anon, so it reads the live public catalogue over HTTP, still required.
  const toml = await readFile(f.env.TOML_LOG, 'utf8');
  assert.match(toml, /NEXT_CATALOGUE_REQUIRED = "1"\n  NEXT_CATALOGUE_API = "https:\/\/greatstoneint\.com\/api\/catalogue"/);
  assert.doesNotMatch(toml, /NEXT_CATALOGUE_FIXTURE/);
  assert.doesNotMatch(result.stdout, /Editor alias step/);
});

test('Greatstone website staging refuses a card for another site or no card', async (t) => {
  const f = await nextStagingFixture(t);
  for (const cards of [[], [stagingCard(f.base)], [stagingCard(f.base, { status: 'pending' }, nextStaging)]]) {
    f.setInteractions(cards);
    const result = await f.run('prod', nextStaging);
    assert.equal(result.status, 1, JSON.stringify(cards));
    assert.match(result.stderr, /needs an accepted human-only staging card for gre3833-next-db-staging/);
  }
  await assert.rejects(readFile(f.log));
});

test('a Greatstone website staging card never authorises the public site', async (t) => {
  const f = await nextStagingFixture(t);
  f.servePublicSite();
  f.setInteractions([stagingCard(f.base, {}, nextStaging)]);
  const result = await f.run('prod', 'greatstone-home');
  assert.equal(result.status, 1);
  await assert.rejects(readFile(f.log));
});

test('config refresh re-uploads the live Next copy on Greatstone website staging', async (t) => {
  const f = await refreshFixture(t);
  f.serve(nextStaging);
  f.setInteractions([stagingCard(f.base, {}, nextStaging)]);
  const result = await f.run('refresh', nextStaging);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(f.log, 'utf8'),
    `deploy --site 6689e558-855b-40b1-be45-c530531fed45 --message gsam-source:prod:${f.base} --prod\n`);
  assert.equal(await readFile(f.env.TREE_LOG, 'utf8'), 'npm ci in original\nnetlify in original\n');
});

// Staging holds the edits (John, 7 Nov): main goes to staging with no card, then the public site
// takes the exact commit staging holds, behind the weekly-release card.
test('staging uploads the Next copy of main to the staging site with no card, then the editor alias', async (t) => {
  const f = await fixture(t);
  f.env.TOML_LOG = join(f.cwd, 'bin', 'toml.txt');
  f.serve('gre3833-next-db-staging');
  git(f.cwd, 'checkout', '-q', 'main');
  const result = await f.run('staging', 'gre3833-next-db-staging');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(f.log, 'utf8'),
    `deploy --site 6689e558-855b-40b1-be45-c530531fed45 --message gsam-source:staging:${f.base} --prod\n` +
    'build --context branch:gsam-editor\nbuild site 3b1e97e6-e184-4251-badd-deed532be3ab\n' +
    `alias 3b1e97e6-e184-4251-badd-deed532be3ab ${f.base}\n`);
  assert.match(await readFile(f.env.TOML_LOG, 'utf8'), /NEXT_CATALOGUE_API/);
});

test('staging refuses a branch that is not main, and any other site', async (t) => {
  const f = await fixture(t);
  await f.commit('src/app.js', 'pr code');
  let result = await f.run('staging', 'gre3833-next-db-staging');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /staging requires main/);
  git(f.cwd, 'checkout', '-q', 'main');
  for (const other of ['greatstone-home', 'gre1795-website-db-staging']) {
    result = await f.run('staging', other);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /staging deploys only gre3833-next-db-staging/);
  }
  await assert.rejects(readFile(f.log));
});

test('the public site takes the commit on staging once main has moved on, still behind the card', async (t) => {
  const f = await fixture(t);
  git(f.cwd, 'checkout', '-q', 'main');
  const staged = f.base;
  const remote = await mkdtemp(join(tmpdir(), 'deploy-remote-'));
  t.after(() => rm(remote, { recursive: true, force: true }));
  git(f.cwd, 'init', '-q', '--bare', remote);
  git(f.cwd, 'remote', 'add', 'origin', remote);
  await f.commit('src/app.js', 'newer main code');
  git(f.cwd, 'push', '-q', 'origin', 'main');
  git(f.cwd, 'checkout', '-q', '--detach', staged);
  f.serve('gre3833-next-db-staging');
  f.setDeploys([{ state: 'ready', title: `gsam-source:staging:${staged}` }]);
  let result = await f.run('prod', 'greatstone-home');
  assert.match(result.stderr, /production refused/);
  f.setInteractions([weeklyCard(staged)]);
  // Past the gate, the fake API stops it at the public site's deploy lookup.
  result = await f.run('prod', 'greatstone-home');
  assert.doesNotMatch(result.stderr, /production refused|production requires/);
  assert.match(result.stderr, /greatstone-home\.netlify\.app\/deploys: 404/);
  f.setDeploys([]);
  result = await f.run('prod', 'greatstone-home');
  assert.match(result.stderr, /production requires main .*or the commit on staging/);
});

// Next cutover step 4: the public site is checked before it is published, and put back if its APIs fail after.
test('the public promote uploads as production, then checks the live site', async (t) => {
  const f = await weeklyTrain(t);
  const result = await f.run('prod', 'greatstone-home');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.restores, []);
  assert.match(result.stdout, /Fallback: the deploy live before this one is live-before/);
  assert.match(result.stdout, /Published draft-1: 6 pages and 4 APIs answered 200/);
});

test('a page failing on the live site after the upload puts the earlier deploy back', async (t) => {
  const f = await weeklyTrain(t);
  f.failing.add('/shop');
  const result = await f.run('prod', 'greatstone-home');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\/shop failed after publishing draft-1; restored live-before/);
  assert.deepEqual(f.restores, ['live-before']);
});

test('an API failing after the upload puts the earlier live deploy back at once', async (t) => {
  const f = await weeklyTrain(t);
  f.failing.add('/api/catalogue');
  const result = await f.run('prod', 'greatstone-home');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\/api\/catalogue failed after publishing draft-1; restored live-before/);
  assert.deepEqual(f.restores, ['live-before']);
});

// The rehearsal (7 Nov): the public promote, run on staging with no card, with a failure that can be planted.
test('a rehearsal runs the checked promote on staging and never touches the public site', async (t) => {
  const f = await fixture(t);
  f.serve('gre3833-next-db-staging');
  git(f.cwd, 'checkout', '-q', 'main');
  const result = await f.run('rehearse', 'gre3833-next-db-staging');
  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(f.log, 'utf8'), /^deploy --site 6689e558-855b-40b1-be45-c530531fed45 --message gsam-source:staging:[0-9a-f]{40} --prod --json$/m);
  assert.doesNotMatch(await readFile(f.log, 'utf8'), /3b1e97e6-e184-4251-badd-deed532be3ab --message/);
  assert.deepEqual(f.restores, []);
});

test('a planted API failure in a rehearsal puts the earlier staging deploy back', async (t) => {
  const f = await fixture(t);
  f.serve('gre3833-next-db-staging');
  git(f.cwd, 'checkout', '-q', 'main');
  f.env.REHEARSE_FAIL_API = '/api/catalogue';
  const result = await f.run('rehearse', 'gre3833-next-db-staging');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\/api\/catalogue \(planted\) failed after publishing draft-1; restored live-before/);
  assert.deepEqual(f.restores, ['live-before']);
});

test('a rehearsal refuses the public site, and a planted failure is ignored outside a rehearsal', async (t) => {
  let f = await fixture(t);
  git(f.cwd, 'checkout', '-q', 'main');
  const refused = await f.run('rehearse', 'greatstone-home');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /rehearse deploys only gre3833-next-db-staging/);
  f = await weeklyTrain(t);
  f.env.REHEARSE_FAIL_API = '/api/catalogue';
  const promoted = await f.run('prod', 'greatstone-home');
  assert.equal(promoted.status, 0, promoted.stderr);
});

// The deploy lock every machine sees (7 Nov): a holder on another machine stops a second deploy of the same site.
test('a deploy held on another machine is refused; a stale or finished one is not', async (t) => {
  const f = await fixture(t);
  f.serve('gre3833-next-db-staging');
  git(f.cwd, 'checkout', '-q', 'main');
  const key = 'gre3833-next-db-staging-staging';
  const hold = (at) => writeFile(f.env.SHARED_LOCK_FILE, JSON.stringify({ [key]: { etag: 'e1', value: { own: 'other', host: 'gsam-pc', pid: 1, identity: 'x', at } } }));
  await hold(new Date().toISOString());
  let result = await f.run('staging', 'gre3833-next-db-staging');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /another deploy of gre3833-next-db-staging \(staging\) is running on gsam-pc/);
  await assert.rejects(readFile(f.log));
  await hold(new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
  result = await f.run('staging', 'gre3833-next-db-staging');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Took over a stale deploy lock from gsam-pc/);
  // released after the run, so the next deploy goes straight ahead
  assert.deepEqual(JSON.parse(await readFile(f.env.SHARED_LOCK_FILE, 'utf8')), {});
});

// GSAM content releases (Next cutover, content wiring): staging's store holds what Publish wrote; Deploy promotes it.
async function stageContent(f, number = 4) {
  const { createHash } = await import('node:crypto');
  const file = Buffer.from(JSON.stringify({ schema: 2, release: number, pages: [] }));
  const sha256 = createHash('sha256').update(file).digest('hex');
  const current = { schema: 1, release: number, key: `releases/${number}.json`, sha256, switchedAt: '2026-11-07T10:00:00.000Z', fence: 3 };
  f.env.CONTENT_STORE_DIR = join(f.cwd, 'bin');
  await writeFile(join(f.cwd, 'bin', 'gre3833-next-db-staging.json'), JSON.stringify({
    current: Buffer.from(JSON.stringify(current)).toString('base64'),
    [current.key]: file.toString('base64'),
    'media/abc.png': Buffer.from('png').toString('base64'),
  }));
  return { current, line: `Content release ${number} (sha256 ${sha256.slice(0, 12)})` };
}
const publicStore = async (f) => { try { return JSON.parse(await readFile(join(f.cwd, 'bin', 'greatstone-home.json'), 'utf8')); } catch { return {}; } };

test('Deploy promotes the staged content release with the commit, only when the card names it', async (t) => {
  const f = await weeklyTrain(t);
  const { current, line } = await stageContent(f);
  let result = await f.run('prod', 'greatstone-home');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /naming "Content release 4/);
  assert.deepEqual(await publicStore(f), {});
  f.setInteractions([weeklyCard(f.base, { payload: { detailsMarkdown: `Approve production deploy: greatstone-home ${f.base}\n${line}` } })]);
  result = await f.run('prod', 'greatstone-home');
  assert.equal(result.status, 0, result.stderr);
  const store = await publicStore(f);
  assert.deepEqual(JSON.parse(Buffer.from(store.current, 'base64')), current);
  assert.ok(store['releases/4.json'] && store['media/abc.png']);
  assert.match(result.stdout, /Promoted Content release 4/);
});

test('a failed promote puts the public content pointer back', async (t) => {
  const f = await weeklyTrain(t);
  const { line } = await stageContent(f);
  f.setInteractions([weeklyCard(f.base, { payload: { detailsMarkdown: `Approve production deploy: greatstone-home ${f.base}\n${line}` } })]);
  f.failing.add('/api/catalogue');
  const result = await f.run('prod', 'greatstone-home');
  assert.equal(result.status, 1);
  assert.deepEqual(f.restores, ['live-before']);
  assert.equal((await publicStore(f)).current, undefined);
});

test('a staging content task forces the staging upload and must match staging\'s store', async (t) => {
  const f = await fixture(t);
  git(f.cwd, 'checkout', '-q', 'main');
  f.serve('gre3833-next-db-staging');
  f.setDeploys([{ state: 'ready', title: `gsam-source:staging:${f.base}` }]);
  await stageContent(f);
  f.env.GSAM_CONTENT_RELEASE = '3';
  let result = await f.run('staging', 'gre3833-next-db-staging');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /holds content release 4, not 3/);
  f.env.GSAM_CONTENT_RELEASE = '4';
  result = await f.run('staging', 'gre3833-next-db-staging');
  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(f.log, 'utf8'), /--message gsam-source:staging:/);
});
