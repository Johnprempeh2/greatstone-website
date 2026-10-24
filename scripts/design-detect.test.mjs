// npm run design:detect (GRE-1837): the engine pin fails closed, the env stays locked down, rendered scans
// stay local, and the summary gives one line per finding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  ENGINE_SHA256, engineEnv, isLocalUrl, parseArgs, summarise, verifyEngine, defaultEnginePath,
  changedUiFiles, changedPageUrls, filterRenderedFindings,
} from './design-detect.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'design-detect.mjs');

function withFakeEngine(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'designdetect-'));
  const path = join(dir, 'impeccable');
  writeFileSync(path, '#!/bin/sh\necho "[]"\n', { mode: 0o755 });
  try {
    return fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('every supported platform has a pinned 64-hex SHA-256', () => {
  for (const key of ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64', 'win32-x64']) {
    assert.match(ENGINE_SHA256[key], /^[0-9a-f]{64}$/, key);
  }
});

test('verifyEngine fails closed on a missing binary, an unknown platform and a hash mismatch', () => {
  assert.equal(verifyEngine('/nonexistent/impeccable', 'linux-x64').ok, false);
  withFakeEngine((path) => {
    assert.match(verifyEngine(path, 'plan9-mips').reason, /no pinned engine hash/);
    const r = verifyEngine(path, 'linux-x64');
    assert.equal(r.ok, false);
    assert.match(r.reason, /hash mismatch/);
  });
});

test('the CLI refuses a binary that is not the pinned one, and never runs it', () => {
  withFakeEngine((path) => {
    const r = spawnSync(process.execPath, [SCRIPT, '--all'], {
      encoding: 'utf8',
      env: { ...process.env, IMPECCABLE_ENGINE: path },
    });
    assert.equal(r.status, 3, r.stderr);
    assert.match(r.stderr, /hash mismatch/);
    assert.match(r.stderr, /does not download/);
    assert.equal(r.stdout, '');
  });
});

test('engine env turns telemetry and the update check off and drops binary overrides', () => {
  const env = engineEnv({ PATH: '/bin', IMPECCABLE_NO_TELEMETRY: '0', IMPECCABLE_BIN: '/tmp/x', IMPECCABLE_DOWNLOAD_BASE: 'https://x' });
  assert.equal(env.IMPECCABLE_NO_TELEMETRY, '1');
  assert.equal(env.IMPECCABLE_NO_UPDATE_CHECK, '1');
  assert.equal(env.DO_NOT_TRACK, '1');
  assert.equal(env.IMPECCABLE_BIN, undefined);
  assert.equal(env.IMPECCABLE_DOWNLOAD_BASE, undefined);
  assert.equal(env.PATH, '/bin');
});

test('rendered scans are allowed on a local site only', () => {
  assert.ok(isLocalUrl('http://localhost:5173/'));
  assert.ok(isLocalUrl('http://127.0.0.1:4100/tools'));
  assert.ok(!isLocalUrl('https://greatstone.example.com/'));
  assert.ok(!isLocalUrl('https://gsam.tail83d26c.ts.net:4100/'));
  assert.ok(!isLocalUrl('file:///etc/passwd'));
  assert.throws(() => parseArgs(['--url', 'https://example.com/']), /local site/);
  assert.deepEqual(parseArgs(['--url', 'http://localhost:5173/', 'src/a.jsx']).urls, ['http://localhost:5173/']);
  assert.equal(parseArgs(['--changed-pages', 'http://localhost:5181']).changedPages, 'http://localhost:5181');
  assert.throws(() => parseArgs(['--changed-pages', 'https://example.com/']), /local site/);
});

test('changed UI files include app and src, and static pages map to local routes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'design-files-'));
  try {
    spawnSync('git', ['init', '-q', dir]);
    assert.equal(spawnSync('git', ['-C', dir, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
      'commit', '--allow-empty', '-qm', 'base']).status, 0);
    for (const file of ['app/page.jsx', 'app/shop/page.jsx', 'app/editor/[slug]/page.jsx', 'src/store/store.css']) {
      const path = join(dir, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, 'x');
    }
    assert.equal(spawnSync('git', ['-C', dir, 'add', 'app', 'src']).status, 0);
    assert.equal(spawnSync('git', ['-C', dir, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
      'commit', '-qm', 'UI pages']).status, 0);
    const files = changedUiFiles('HEAD^', dir);
    assert.deepEqual(files, ['app/editor/[slug]/page.jsx', 'app/page.jsx', 'app/shop/page.jsx', 'src/store/store.css']);
    assert.deepEqual(changedPageUrls(files, 'http://localhost:5181'), ['http://localhost:5181/', 'http://localhost:5181/shop']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('brand noise is removed from rendered findings only', () => {
  const findings = ['kicker-above-heading', 'hero-eyebrow-chip', 'repeating-stripes-gradient', 'side-tab']
    .map((antipattern) => ({ antipattern }));
  assert.deepEqual(filterRenderedFindings(findings), [{ antipattern: 'side-tab' }]);
  assert.equal(findings.length, 4);
});

test('the default engine path is outside the repo and named for the platform', () => {
  assert.match(defaultEnginePath('linux-x64'), /greatstone-tools\/impeccable\/0\.1\.16\/impeccable-linux-x64$/);
  assert.match(defaultEnginePath('win32-x64'), /impeccable-windows-x64\.exe$/);
});

test('summary lists one line per finding and notes a rendered timeout without failing', () => {
  const md = summarise({
    targets: ['src/blocks/Hero.jsx'],
    source: [
      { antipattern: 'bounce-easing', name: 'Bounce or elastic easing', file: 'src/blocks/Hero.jsx', line: 187, advisory: true },
      { antipattern: 'side-tab', name: 'Side-tab border', file: 'src/intel/intel.css', line: 315 },
    ],
    rendered: [{ url: 'http://localhost:5173/', viewport: '390x844', failed: true, findings: [], reason: 'timed out' }],
  });
  assert.match(md, /1 finding\(s\)\*\*, 1 advisory/);
  assert.match(md, /- \[ \] `src\/blocks\/Hero\.jsx:187` `bounce-easing` \(advisory\)/);
  assert.match(md, /- \[ \] `src\/intel\/intel\.css:315` `side-tab`/);
  assert.match(md, /did not complete \(timed out\)\. Noted; the PR goes on\./);
});

test('the brand ignores are scoped values, never whole rules', () => {
  const config = JSON.parse(readFileSync(join(HERE, '..', '.impeccable', 'config.json'), 'utf8'));
  assert.deepEqual(config.detector.ignoreRules, []);
  assert.equal(config.hook, undefined, 'no detector hook');
  const byRule = Object.fromEntries(config.detector.ignoreValues.map((v) => [v.rule, v]));
  assert.deepEqual(Object.keys(byRule).sort(), ['kicker-above-heading', 'overused-font', 'radial-halo', 'repeating-stripes-gradient']);
  assert.equal(byRule['overused-font'].value, 'Montserrat');
  assert.deepEqual(byRule['radial-halo'].files, ['src/site.css']);
  for (const v of config.detector.ignoreValues) assert.ok(v.reason, `${v.rule} has a reason`);
});
