// Copy lost interview rows from a database branch back to the live database (GRE-4942). Never a snapshot restore:
// on the Netlify Database API a restore replaces the whole target branch, so it would wipe every answer written after
// the snapshot. This copies only rows that the branch has and the live database lacks, for one organisation and one
// time window, and changes nothing else.
//
//   COPY_BACK_SOURCE_URL=<branch owner url> COPY_BACK_TARGET_URL=<live owner url> \
//     node scripts/db-copy-back.mjs --customer <customers.id> --from <iso> [--to <iso>] [--apply]
//
// Without --apply it is a dry run: the same inserts and checks run in a transaction that is rolled back. Rows are
// matched by primary key and inserted with ON CONFLICT DO NOTHING, so a second run inserts nothing (idempotent). A row
// the live database already has is left as it is, even if the branch's copy differs: live wins. Parent tables go
// first (session, then turn and usage_ledger), so a lost session and its turns come back together. After the inserts,
// the md5 of the copied rows on the live database must equal the md5 of the same rows on the branch; if not, or if a
// row cannot be inserted, the transaction is rolled back and the script exits 1. Rows deleted on purpose stay deleted:
// a person with a withdrawal on live since --from is left out, and a retention or self-service deletion record since
// --from stops the run. Output: one JSON report on stdout.
import pg from 'pg';

// [table, time column] in insert order. Every table carries customer_id (the website organisation, migration 068).
export const TABLES = [
  ['interview.session', 'started_at'],
  ['interview.turn', 'ts'],
  ['interview.usage_ledger', 'ts'],
];

const quoteIdent = (s) => `"${s.replace(/"/g, '""')}"`;
const qualified = (table) => table.split('.').map(quoteIdent).join('.');

async function columnsOf(client, table) {
  const [schema, name] = table.split('.');
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
    [schema, name],
  );
  return rows.map((r) => r.column_name);
}

// md5 of the rows with these ids, over these columns, in id order: the same text on both sides when the rows match.
async function md5Of(client, table, cols, ids) {
  const list = cols.map(quoteIdent).join(', ');
  const { rows } = await client.query(
    `SELECT md5(coalesce(string_agg(row_to_json(r)::text, E'\\n' ORDER BY r.id), '')) AS md5
       FROM (SELECT ${list} FROM ${qualified(table)} WHERE id = ANY($1::uuid[])) r`,
    [ids],
  );
  return rows[0].md5;
}

/**
 * Copy the rows of one organisation in [from, to) that `source` has and `target` lacks. `source` and `target` are
 * connected pg clients (owner role). Returns { applied, ok, tables: [{ table, candidates, present, inserted,
 * skipped, md5Source, md5Target }] }. Throws (after rollback) when a check fails.
 */
