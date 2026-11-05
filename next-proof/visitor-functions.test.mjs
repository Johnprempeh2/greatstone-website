import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const exec = promisify(execFile);

test('the checkout itself builds the Next site with the visitor functions (GRE-3873)', async () => {
  const config = await readFile('netlify.toml', 'utf8');
  assert.match(config, /^\s*command = "npm run build:next"$/m);
  assert.match(config, /^\s*publish = "\.next"$/m);
  assert.match(config, /^\s*NEXT_CATALOGUE_REQUIRED = "1"$/m);
  assert.doesNotMatch(config, /NETLIFY_NEXT_PLUGIN_SKIP/);
  assert.match(config, /\[functions\][\s\S]*directory = "netlify\/functions"/);
  // The Vite SPA fallback and headers would shadow every Next route; they must not sit in public/.
  for (const name of ['_redirects', '_headers']) await assert.rejects(stat(join('public', name)));
  // Every Vite-site function keeps its path on the Next deploy (GRE-1973 regression gate).
  const names = (await readdir('netlify/functions')).filter((name) => name.endsWith('.mjs'));
  assert.ok(names.length >= 25);
  for (const name of names) {
    await build({ entryPoints: [join('netlify/functions', name)], bundle: true, format: 'esm', platform: 'node', packages: 'external', write: false });
  }
});

test('only the editor alias is prepared in a scratch copy', async () => {
  await assert.rejects(exec(process.execPath, ['next-proof/scripts/prepare-netlify.mjs', join(tmpdir(), 'unused')]), /pass --editor/);
});

test('editor package carries the host guard and builds without database provisioning or catalogue export', async () => {
  const target = await mkdtemp(join(tmpdir(), 'greatstone-next-editor-'));
  try {
    await exec(process.execPath, ['next-proof/scripts/prepare-netlify.mjs', target, '--editor']);
    assert.equal(await readFile(join(target, 'middleware.js'), 'utf8'), await readFile('middleware.js', 'utf8'));
    const config = await readFile(join(target, 'netlify.toml'), 'utf8');
    assert.match(config, /command = "npm run build:next:editor"/);
    assert.match(config, /GSAM_EDITOR_HOST = "gsam-editor--greatstone-home\.netlify\.app"/);
    assert.match(config, /GSAM_EDITOR_ORIGINS = "https:\/\/gsam\.tail83d26c\.ts\.net:3100"/);
    assert.doesNotMatch(config, /NEXT_CATALOGUE_REQUIRED|\[functions\]/);
    const pkg = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
    const lock = JSON.parse(await readFile(join(target, 'package-lock.json'), 'utf8'));
    assert.doesNotMatch(pkg.scripts['build:next:editor'], /export-pages/);
    assert.match(pkg.scripts['build:next:editor'], /gen-contract-file/);
    assert.ok((await stat(join(target, 'contracts/VENDORED.json'))).isFile());
    // Portal and catalogue pages import the shared helpers (GRE-3768); the function handlers stay out.
    assert.ok((await stat(join(target, 'netlify/functions/lib/shared/portal-receipt.mjs'))).isFile());
    for (const name of ['@netlify/database', '@netlify/database-dev']) {
      assert.equal(pkg.dependencies?.[name], undefined);
      assert.equal(pkg.devDependencies?.[name], undefined);
      assert.equal(lock.packages[''].dependencies?.[name], undefined);
      assert.equal(lock.packages[''].devDependencies?.[name], undefined);
    }
    assert.deepEqual(await readdir(join(target, 'netlify/functions')), ['lib']);
    assert.deepEqual(await readdir(join(target, 'netlify/functions/lib')), ['shared']);
    await assert.rejects(stat(join(target, 'netlify/database')));
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});
