import { timingSafeEqual } from 'node:crypto';
import { getDatabase } from '@netlify/database';

const STAGING_SITE_ID = '8c1135a6-6f8e-43f4-b9b2-3c4d5b6a36cb';
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const CLIENTS = [
  ['GRE-2066 MCP test client A', 'gre-2066-mcp-test-a'],
  ['GRE-2066 MCP test client B', 'gre-2066-mcp-test-b'],
];

export function fixtureAllowed(env, suppliedSecret) {
  const expected = env.STAGING_MCP_FIXTURE_SECRET;
  if (env.SITE_ID !== STAGING_SITE_ID || typeof expected !== 'string' || expected.length < 32 ||
      typeof suppliedSecret !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(suppliedSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function runStagingMcpFixture(action, value, { siteId = process.env.SITE_ID, pool } = {}) {
  if (siteId !== STAGING_SITE_ID) throw new Error('Staging site only');
  if (action === 'setup' && !/^[0-9a-f]{64}$/.test(value)) throw new RangeError('A SHA-256 hash is required');
  if (action === 'revoke' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
    throw new RangeError('A token id is required');
  if (action !== 'setup' && action !== 'revoke') throw new RangeError('Invalid action');
  pool ||= getDatabase().pool;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (action === 'revoke') {
      const { rows } = await client.query(`SELECT id FROM public.mcp_tokens
        WHERE id = $1::uuid AND org_id = $2::uuid AND label = 'GRE-2066 staging MCP test'`, [value, ORG_ID]);
      if (!rows[0]) throw new RangeError('Fixture token not found');
      await client.query('SELECT public.mcp_portal_revoke_token($1::uuid)', [value]);
      await client.query('COMMIT');
      return { revoked: true };
    }
    await client.query(`INSERT INTO public.organisations (id, slug, name)
      VALUES ($1::uuid, 'gre-2066-mcp-test', 'GRE-2066 MCP test organisation')
      ON CONFLICT (id) DO NOTHING`, [ORG_ID]);
    const ids = [];
    for (const [name, slug] of CLIENTS) {
      const { rows } = await client.query(`INSERT INTO public.customers (org_id, name, slug)
        VALUES ($1::uuid, $2, $3) ON CONFLICT (org_id, slug)
        DO UPDATE SET name = EXCLUDED.name RETURNING id`, [ORG_ID, name, slug]);
      ids.push(rows[0].id);
    }
    const { rows } = await client.query(`INSERT INTO public.mcp_tokens (org_id, label, token_sha256)
      VALUES ($1::uuid, 'GRE-2066 staging MCP test', $2) RETURNING id`, [ORG_ID, value]);
    await client.query('INSERT INTO public.mcp_token_clients (token_id, customer_id) VALUES ($1::uuid, $2::uuid)',
      [rows[0].id, ids[0]]);
    await client.query('COMMIT');
    return { tokenId: rows[0].id, clientAId: ids[0], clientBId: ids[1] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
