// GRE-2623: every client-scoped table must carry the website's client organisation id, which is
// `customer_id` (the `customers.id` row) — NOT `org_id`, which is the single-row Greatstone tenant and
// is on almost every table regardless of client data (Ridge/Everest, GRE-2609, 25 Oct). This reads a
// migrations directory — either flat `NNNN_name.sql` files (supabase/migrations) or one folder per
// migration holding `migration.sql` (+ optional `rollback.sql`) (netlify/database/migrations) — and
// exits 1 if a table ends up with neither `customer_id` nor an allow-list entry. A table that only
// carries `org_id` is NOT enough on its own: either add `customer_id`, or allow-list it in
// scripts/org-scope-allow.json (supabase/migrations) or scripts/org-scope-allow.netlify.json
// (netlify/database/migrations) as { "table": "reason" } — an entry with no reason fails. Tables are
// tracked across every schema a migration creates (not just `public`): a `CREATE SCHEMA x` followed by
// `SET LOCAL search_path TO x[, ...]` puts later unqualified CREATE TABLEs in `x`; an explicit
// `schema.table` is tracked under that schema regardless of search_path. Exits 1 if it finds zero
// tables — a migrations dir the scanner can't read must not read as a silent pass.
//
// It also exits 1 if any table other than the canonical client-identity table (customer_users), the
// website's own auth store (better_auth.user / better_auth.account), or the internal staff table
// (users) defines a password/password_hash column — that would mean a second place stores client (or
// staff) login credentials.
//
//   npm run org-scope:check             (supabase/migrations)
//   npm run org-scope:check:netlify      (netlify/database/migrations)
//   node scripts/check-org-scoping.mjs [migrationsDir] [allowFile]
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './check-rls.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IDENT = '"?([A-Za-z_][A-Za-z0-9_]*)"?';
const SCHEMA = `(?:${IDENT}\\s*\\.\\s*)?`;
const CLIENT_COLUMN = 'customer_id'; // the website organisation id (customers.id) — see header
const IDENTITY_TABLES = ['customer_users', 'better_auth.user', 'better_auth.account']; // where a client's own email/password may live
const STAFF_TABLES = ['users']; // internal Greatstone staff — out of scope per GRE-2623

const CREATE = new RegExp(`\\bCREATE\\s+(?:UNLOGGED\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${SCHEMA}${IDENT}\\s*\\(`, 'gi');
const ADD_COLUMN = new RegExp(
  `\\bALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?${SCHEMA}${IDENT}\\s+ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${IDENT}`,
  'gi',
);
const DROP_COLUMN = new RegExp(
  `\\bALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?${SCHEMA}${IDENT}\\s+DROP\\s+COLUMN\\s+(?:IF\\s+EXISTS\\s+)?${IDENT}`,
  'gi',
);
const CREATE_SCHEMA = /\bCREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;
const SEARCH_PATH = /\bSET\s+(?:LOCAL\s+)?search_path\s+(?:TO|=)\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;
const KEYWORDS = new Set(['constraint', 'primary', 'unique', 'check', 'foreign', 'exclude', 'like']);

/** schema.table (lowercase), or bare table when schema is public/unset — keeps existing allow-list keys working. */
const qualify = (schema, table) => (schema && schema.toLowerCase() !== 'public' ? `${schema.toLowerCase()}.${table.toLowerCase()}` : table.toLowerCase());

