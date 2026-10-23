// Public catalogue actions run as anon in a short transaction. The migrated database grants only the
// public read and the two existing, narrow functions; it never exposes its owner connection to a request.
const CLAIMS = JSON.stringify({ role: 'anon', sub: null, email: null, email_verified: false });

export async function asPublicAnon(pool, ip, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE anon');
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [CLAIMS]);
    await client.query("SELECT set_config('request.headers', $1, true)", [JSON.stringify({ 'x-forwarded-for': ip })]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* connection lost */ }
    throw error;
  } finally {
    client.release();
  }
}

export const publicIp = (req, context) => String(context?.ip || req.headers.get('x-nf-client-connection-ip') ||
  (req.headers.get('x-forwarded-for') || '').split(',')[0] || '').trim().slice(0, 64);
