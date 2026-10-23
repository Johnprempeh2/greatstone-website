import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  await writeFile(join(cwd, '.gitignore'), 'bin/\nnetlify-args.txt\n');
  git(cwd, 'init', '-q', '-b', 'main');
  git(cwd, 'config', 'user.email', 'test@example.invalid');
  git(cwd, 'config', 'user.name', 'Test');
  await writeFile(join(cwd, 'src', 'app.js'), 'original');
  git(cwd, 'add', '.gitignore', 'src/app.js'); git(cwd, 'commit', '-qm', 'base');
  const base = git(cwd, 'rev-parse', 'HEAD');
  git(cwd, 'checkout', '-qb', 'test-pr');
  const log = join(cwd, 'netlify-args.txt');
  await writeFile(join(cwd, 'bin', 'gh'), '#!/bin/sh\nprintf "%s" "$FAKE_PR_JSON"\n', { mode: 0o755 });
  await writeFile(join(cwd, 'bin', 'netlify'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$DEPLOY_LOG"\nsleep "${DEPLOY_SLEEP:-0}"\n', { mode: 0o755 });
  let comments = [];
  let deploys = [];
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.includes('/api/v1/sites/') && !req.url.includes(`${site}.netlify.app/deploys`)) {
      res.statusCode = 404;
      res.end('{}');
      return;
    }
    res.end(JSON.stringify(req.url.includes('/comments') ? comments : deploys));
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
    return writeFile(join(cwd, path), content).then(() => {
      git(cwd, 'add', path); git(cwd, 'commit', '-qm', 'change');
      env.FAKE_PR_JSON = JSON.stringify({ number: 12, state: 'OPEN', isDraft: false,
        headRefOid: git(cwd, 'rev-parse', 'HEAD'), baseRefOid: base, labels: [{ name: 'preview' }] });
    });
  }
  async function run(mode = 'preview') {
    const child = spawn(process.execPath, [script, mode, site, '12'], { cwd, env });
    let stdout = '', stderr = '';
    child.stdout.on('data', (part) => { stdout += part; });
    child.stderr.on('data', (part) => { stderr += part; });
    const status = await new Promise((resolve) => child.on('exit', resolve));
    return { status, stdout, stderr };
  }
  return { cwd, base, env, log, commit, run,
    setComments: (value) => { comments = value; }, setDeploys: (value) => { deploys = value; } };
}

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
  assert.match(await readFile(f.log, 'utf8'), /^deploy --site gre1795-website-db-staging --message gsam-source:preview:12:[0-9a-f]{40}\n$/);
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
  assert.match(await readFile(f.log, 'utf8'), / --prod\n$/);
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
  const dir = join(tmpdir(), `greatstone-deploy-${site}-preview`);
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
