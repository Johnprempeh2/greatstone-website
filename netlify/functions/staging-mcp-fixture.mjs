import { fixtureAllowed, runStagingMcpFixture } from './lib/staging-mcp-fixture.mjs';

const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (body, status) => Response.json(body, { status, headers });

export function makeStagingMcpFixtureHandler({ env = process.env, run = runStagingMcpFixture } = {}) {
  return async (request) => {
    if (!fixtureAllowed(env, request.headers.get('x-staging-fixture-secret'))) return json({ error: 'Not found' }, 404);
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (Number(request.headers.get('content-length')) > 512) return json({ error: 'Invalid input' }, 400);
    let input;
    try {
      const body = await request.text();
      if (Buffer.byteLength(body) > 512) return json({ error: 'Invalid input' }, 400);
      input = JSON.parse(body);
    } catch { return json({ error: 'Invalid input' }, 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        (input.action === 'setup' && (Object.keys(input).sort().join(',') !== 'action,hash' || !/^[0-9a-f]{64}$/.test(input.hash))) ||
        (input.action === 'revoke' && (Object.keys(input).sort().join(',') !== 'action,tokenId' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.tokenId))) ||
        !['setup', 'revoke'].includes(input.action)) return json({ error: 'Invalid input' }, 400);
    try {
      const result = await run(input.action, input.action === 'setup' ? input.hash : input.tokenId,
        { siteId: env.SITE_ID });
      return json(result, 200);
    } catch {
      return json({ error: 'Fixture unavailable' }, 503);
    }
  };
}

export default makeStagingMcpFixtureHandler();
export const config = { path: '/api/staging-mcp-fixture' };
