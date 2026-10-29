import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyEditorPreview, EDITOR_PREVIEW_URL } from './deploy-editor-preview.mjs';
import { EDITOR_PREVIEW_ORIGIN, EDITOR_PREVIEW_SITE_ID } from '../next-proof/editor-preview-target.mjs';

const commit = 'a'.repeat(40);
const page = `<meta name="gsam-editor-site-id" content="${EDITOR_PREVIEW_SITE_ID}"/><meta name="gsam-editor-contract" content="2"/><meta name="gsam-editor-engine-commit" content="${commit}"/>`;
const response = (csp, html = page) => ({ ok: true, headers: new Headers({ 'content-security-policy': csp }), text: async () => html });

test('preview deploy verifier requires the exact frame policy, site ID and engine SHA', async () => {
  const fetchPage = async (url) => {
    assert.equal(url, EDITOR_PREVIEW_URL);
    return response(`default-src 'none'; frame-ancestors ${EDITOR_PREVIEW_ORIGIN}`);
  };
  assert.deepEqual(await verifyEditorPreview(fetchPage, commit), { siteId: EDITOR_PREVIEW_SITE_ID, contract: '2', commit });
  await assert.rejects(verifyEditorPreview(async () => response('frame-ancestors https://foreign.test'), commit), /frame policy mismatch/);
  await assert.rejects(verifyEditorPreview(async () => response(`frame-ancestors ${EDITOR_PREVIEW_ORIGIN} https://foreign.test`), commit), /frame policy mismatch/);
  await assert.rejects(verifyEditorPreview(async () => response(`frame-ancestors ${EDITOR_PREVIEW_ORIGIN}`, page.replace(commit, 'b'.repeat(40))), commit), /engine commit mismatch/);
});
