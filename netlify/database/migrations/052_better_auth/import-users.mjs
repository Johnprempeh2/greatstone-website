// One-time, reviewed staging migration for the eight existing identities.
// Read the approved export from stdin in run scratch; never store it in git.
// Dry-run by default. --apply commits only on the named staging site.
// Run out of band in a reviewed migration environment with the owner connection;
// never call this from a site request or deploy function.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getDatabase } from '@netlify/database';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BCRYPT = /^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/;

export function validateImport(input) {
  if (!Array.isArray(input) || input.length !== 8) throw new Error('Expected exactly eight source users');
  const ids = new Set();
  const emails = new Set();
  return input.map((user) => {
    if (!UUID.test(user?.id || '')) throw new Error('Invalid source id');
    if (!BCRYPT.test(user?.passwordHash || '')) throw new Error('Invalid source hash');
    if (typeof user?.email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user.email))
      throw new Error('Invalid source email');
    if (typeof user?.emailVerified !== 'boolean') throw new Error('Invalid source verification flag');
    const id = user.id.toLowerCase();
    const email = user.email.trim().toLowerCase();
    if (ids.has(id) || emails.has(email)) throw new Error('Duplicate source identity');
    ids.add(id); emails.add(email);
    return { id, email, name: String(user.name || email).slice(0, 200),
      emailVerified: user.emailVerified, passwordHash: user.passwordHash };
  });
}

export async function importUsers(pool, users, apply = false) {
  const client = await pool.connect();
  await client.query('BEGIN');
  try {
    const { rows: [identity] } = await client.query('SELECT current_user AS role');
    if (identity?.role !== 'netlifydb_owner') throw new Error('Import requires the migration owner role');
    for (const user of users) {
      const inserted = await client.query(`INSERT INTO better_auth."user"
        ("id","name","email","emailVerified") VALUES ($1,$2,$3,$4)
        ON CONFLICT ("id") DO NOTHING RETURNING "id"`,
      [user.id, user.name, user.email, user.emailVerified]);
      if (!inserted.rowCount) {
        const existing = (await client.query(`SELECT "email","emailVerified" FROM better_auth."user" WHERE "id"=$1`, [user.id])).rows[0];
        if (!existing || existing.email.toLowerCase() !== user.email || existing.emailVerified !== user.emailVerified)
          throw new Error('Existing identity differs from source');
      }
      const account = await client.query(`SELECT "password" FROM better_auth."account"
        WHERE "userId"=$1 AND "providerId"='credential'`, [user.id]);
      if (account.rows.length) {
        if (account.rows.length !== 1 || account.rows[0].password !== user.passwordHash)
          throw new Error('Existing password hash differs from source');
      } else {
        await client.query(`INSERT INTO better_auth."account"
          ("id","accountId","providerId","userId","password")
          VALUES ($1,$2,'credential',$2,$3)`, [randomUUID(), user.id, user.passwordHash]);
      }
    }
    const { rows } = await client.query(`SELECT count(*)::int AS count FROM better_auth."user" u
      JOIN better_auth."account" a ON a."userId"=u."id" AND a."providerId"='credential'
      WHERE u."id"=ANY($1::text[])`, [users.map((user) => user.id)]);
    if (rows[0].count !== 8) throw new Error('Imported identity count differs from source');
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    return rows[0].count;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  if (process.env.NETLIFY_SITE_NAME !== 'gre1795-website-db-staging'
    || process.env.SITE_ID !== '8c1135a6-6f8e-43f4-b9b2-3c4d5b6a36cb')
    throw new Error('This import runs only on the approved staging site');
  if (!process.env.NETLIFY_DB_URL) throw new Error('Import requires the owner connection from the migration environment');
  const users = validateImport(JSON.parse(readFileSync(0, 'utf8')));
  const pool = getDatabase().pool;
  try {
    const count = await importUsers(pool, users, process.argv.includes('--apply'));
    process.stdout.write(`${process.argv.includes('--apply') ? 'Imported' : 'Dry run verified'} ${count} identities.\n`);
  } finally { await pool.end(); }
}
