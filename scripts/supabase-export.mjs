// The Supabase side of the cut-over row move (GRE-2567, cut-over plan section 4 steps 4 and 7, rehearsal step H).
// It reads the old database in one read-only snapshot and writes the two importer inputs for owner-import-run.mjs:
//   identities.json   auth.users as the 052_better_auth/import-users.mjs shape ({ id, email, name, emailVerified,
//                     passwordHash }), for `submit --mode identities`
//   tables.json       { table: [rowObject] } for every TABLES entry, for `submit --mode tables`
//   counts.json       row counts only: every public table, auth.users and storage.objects
// It prints counts and table names only, never row values. Needs SUPABASE_DB_URL (a read-only login is enough).
//
//   counts                              print the counts; writes nothing (the before, after and catch-up checks)
//   export --out <dir>                  write the three files into <dir> (run scratch), mode 0600, never over an
//                                       existing file
//   export --since <step 4 dir> --out <dir>
//                                       the catch-up (cut-over step 7, GRE-3902): the same files, holding only the rows
//                                       whose primary key is not in the earlier export. identities.json is written only
//                                       when new users appeared, and then holds every user, as the importer checks an
//                                       exact count (SITES identityCount must change to it in a reviewed release first).
//                                       A row changed or removed since the earlier export stops it for a person, and it
//                                       writes nothing.
//
// It exits non-zero when a public table outside TABLES has rows (they would be left behind), when a user has no
// password, or when storage holds objects (the move has no file step). Remove the files in the same run.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { TABLES, stableStringify } from '../netlify/functions/lib/owner-import.mjs';

const quoteIdent = (name) => `"${String(name).replaceAll('"', '""')}"`;
const regclass = async (client, name) => (await client.query('SELECT to_regclass($1) IS NOT NULL AS ok', [name])).rows[0].ok;

/** Row counts for every public table, auth.users and storage.objects, in the caller's snapshot. */
export async function sourceCounts(client) {
  const { rows } = await client.query(`SELECT c.relname AS table FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') ORDER BY c.relname`);
  const tables = {};
  for (const { table } of rows)
    tables[table] = (await client.query(`SELECT count(*)::int AS n FROM public.${quoteIdent(table)}`)).rows[0].n;
  const count = async (name) => (await regclass(client, name))
    ? (await client.query(`SELECT count(*)::int AS n FROM ${name}`)).rows[0].n : null;
  const users = (await regclass(client, 'auth.users'))
    ? (await client.query(`SELECT count(*)::int AS total,
         count(*) FILTER (WHERE encrypted_password IS NULL OR encrypted_password = '')::int AS "noPassword"
         FROM auth.users WHERE deleted_at IS NULL`)).rows[0]
    : { total: null, noPassword: null };
  return { tables, authUsers: users.total, authUsersNoPassword: users.noPassword, storageObjects: await count('storage.objects') };
}

/** What stops a full move: rows outside TABLES, a user with no password, stored files. Names and counts only. */
export function problems(counts) {
  const out = [];
  for (const [table, n] of Object.entries(counts.tables))
    if (n > 0 && !TABLES.includes(table)) out.push(`Rows outside TABLES: ${table} (${n})`);
  for (const table of TABLES) if (!Object.hasOwn(counts.tables, table)) out.push(`Missing on the source: ${table}`);
  if (counts.authUsersNoPassword) out.push(`Users with no password: ${counts.authUsersNoPassword}`);
  if (counts.storageObjects) out.push(`Stored files: ${counts.storageObjects} (the move has no file step)`);
  return out;
}

const IDENTITIES = `SELECT id::text AS id, email,
    coalesce(nullif(raw_user_meta_data->>'full_name', ''), nullif(raw_user_meta_data->>'name', ''), email) AS name,
    email_confirmed_at IS NOT NULL AS "emailVerified", encrypted_password AS "passwordHash"
    FROM auth.users WHERE deleted_at IS NULL ORDER BY id`;

/**
 * The export, in one REPEATABLE READ READ ONLY transaction so the counts match the rows. Table rows stay as
 * Postgres's own JSON text (no number round trip). Returns { identities, tablesJson, counts }.
 */
