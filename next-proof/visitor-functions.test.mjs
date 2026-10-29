import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
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
    for (const name of ['enquiry', 'catalogue']) {
      const entry = join(target, 'netlify/functions', `${name}.mjs`);
      assert.ok((await stat(entry)).isFile());
      await build({ entryPoints: [entry], bundle: true, platform: 'node', packages: 'external', write: false });
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
    for (const name of ['@netlify/database', '@netlify/database-dev']) {
      assert.equal(pkg.dependencies?.[name], undefined);
      assert.equal(pkg.devDependencies?.[name], undefined);
      assert.equal(lock.packages[''].dependencies?.[name], undefined);
      assert.equal(lock.packages[''].devDependencies?.[name], undefined);
    }
    await assert.rejects(stat(join(target, 'netlify/functions')));
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});

test('preview editor package alone receives the exact localhost host policy', async () => {
  const target = await mkdtemp(join(tmpdir(), 'greatstone-next-editor-preview-'));
  try {
    await exec(process.execPath, ['next-proof/scripts/prepare-netlify.mjs', target, '--editor-preview']);
    const previewConfig = await readFile(join(target, 'next-proof/editor-preview-config.mjs'), 'utf8');
    assert.match(previewConfig, /gsam-editor-gre3201--greatstone-home\.netlify\.app/);
    assert.match(previewConfig, /http:\/\/localhost:3200/);
    assert.match(previewConfig, /b546812d-8d25-49dc-94c2-e04a5b31bde4/);
    assert.equal(await readFile('next-proof/editor-preview-config.mjs', 'utf8'),
      '// Replaced only in the isolated editor preview package by prepare-netlify.mjs.\nexport const editorPreviewConfig = null;\n');
    assert.doesNotMatch(await readFile(join(target, 'netlify.toml'), 'utf8'), /localhost/);
    await assert.rejects(stat(join(target, 'netlify/functions')));
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});
