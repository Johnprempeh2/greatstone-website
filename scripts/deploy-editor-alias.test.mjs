import test from 'node:test';
import assert from 'node:assert/strict';
import { checkEditorHtml, verifyEditorAlias, EDITOR_SITE_ID } from './deploy-editor-alias.mjs';

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
