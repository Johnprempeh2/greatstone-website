// Optional server-side mirror for portal PDFs. Netlify Blobs remains the durable copy.
// Netlify environment settings select either a user's OneDrive or a SharePoint site's default drive.
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function oneDriveSettings(env = process.env) {
  const enabled = env.PORTAL_ONEDRIVE_ENABLED === 'true';
  const type = env.PORTAL_ONEDRIVE_ACCOUNT_TYPE;
  const tenant = env.PORTAL_ONEDRIVE_TENANT_ID;
  const account = env.PORTAL_ONEDRIVE_ACCOUNT_ID;
  const folder = env.PORTAL_ONEDRIVE_FOLDER_ID;
  const client = env.PORTAL_ONEDRIVE_CLIENT_ID;
  const secret = env.PORTAL_ONEDRIVE_CLIENT_SECRET;
  const valid = GUID.test(tenant || '') && GUID.test(client || '') &&
    ['user', 'site'].includes(type) && !!account && !!folder && !!secret;
  return { enabled: enabled && valid, requested: enabled, type, tenant, account, folder, client, secret };
}

export function createOneDrive({ env = process.env, fetcher = fetch } = {}) {
  const settings = oneDriveSettings(env);
  const fileUrl = (path) => {
    // The portal's private blob key becomes one opaque file name, so Graph needs no folder creation.
    const name = Buffer.from(path).toString('base64url') + '.pdf';
    return `https://graph.microsoft.com/v1.0/${settings.type === 'site' ? 'sites' : 'users'}/${encodeURIComponent(settings.account)}` +
      `/drive/items/${encodeURIComponent(settings.folder)}:/${encodeURIComponent(name)}:/content`;
  };
  const token = async () => {
    const response = await fetcher(`https://login.microsoftonline.com/${settings.tenant}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(5000),
      body: new URLSearchParams({ client_id: settings.client, client_secret: settings.secret,
        scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    });
    if (!response.ok) throw new Error('Graph token unavailable');
    const data = await response.json();
    if (!data.access_token) throw new Error('Graph token unavailable');
    return data.access_token;
  };
  const request = async (path, method, bytes) => {
    const response = await fetcher(fileUrl(path), { method,
      headers: { authorization: `Bearer ${await token()}`, ...(method === 'PUT' ? { 'content-type': 'application/pdf' } : {}) },
      signal: AbortSignal.timeout(5000),
      ...(method === 'PUT' ? { body: bytes } : {}),
    });
    if (!response.ok) throw new Error('Graph file unavailable');
    return response;
  };
  return {
    enabled: settings.enabled,
    put: (path, bytes) => request(path, 'PUT', bytes),
    get: async (path) => (await request(path, 'GET')).arrayBuffer(),
  };
}

export function portalFileStorage({ blob, graph = createOneDrive(), log = console.error }) {
  return {
    async set(path, bytes) {
      await blob().set(path, bytes);
      if (graph.enabled) {
        try { await graph.put(path, bytes); }
        catch (error) { log('portal-onedrive: mirror failed (' + (error?.name || 'error') + ')'); }
      }
    },
    async get(path) {
      if (graph.enabled) {
        try { return await graph.get(path); }
        catch (error) { log('portal-onedrive: read failed; using private blob (' + (error?.name || 'error') + ')'); }
      }
      return blob().get(path, { type: 'arrayBuffer' });
    },
  };
}