/** Index of the ')' that closes the '(' at openIndex, respecting nested parens and string literals. */
function matchingParen(code, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < code.length; i++) {
    if (code[i] === "'") {
      const end = code.indexOf("'", i + 1);
      i = end === -1 ? code.length : end;
      continue;
    }
    if (code[i] === '(') depth++;
    else if (code[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Top-level comma-separated items inside a parenthesised body (ignoring commas nested in parens). */
function splitTopLevel(body) {
  const items = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '(') depth++;
    else if (body[i] === ')') depth--;
    else if (body[i] === ',' && depth === 0) {
      items.push(body.slice(start, i));
      start = i + 1;
    }
  }
  items.push(body.slice(start));
  return items;
}

function columnNameOf(item) {
  const m = item.trim().match(/^"?([A-Za-z_][A-Za-z0-9_]*)"?/);
  if (!m) return null;
  const word = m[1].toLowerCase();
  if (KEYWORDS.has(word)) return null;
  return word;
}

/** Every position where the active unqualified-table schema changes: CREATE SCHEMA resets nothing by
 *  itself, but a later SET [LOCAL] search_path TO x puts unqualified tables in x from that point on. */
function schemaTimeline(code) {
  const events = [];
  SEARCH_PATH.lastIndex = 0;
  for (let m = SEARCH_PATH.exec(code); m; m = SEARCH_PATH.exec(code)) events.push({ at: m.index, schema: m[1] });
  events.sort((a, b) => a.at - b.at);
  return events;
}

function schemaAt(timeline, index) {
  let schema = 'public';
  for (const e of timeline) {
    if (e.at > index) break;
    schema = e.schema;
  }
  return schema;
}

/** What one migration does: tables it creates (with initial columns), and later ADD/DROP COLUMN, in
 *  order — each keyed by schema.table (see qualify). */
export function scanSql(sql) {
  const code = stripComments(sql);
  const timeline = schemaTimeline(code);
  const created = [];
  CREATE.lastIndex = 0;
  for (let m = CREATE.exec(code); m; m = CREATE.exec(code)) {
    const schema = m[1] ?? schemaAt(timeline, m.index);
    const openIndex = m.index + m[0].length - 1;
    const closeIndex = matchingParen(code, openIndex);
    if (closeIndex === -1) continue;
    const body = code.slice(openIndex + 1, closeIndex);
    const columns = splitTopLevel(body).map(columnNameOf).filter(Boolean);
    created.push({ at: m.index, table: qualify(schema, m[2]), columns });
  }
  const columnOps = [];
  ADD_COLUMN.lastIndex = 0;
  for (let m = ADD_COLUMN.exec(code); m; m = ADD_COLUMN.exec(code)) {
    const schema = m[1] ?? schemaAt(timeline, m.index);
    columnOps.push({ at: m.index, table: qualify(schema, m[2]), column: m[3].toLowerCase(), add: true });
  }
  DROP_COLUMN.lastIndex = 0;
  for (let m = DROP_COLUMN.exec(code); m; m = DROP_COLUMN.exec(code)) {
    const schema = m[1] ?? schemaAt(timeline, m.index);
    columnOps.push({ at: m.index, table: qualify(schema, m[2]), column: m[3].toLowerCase(), add: false });
  }
  columnOps.sort((a, b) => a.at - b.at);
  return { created, columnOps };
}

/** Migration files in a migrations directory, in run order: either flat `*.sql` files, or one folder
 *  per migration holding `migration.sql` (netlify/database/migrations' layout; `rollback.sql` is not a
 *  forward migration and is skipped). */
export function listMigrationFiles(dir) {
  const entries = readdirSync(dir).sort();
  const files = [];
  for (const name of entries) {
    const full = join(dir, name);
    if (name.endsWith('.sql') && statSync(full).isFile()) {
      files.push(full);
    } else if (statSync(full).isDirectory()) {
      const migration = join(full, 'migration.sql');
      if (existsSync(migration)) files.push(migration);
    }
  }
  return files;
}

/** Across a migrations directory (files in run order): every created table and its final column set. */
export function scanMigrations(dir) {
  const files = listMigrationFiles(dir);
  const tables = new Map(); // schema.table -> { file, columns: Set }
  for (const f of files) {
    const label = f.slice(dir.length + 1);
    const { created, columnOps } = scanSql(readFileSync(f, 'utf8'));
    for (const c of created) {
      if (!tables.has(c.table)) tables.set(c.table, { file: label, columns: new Set(c.columns) });
      else for (const col of c.columns) tables.get(c.table).columns.add(col);
    }
    for (const op of columnOps) {
      const t = tables.get(op.table);
      if (!t) continue; // ADD/DROP COLUMN on a table created outside this scan (or before it existed)
      if (op.add) t.columns.add(op.column);
      else t.columns.delete(op.column);
    }
  }
  return tables;
}

export function orgScopingProblems(tables, allow = {}) {
  const problems = [];
  for (const [t, reason] of Object.entries(allow)) {
    if (typeof reason !== 'string' || !reason.trim()) problems.push(`${t}: allow-list entry has no reason`);
  }
  for (const [t, { file, columns }] of [...tables].sort(([a], [b]) => a.localeCompare(b))) {
    if (t in allow) continue;
    if (!columns.has(CLIENT_COLUMN)) {
      problems.push(`${t}: no ${CLIENT_COLUMN} column (created in ${file}) — org_id alone is the Greatstone tenant, not the client`);
    }
  }
  return problems;
}

export function credentialDuplicationProblems(tables) {
  const problems = [];
  for (const [t, { file, columns }] of tables) {
    if (IDENTITY_TABLES.includes(t) || STAFF_TABLES.includes(t)) continue;
    if (columns.has('password') || columns.has('password_hash')) {
      problems.push(`${t}: has a password/password_hash column (created in ${file}) — client credentials must live only in customer_users or better_auth`);
    }
  }
  return problems;
}

function main(argv) {
  const [dirArg, allowArg] = argv;
  const dir = resolve(dirArg ?? join(ROOT, 'supabase/migrations'));
  const allowFile = resolve(allowArg ?? join(ROOT, 'scripts/org-scope-allow.json'));
  const allow = existsSync(allowFile) ? JSON.parse(readFileSync(allowFile, 'utf8')) : {};
  const tables = scanMigrations(dir);
  if (tables.size === 0) {
    console.error(`org-scope:check failed: found 0 tables under ${dir} — the scanner can't read this migrations layout, fix it rather than ship a silent pass.`);
    process.exit(1);
  }
  const problems = [...orgScopingProblems(tables, allow), ...credentialDuplicationProblems(tables)];
  const allowed = [...tables.keys()].filter((t) => t in allow).length;
  if (problems.length) {
    console.error(`org-scope:check failed: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error(`Add ${CLIENT_COLUMN} in a migration, or add the table to ${allowArg ?? 'scripts/org-scope-allow.json'} with a reason.`);
    process.exit(1);
  }
  console.log(`org-scope:check ok: ${tables.size} tables, every client-scoped table carries ${CLIENT_COLUMN}, no duplicate credential columns${allowed ? ` (${allowed} allow-listed)` : ''}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