export async function exportSource(client) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const counts = await sourceCounts(client);
    const { rows: identities } = await client.query(IDENTITIES);
    const parts = [];
    for (const table of TABLES) {
      if (!Object.hasOwn(counts.tables, table)) { parts.push(`${JSON.stringify(table)}:[]`); continue; }
      const { rows: [r] } = await client.query(
        `SELECT coalesce(json_agg(t), '[]'::json)::text AS rows, count(*)::int AS n FROM public.${quoteIdent(table)} t`);
      if (r.n !== counts.tables[table]) throw new Error(`Count moved inside the snapshot: ${table}`);
      parts.push(`${JSON.stringify(table)}:${r.rows}`);
    }
    return { identities, tablesJson: `{${parts.join(',')}}`, counts };
  } finally { await client.query('ROLLBACK'); }
}

/** Primary-key columns of every TABLES entry that has one, from the source catalog. */
export async function primaryKeys(client) {
  const { rows } = await client.query(`SELECT c.relname AS table, array_agg(a.attname::text ORDER BY k.ord) AS cols
      FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
      CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
     WHERE i.indisprimary AND c.relnamespace = 'public'::regnamespace AND c.relname = ANY($1::text[])
     GROUP BY c.relname`, [TABLES]);
  return new Map(rows.map((r) => [r.table, r.cols]));
}

/**
 * The catch-up read, in one REPEATABLE READ READ ONLY transaction: the counts, the identities, every TABLES row as
 * Postgres's own JSON text, and the primary keys. Returns { identities, rows: { table: [jsonText] }, keys, counts }.
 */
export async function readSource(client) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const counts = await sourceCounts(client);
    const { rows: identities } = await client.query(IDENTITIES);
    const keys = await primaryKeys(client);
    const rows = {};
    for (const table of TABLES) {
      if (!Object.hasOwn(counts.tables, table)) { rows[table] = []; continue; }
      rows[table] = (await client.query(`SELECT row_to_json(t)::text AS j FROM public.${quoteIdent(table)} t`)).rows.map((r) => r.j);
      if (rows[table].length !== counts.tables[table]) throw new Error(`Count moved inside the snapshot: ${table}`);
    }
    return { identities, rows, keys, counts };
  } finally { await client.query('ROLLBACK'); }
}

/** The earlier (step 4) export's tables and identities. A fixed message on failure: a JSON error quotes the file. */
export function readSince(dir) {
  try {
    const tables = JSON.parse(readFileSync(join(dir, 'tables.json'), 'utf8'));
    const identities = JSON.parse(readFileSync(join(dir, 'identities.json'), 'utf8'));
    if (!tables || typeof tables !== 'object' || Array.isArray(tables) || !Array.isArray(identities)) throw new Error();
    return { tables, identities };
  } catch { throw new Error('--since needs the earlier export\'s tables.json and identities.json'); }
}

/** Sorts one table's rows against the earlier export by key: new (kept as text), changed, removed. Counts only. */
function diffByKey(earlier, current, keyOf) {
  const before = new Map();
  for (const row of earlier) before.set(keyOf(row), stableStringify(row));
  const out = { new: [], changed: 0, removed: 0 };
  const seen = new Set();
  for (const { text, row } of current) {
    const key = keyOf(row);
    seen.add(key);
    if (!before.has(key)) out.new.push(text);
    else if (before.get(key) !== stableStringify(row)) out.changed++;
  }
  for (const key of before.keys()) if (!seen.has(key)) out.removed++;
  return out;
}

/**
 * The catch-up: what the source holds now against the earlier export. Returns
 *   tablesJson    { table: [row] } for every TABLES entry, only the rows whose key is not in the earlier export
 *   identities    every current user when new users appeared, else null (the importer checks an exact count)
 *   summary       { table: { new, changed, removed } } for tables where any is non-zero, and auth.users
 *   stops         what stops it for a person, names and counts only
 */
