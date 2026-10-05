// Every table has row-level security from its first migration (GRE-803). On Supabase a public table without
// RLS is open to the anon key, so this reads supabase/migrations and exits 1 if a table created in the
// public schema is never put under RLS. Read-only: it parses the .sql files; no database, no network.
//
// A table counts as protected when a migration runs, in file order, either
//   ALTER TABLE [public.]x ENABLE ROW LEVEL SECURITY
// or the loop form (0028_deepdive.sql):
//   DO $$ ... FOREACH t IN ARRAY ARRAY['x','y'] ... format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t)
// A later DISABLE ROW LEVEL SECURITY undoes it. SQL comments are ignored. A table that is meant to have no RLS
// goes in scripts/rls-allow.json as { "table": "reason" }; an entry with no reason fails.
//
//   npm run rls:check          (or: node scripts/check-rls.mjs [migrationsDir] [allowFile])
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IDENT = '"?([A-Za-z_][A-Za-z0-9_]*)"?';
const SCHEMA = `(?:${IDENT}\\s*\\.\\s*)?`;
const CREATE = new RegExp(`\\bCREATE\\s+(?:UNLOGGED\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${SCHEMA}${IDENT}`, 'gi');
const ALTER = new RegExp(
  `\\bALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?${SCHEMA}${IDENT}\\s+(ENABLE|DISABLE)\\s+ROW\\s+LEVEL\\s+SECURITY`,
  'gi',
);
const DO_BLOCK = /\bDO\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1/gi;
const LOOP_RLS = /format\(\s*'ALTER\s+TABLE\s+(?:public\.)?%I\s+(ENABLE|DISABLE)\s+ROW\s+LEVEL\s+SECURITY'/i;
const ARRAY_LIT = /\bARRAY\s*\[([^\]]*)\]/gi;

const isPublic = (schema) => !schema || schema.toLowerCase() === 'public';

/** SQL with -- and /* *\/ comments blanked out (string literals are left alone). */
export function stripComments(sql) {
  let out = '';
  for (let i = 0; i < sql.length; ) {
    if (sql[i] === "'") {
      const end = sql.indexOf("'", i + 1);
      const stop = end === -1 ? sql.length : end + 1;
      out += sql.slice(i, stop);
      i = stop;
    } else if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
    } else if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += ' ';
    } else {
      out += sql[i++];
    }
  }
  return out;
}

/** What one migration does: tables it creates, and RLS changes as [table, enabled] in order of appearance. */
export function scanSql(sql) {
  const code = stripComments(sql);
  const created = [];
  for (const m of code.matchAll(CREATE)) if (isPublic(m[1])) created.push(m[2].toLowerCase());
  const changes = [];
  for (const m of code.matchAll(ALTER)) {
    if (isPublic(m[1])) changes.push({ at: m.index, table: m[2].toLowerCase(), on: m[3].toUpperCase() === 'ENABLE' });
  }
  for (const m of code.matchAll(DO_BLOCK)) {
    const loop = m[2].match(LOOP_RLS);
    if (!loop) continue;
    for (const arr of m[2].matchAll(ARRAY_LIT)) {
      for (const lit of arr[1].matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)) {
        changes.push({ at: m.index, table: lit[1].toLowerCase(), on: loop[1].toUpperCase() === 'ENABLE' });
      }
    }
  }
  changes.sort((a, b) => a.at - b.at);
  return { created, rls: changes.map((c) => [c.table, c.on]) };
}

/** Across a migrations directory (files in name order): every created table, and whether RLS ends up on. */
export function scanMigrations(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const tables = new Map(); // table -> first file that creates it
  const rls = new Map(); // table -> enabled after all files
  for (const f of files) {
    const { created, rls: changes } = scanSql(readFileSync(join(dir, f), 'utf8'));
    for (const t of created) if (!tables.has(t)) tables.set(t, f);
    for (const [t, on] of changes) rls.set(t, on);
  }
  return { tables, rls };
}

/** Problems to report: tables with no RLS and not allow-listed, and allow-list entries with no reason. */
export function rlsProblems({ tables, rls }, allow = {}) {
  const problems = [];
  for (const [t, reason] of Object.entries(allow)) {
    if (typeof reason !== 'string' || !reason.trim()) problems.push(`${t}: allow-list entry has no reason`);
  }
  for (const [t, file] of [...tables].sort(([a], [b]) => a.localeCompare(b))) {
    if (rls.get(t) !== true && !(t in allow)) problems.push(`${t}: no row-level security (created in ${file})`);
  }
  return problems;
}

function main(argv) {
  const [dirArg, allowArg] = argv;
  const dir = resolve(dirArg ?? join(ROOT, 'supabase/migrations'));
  const allowFile = resolve(allowArg ?? join(ROOT, 'scripts/rls-allow.json'));
  const allow = existsSync(allowFile) ? JSON.parse(readFileSync(allowFile, 'utf8')) : {};
  const scan = scanMigrations(dir);
  const problems = rlsProblems(scan, allow);
  const allowed = [...scan.tables.keys()].filter((t) => scan.rls.get(t) !== true && t in allow).length;
  if (problems.length) {
    console.error(`rls:check failed: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error('Enable RLS in a migration, or add the table to scripts/rls-allow.json with a reason.');
    process.exit(1);
  }
  console.log(`rls:check ok: ${scan.tables.size} tables, all under row-level security${allowed ? ` (${allowed} allow-listed)` : ''}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