export async function copyBack({ source, target, customerId, from, to = null, apply = false, tables = TABLES }) {
  if (!customerId || !from) throw new Error('customerId and from are required');
  const report = { applied: false, ok: false, customerId, from, to, withheldUsers: [], tables: [] };
  await target.query('BEGIN');
  try {
    // A deletion on purpose after the recovery point must stay deleted (GRE-2653 data rights). A retention or
    // self-service deletion record stops the run; a person who withdrew keeps their rows out of the copy.
    const { rows: deletions } = await target.query(
      `SELECT kind, created_at FROM interview.deletion_record WHERE customer_id = $1 AND created_at >= $2 ORDER BY created_at`,
      [customerId, from],
    );
    if (deletions.length) {
      throw new Error(`a ${deletions[0].kind} deletion ran for this organisation at ${deletions[0].created_at.toISOString()}: set --to before it`);
    }
    const { rows: withdrawn } = await target.query(
      `SELECT DISTINCT user_id FROM interview.withdrawal WHERE customer_id = $1 AND at >= $2`,
      [customerId, from],
    );
    report.withheldUsers = withdrawn.map((r) => r.user_id).sort();

    for (const [table, timeCol] of tables) {
      const srcCols = await columnsOf(source, table);
      const tgtCols = new Set(await columnsOf(target, table));
      const extra = srcCols.filter((c) => !tgtCols.has(c));
      if (extra.length) throw new Error(`${table}: the branch has columns the live database lacks (${extra.join(', ')})`);

      // usage_ledger has no user_id: a withdrawn person's ledger rows stay on live (session_id set to NULL), so they
      // are never missing there
      const byUser = srcCols.includes('user_id');
      const { rows: src } = await source.query(
        `SELECT id, ${byUser ? 'user_id' : 'NULL AS user_id'}, row_to_json(x)::text AS j FROM ${qualified(table)} x
          WHERE customer_id = $1 AND ${quoteIdent(timeCol)} >= $2 AND ($3::timestamptz IS NULL OR ${quoteIdent(timeCol)} < $3)
          ORDER BY id`,
        [customerId, from, to],
      );
      const ids = src.map((r) => r.id);
      const { rows: have } = await target.query(`SELECT id FROM ${qualified(table)} WHERE id = ANY($1::uuid[])`, [ids]);
      const present = new Set(have.map((r) => r.id));
      const withheld = src.filter((r) => !present.has(r.id) && report.withheldUsers.includes(r.user_id));
      const missing = src.filter((r) => !present.has(r.id) && !report.withheldUsers.includes(r.user_id));

      let inserted = [];
      if (missing.length) {
        const list = srcCols.map(quoteIdent).join(', ');
        // the rows travel as JSON text, so bigint, numeric and timestamptz values are not rounded by JavaScript
        const { rows } = await target.query(
          `INSERT INTO ${qualified(table)} (${list})
           SELECT ${list} FROM json_populate_recordset(NULL::${qualified(table)}, $1::json)
           ON CONFLICT DO NOTHING RETURNING id`,
          [`[${missing.map((r) => r.j).join(',')}]`],
        );
        inserted = rows.map((r) => r.id).sort();
      }
      const md5Source = await md5Of(source, table, srcCols, inserted);
      const md5Target = await md5Of(target, table, srcCols, inserted);
      const skipped = missing.map((r) => r.id).filter((id) => !inserted.includes(id));
      report.tables.push({
        table, candidates: ids.length, present: present.size, withheld: withheld.length, inserted: inserted.length,
        insertedIds: inserted, skipped, md5Source, md5Target,
      });
      if (md5Source !== md5Target) throw new Error(`${table}: copied rows differ from the branch (md5 ${md5Target} != ${md5Source})`);
    }
    if (apply) {
      await target.query('COMMIT');
      report.applied = true;
    } else {
      await target.query('ROLLBACK');
    }
    report.ok = true;
    return report;
  } catch (e) {
    await target.query('ROLLBACK').catch(() => {});
    e.report = report;
    throw e;
  }
}

export function parseArgs(argv) {
  const out = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--customer') out.customerId = argv[++i];
    else if (a === '--from') out.from = argv[++i];
    else if (a === '--to') out.to = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(out.customerId || '')) throw new Error('--customer <customers.id uuid> is required');
  for (const k of ['from', 'to']) {
    if (out[k] !== undefined && Number.isNaN(Date.parse(out[k]))) throw new Error(`--${k} must be an ISO time`);
  }
  if (!out.from) throw new Error('--from <iso time> is required (the snapshot time or a little before the loss)');
  return out;
}

// The two URLs must name different databases: copying a database onto itself proves nothing.
export function sameDatabase(a, b) {
  const key = (u) => { const x = new URL(u); return `${x.hostname}:${x.port}${x.pathname}?${x.searchParams.get('host') || ''}`; };
  return key(a) === key(b);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { COPY_BACK_SOURCE_URL: src, COPY_BACK_TARGET_URL: tgt } = process.env;
  if (!src || !tgt) throw new Error('set COPY_BACK_SOURCE_URL (the branch) and COPY_BACK_TARGET_URL (live)');
  if (sameDatabase(src, tgt)) throw new Error('source and target are the same database');
  const source = new pg.Client({ connectionString: src });
  const target = new pg.Client({ connectionString: tgt });
  await source.connect();
  await target.connect();
  try {
    // the branch is only read: a read-only transaction makes a swapped pair of URLs fail before any write
    await source.query('BEGIN TRANSACTION READ ONLY');
    const report = await copyBack({ source, target, ...args });
    console.log(JSON.stringify(report, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: e.message, ...(e.report || {}) }, null, 2));
    process.exitCode = 1;
  } finally {
    await source.query('ROLLBACK').catch(() => {});
    await source.end();
    await target.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
