// GRE-2623: every client-scoped table must carry a tenant column (org_id or customer_id) so access can
// be limited by it. This reads supabase/migrations and exits 1 if a public table ends up with neither
// column. A table that is genuinely global/anonymous (no client data) goes in scripts/org-scope-allow.json
// as { "table": "reason" }; an entry with no reason fails. Read-only: it parses the .sql files; no
// database, no network.
//
// It also exits 1 if any table other than the canonical client-identity table (customer_users) or the
// internal staff table (users) defines a password/password_hash column — that would mean a second place
// stores client (or staff) login credentials.
//
//   npm run org-scope:check   (or: node scripts/check-org-scoping.mjs [migrationsDir] [allowFile])
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './check-rls.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IDENT = '"?([A-Za-z_][A-Za-z0-9_]*)"?';
const SCHEMA = `(?:${IDENT}\\s*\\.\\s*)?`;
const TENANT_COLUMNS = ['org_id', 'customer_id'];
const IDENTITY_TABLES = ['customer_users']; // the one place a client's own email lives
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
const KEYWORDS = new Set(['constraint', 'primary', 'unique', 'check', 'foreign', 'exclude', 'like']);

const isPublic = (schema) => !schema || schema.toLowerCase() === 'public';

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

/** What one migration does: tables it creates (with initial columns), and later ADD/DROP COLUMN, in order. */
export function scanSql(sql) {
  const code = stripComments(sql);
  const created = [];
  for (const m of CREATE.exec ? [] : []) void m; // keep lint quiet about unused regex reuse
  CREATE.lastIndex = 0;
  for (let m = CREATE.exec(code); m; m = CREATE.exec(code)) {
    if (!isPublic(m[1])) continue;
    const openIndex = m.index + m[0].length - 1;
    const closeIndex = matchingParen(code, openIndex);
    if (closeIndex === -1) continue;
    const body = code.slice(openIndex + 1, closeIndex);
    const columns = splitTopLevel(body).map(columnNameOf).filter(Boolean);
    created.push({ at: m.index, table: m[2].toLowerCase(), columns });
  }
  const columnOps = [];
  ADD_COLUMN.lastIndex = 0;
  for (let m = ADD_COLUMN.exec(code); m; m = ADD_COLUMN.exec(code)) {
    if (isPublic(m[1])) columnOps.push({ at: m.index, table: m[2].toLowerCase(), column: m[3].toLowerCase(), add: true });
  }
  DROP_COLUMN.lastIndex = 0;
  for (let m = DROP_COLUMN.exec(code); m; m = DROP_COLUMN.exec(code)) {
    if (isPublic(m[1])) columnOps.push({ at: m.index, table: m[2].toLowerCase(), column: m[3].toLowerCase(), add: false });
  }
  columnOps.sort((a, b) => a.at - b.at);
  return { created, columnOps };
}

/** Across a migrations directory (files in name order): every created table and its final column set. */
export function scanMigrations(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const tables = new Map(); // table -> { file, columns: Set }
  for (const f of files) {
    const { created, columnOps } = scanSql(readFileSync(join(dir, f), 'utf8'));
    for (const c of created) {
      if (!tables.has(c.table)) tables.set(c.table, { file: f, columns: new Set(c.columns) });
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
    if (!TENANT_COLUMNS.some((c) => columns.has(c))) {
      problems.push(`${t}: no org_id or customer_id column (created in ${file}) — client-scoped tables must carry one`);
    }
  }
  return problems;
}

export function credentialDuplicationProblems(tables) {
  const problems = [];
  for (const [t, { file, columns }] of tables) {
    if (IDENTITY_TABLES.includes(t) || STAFF_TABLES.includes(t)) continue;
    if (columns.has('password') || columns.has('password_hash')) {
      problems.push(`${t}: has a password/password_hash column (created in ${file}) — client credentials must live only in customer_users`);
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
  const problems = [...orgScopingProblems(tables, allow), ...credentialDuplicationProblems(tables)];
  const allowed = [...tables.keys()].filter((t) => t in allow).length;
  if (problems.length) {
    console.error(`org-scope:check failed: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error('Add org_id/customer_id in a migration, or add the table to scripts/org-scope-allow.json with a reason.');
    process.exit(1);
  }
  console.log(`org-scope:check ok: ${tables.size} tables, all client-scoped tables carry org_id/customer_id, no duplicate credential columns${allowed ? ` (${allowed} allow-listed)` : ''}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
