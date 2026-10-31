// ComposeExplorer problems (GRE-3407): the business problems and the catalogue slugs that answer each, read as anon
// from compose_problems / compose_problem_services (migration 059, public read RLS). The block reads this at runtime,
// so an edit to the database reaches every page that shows the block.
import { getPool } from './lib/db.mjs';
import { asPublicAnon, publicIp } from './lib/public-actions.mjs';

const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60', 'x-content-type-options': 'nosniff' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

export async function readComposeProblems(client) {
  const { rows } = await client.query(`SELECT p.id, p.title, p.subline, p.source, p.placeholder,
      COALESCE(array_agg(s.service_slug ORDER BY s.sort, s.service_slug) FILTER (WHERE s.service_slug IS NOT NULL), '{}') AS services
    FROM compose_problems p LEFT JOIN compose_problem_services s ON s.problem_id = p.id
    GROUP BY p.id ORDER BY p.sort, p.id`);
  return rows;
}

export function makeComposeProblemsHandler({ pool = getPool, read = readComposeProblems, log = console.error } = {}) {
  return async (req, context) => {
    if (req.method !== 'GET') return json({ error: 'Use GET.' }, 405);
    try {
      const db = pool();
      if (!db) return json({ error: 'Problems unavailable.' }, 503);
      return json(await asPublicAnon(db, publicIp(req, context), read));
    } catch (error) {
      log('compose-problems: read failed (' + (error?.code || error?.name || 'error') + ')');
      return json({ error: 'Problems unavailable.' }, 503);
    }
  };
}

export default makeComposeProblemsHandler();
export const config = { path: '/api/compose-problems' };
