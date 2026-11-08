import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const exec = promisify(execFile);

test('isolated Next deploy retains the visitor functions and their server imports', async () => {
  const target = await mkdtemp(join(tmpdir(), 'greatstone-next-functions-'));
  try {
    await exec(process.execPath, ['next-proof/scripts/prepare-netlify.mjs', target]);
    const config = await readFile(join(target, 'netlify.toml'), 'utf8');
    assert.match(config, /\[functions\][\s\S]*directory = "netlify\/functions"/);
    // Every Vite-site function keeps its path on the Next deploy (GRE-1973 regression gate).
    const names = (await readdir('netlify/functions')).filter((name) => name.endsWith('.mjs'));
    assert.ok(names.length >= 25);
    for (const name of names) {
      const entry = join(target, 'netlify/functions', name);
      assert.ok((await stat(entry)).isFile());
      await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', packages: 'external', write: false });
    }
    for (const script of ['gen-seo-files.mjs', 'gen-contract-file.mjs', 'prepare-puck-css.mjs']) {
      assert.ok((await stat(join(target, 'scripts', script))).isFile());
    }
    assert.ok((await stat(join(target, 'contracts/site-contract/schemas/contract-file.schema.json'))).isFile());
    assert.equal(await readFile(join(target, 'middleware.js'), 'utf8'), await readFile('middleware.js', 'utf8'));
  } finally {
    await rm(target, { recursive: true, force: true });
  }
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
    assert.deepEqual((await readdir(join(target, 'netlify/functions/lib'))).sort(), ['interview', 'shared']);
    // The voice client imports the barge-in rules (GRE-4282) and the region map (GRE-2687); nothing else from interview ships.
    assert.deepEqual(await readdir(join(target, 'netlify/functions/lib/interview')), ['voice']);
    assert.deepEqual((await readdir(join(target, 'netlify/functions/lib/interview/voice'))).sort(), ['barge-in.mjs', 'regions.mjs']);
    await assert.rejects(stat(join(target, 'netlify/database')));
    // The live price read needs the database, so the editor gets a reader with no prices (GRE-4714).
    const livePricing = await readFile(join(target, 'app/live-pricing.js'), 'utf8');
    assert.doesNotMatch(livePricing, /import/);
    assert.match(livePricing, /export async function readLivePricing\(\) \{\n {2}return null;/);
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});
