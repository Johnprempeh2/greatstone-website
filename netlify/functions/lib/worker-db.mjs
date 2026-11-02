// Scheduled jobs use the migration's worker role, never the pool owner's privileges.
export async function asWorker(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE service_role');
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({
      role: 'service_role', sub: null, email: null, email_verified: false,
    })]);
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
