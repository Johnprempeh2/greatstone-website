import test from 'node:test';
import assert from 'node:assert/strict';
import { checkEditorHtml, verifyEditorAlias, EDITOR_SITE_ID } from './deploy-editor-alias.mjs';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const page = (siteId, contract) => `<html><head><meta name="gsam-editor-site-id" content="${siteId}"/><meta content="${contract}" name="gsam-editor-contract"/></head></html>`;

test('editor alias guard rejects the proof site and an old editor contract', () => {
  assert.throws(() => checkEditorHtml(page('00000000-0000-4000-8000-000000001833', '2')), /Editor alias mismatch/);
  assert.throws(() => checkEditorHtml(page(EDITOR_SITE_ID, '1')), /Editor alias mismatch/);
  assert.deepEqual(checkEditorHtml(page(EDITOR_SITE_ID, '2')), { siteId: EDITOR_SITE_ID, contract: '2' });
});

test('editor alias guard checks the deployed HTTP response', async () => {
  await assert.rejects(verifyEditorAlias(async () => ({ ok: false, status: 404 })), /HTTP 404/);
  assert.deepEqual(await verifyEditorAlias(async () => ({ ok: true, text: async () => page(EDITOR_SITE_ID, '2') })), { siteId: EDITOR_SITE_ID, contract: '2' });
});

test('editor alias refuses a contract failure before starting Netlify', () => {
  const dir = mkdtempSync(join(tmpdir(), 'editor-guard-'));
  try {
    writeFileSync(join(dir, 'node'), '#!/bin/sh\nexit 17\n', { mode: 0o755 });
    writeFileSync(join(dir, 'npx'), '#!/bin/sh\nprintf called > "$DEPLOY_LOG"\n', { mode: 0o755 });
    const result = spawnSync(process.execPath, [new URL('./deploy-editor-alias.mjs', import.meta.url).pathname, 'test-site'], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`,
        NETLIFY_AUTH_TOKEN: 'test-token', DEPLOY_LOG: join(dir, 'deployed') } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Site contract check failed \(17\)/);
    assert.throws(() => readFileSync(join(dir, 'deployed')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
