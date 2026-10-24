import assert from 'node:assert/strict';
import test from 'node:test';
import { createOneDrive, oneDriveSettings, portalFileStorage } from '../functions/lib/portal-onedrive.mjs';

const env = {
  PORTAL_ONEDRIVE_ENABLED: 'true', PORTAL_ONEDRIVE_TENANT_ID: '00000000-0000-4000-8000-000000000001',
  PORTAL_ONEDRIVE_CLIENT_ID: '00000000-0000-4000-8000-000000000002', PORTAL_ONEDRIVE_CLIENT_SECRET: 'test-secret',
  PORTAL_ONEDRIVE_ACCOUNT_TYPE: 'user', PORTAL_ONEDRIVE_ACCOUNT_ID: 'account@example.test',
  PORTAL_ONEDRIVE_FOLDER_ID: 'folder-id',
};

test('Graph stays off until explicitly enabled with complete server settings', () => {
  assert.equal(oneDriveSettings({ ...env, PORTAL_ONEDRIVE_ENABLED: 'false' }).enabled, false);
  assert.equal(oneDriveSettings({ ...env, PORTAL_ONEDRIVE_FOLDER_ID: '' }).enabled, false);
  assert.equal(oneDriveSettings({ ...env, PORTAL_ONEDRIVE_TENANT_ID: 'bad' }).enabled, false);
  assert.equal(oneDriveSettings(env).enabled, true);
});

test('mocked Graph uploads and downloads from configured OneDrive or SharePoint folder', async () => {
  for (const type of ['user', 'site']) {
    const calls = [];
    const fetcher = async (url, options) => {
      calls.push({ url, options });
      if (url.includes('/token')) return Response.json({ access_token: 'mock-token' });
      return options.method === 'PUT' ? Response.json({ id: 'item' }) : new Response('%PDF-graph');
    };
    const graph = createOneDrive({ env: { ...env, PORTAL_ONEDRIVE_ACCOUNT_TYPE: type }, fetcher });
    await graph.put('private/path.pdf', new TextEncoder().encode('%PDF-graph'));
    assert.equal(new TextDecoder().decode(await graph.get('private/path.pdf')), '%PDF-graph');
    assert.equal(calls.filter((c) => c.url.includes('/token')).length, 2);
    assert.ok(calls[1].url.includes(`/${type === 'user' ? 'users' : 'sites'}/`));
    assert.ok(calls[1].url.includes('/drive/items/folder-id:/'));
    assert.equal(calls[1].options.headers.authorization, 'Bearer mock-token');
    assert.equal(calls[3].options.method, 'GET');
    assert.equal(calls[1].url, calls[3].url);
  }
});

test('private blob is saved first, and survives Graph upload and download failures', async () => {
  const saved = new Map();
  const events = [];
  const graph = createOneDrive({ env, fetcher: async (url) => {
    if (url.includes('/token')) return Response.json({ access_token: 'mock-token' });
    events.push('graph');
    return new Response('unavailable', { status: 503 });
  } });
  const files = portalFileStorage({
    blob: () => ({ set: async (key, bytes) => { events.push('blob'); saved.set(key, bytes); },
      get: async (key) => saved.get(key) }),
    graph,
    log: () => {},
  });
  const bytes = new TextEncoder().encode('%PDF-saved');
  await files.set('private/path.pdf', bytes);
  assert.deepEqual(events, ['blob', 'graph']);
  assert.equal(new TextDecoder().decode(await files.get('private/path.pdf')), '%PDF-saved');
});

test('disconnected mode uses only private blobs', async () => {
  const bytes = new Uint8Array([37, 80, 68, 70]);
  const calls = [];
  const files = portalFileStorage({ blob: () => ({ set: async () => { calls.push('set'); },
    get: async () => { calls.push('get'); return bytes; } }),
  graph: { enabled: false, put: async () => { throw new Error('Graph called'); },
    get: async () => { throw new Error('Graph called'); } } });
  await files.set('path.pdf', bytes);
  assert.equal(await files.get('path.pdf'), bytes);
  assert.deepEqual(calls, ['set', 'get']);
});

test('blob failure prevents a Graph-only copy', async () => {
  let graphCalled = false;
  const files = portalFileStorage({ blob: () => ({ set: async () => { throw new Error('storage'); } }),
    graph: { enabled: true, put: async () => { graphCalled = true; } } });
  await assert.rejects(files.set('path.pdf', new Uint8Array()), /storage/);
  assert.equal(graphCalled, false);
});