export function catchUp(since, current) {
  const summary = {};
  const stops = [];
  const parts = [];
  const note = (name, d) => {
    const n = { new: d.new.length, changed: d.changed, removed: d.removed };
    if (n.new || n.changed || n.removed) summary[name] = n;
    if (n.changed) stops.push(`Changed since the earlier export: ${name} (${n.changed})`);
    if (n.removed) stops.push(`Removed since the earlier export: ${name} (${n.removed})`);
  };
  for (const table of TABLES) {
    const earlier = Array.isArray(since.tables[table]) ? since.tables[table] : [];
    const rows = current.rows[table].map((text) => ({ text, row: JSON.parse(text) }));
    const key = current.keys.get(table);
    if (!key) {
      if (earlier.length || rows.length) stops.push(`No primary key on the source: ${table}`);
      parts.push(`${JSON.stringify(table)}:[]`);
      continue;
    }
    const d = diffByKey(earlier, rows, (row) => JSON.stringify(key.map((c) => row[c] ?? null)));
    note(table, d);
    parts.push(`${JSON.stringify(table)}:[${d.new.join(',')}]`);
  }
  const users = diffByKey(since.identities, current.identities.map((row) => ({ text: null, row })), (row) => row.id);
  note('auth.users', users);
  return { tablesJson: `{${parts.join(',')}}`, identities: users.new.length ? current.identities : null, summary, stops };
}

function printCounts(counts) {
  console.log(JSON.stringify(counts, null, 1));
  const total = Object.values(counts.tables).reduce((a, b) => a + b, 0);
  console.log(`Public rows: ${total} in ${Object.values(counts.tables).filter(Boolean).length} non-empty tables. auth.users: ${counts.authUsers}.`);
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const { positionals: [command], values } = parseArgs({ allowPositionals: true,
    options: { out: { type: 'string' }, since: { type: 'string' } } });
  if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL is required');
  if (command !== 'counts' && command !== 'export') throw new Error('Usage: counts | export [--since <dir>] --out <dir>');
  if (command === 'export' && !values.out) throw new Error('export needs --out <dir> (run scratch)');
  const since = command === 'export' && values.since ? readSince(values.since) : null;
  // parsing the URL can throw too (an uncaught error prints its input), so it sits inside the sanitised catch
  let client;
  let connected = false;
  try {
    client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    connected = true;
    const write = (name, text) => writeFileSync(join(values.out, name), text, { mode: 0o600, flag: 'wx' });
    if (command === 'counts') {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const counts = await sourceCounts(client);
      await client.query('ROLLBACK');
      printCounts(counts);
      for (const p of problems(counts)) console.log(p);
    } else if (since) {
      const current = await readSource(client);
      const { tablesJson, identities, summary, stops } = catchUp(since, current);
      printCounts(current.counts);
      console.log(`Since the earlier export: ${JSON.stringify(summary)}`);
      const found = [...problems(current.counts), ...stops];
      for (const p of found) console.log(p);
      if (found.length) {
        console.log('Stopped for a person: nothing written.');
        process.exitCode = 1;
      } else {
        write('tables.json', tablesJson);
        write('counts.json', JSON.stringify(current.counts, null, 1));
        if (identities) write('identities.json', JSON.stringify(identities));
        const moved = Object.entries(summary).filter(([t]) => t !== 'auth.users').reduce((a, [, n]) => a + n.new, 0);
        console.log(`Wrote tables.json (${moved} new rows) and counts.json.`);
        if (identities) console.log(`Wrote identities.json (${identities.length} users, ${summary['auth.users'].new} new): `
          + `the site's identityCount must become ${identities.length} in a reviewed release before it is submitted.`);
        else console.log('No new users: no identities.json.');
      }
    } else {
      const { identities, tablesJson, counts } = await exportSource(client);
      write('identities.json', JSON.stringify(identities));
      write('tables.json', tablesJson);
      write('counts.json', JSON.stringify(counts, null, 1));
      printCounts(counts);
      console.log(`Wrote identities.json (${identities.length}), tables.json (${TABLES.length} tables) and counts.json.`);
      const found = problems(counts);
      for (const p of found) console.log(p);
      if (found.length) process.exitCode = 1;
    }
  } catch (error) {
    // pg messages can carry row values, and connect messages SUPABASE_DB_URL parts (role, database, host); report
    // the code only, and never a connect message
    const reason = !connected ? `could not connect (${error.code ?? 'no code'})`
      : error.code ? `code ${error.code}` : error.message;
    console.error(`Export stopped: ${reason}`);
    process.exitCode = 1;
  } finally { if (connected) await client.end(); }
}
