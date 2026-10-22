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
    for (const script of ['gen-seo-files.mjs', 'prepare-puck-css.mjs']) {
      assert.ok((await stat(join(target, 'scripts', script))).isFile());
    }
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});
