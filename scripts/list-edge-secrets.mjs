// The keys to set: every secret name the edge functions read, which functions read it, and whether it is
// required or optional (GRE-542). Read-only: it scans source files under supabase/functions and the
// hand-kept notes in scripts/edge-secrets.json. No network, and it never looks at an env value.
//
// A name counts when a function reads it as Deno.env.get('NAME'), or as env.NAME / env['NAME'] in a module
// it imports (crmConfig(Deno.env.toObject()) reads PIPEDRIVE_* that way). Relative imports are followed, so
// a name read in _shared/ is listed under each function that pulls that module in. Test files are skipped.
// A name with no note prints as `unknown`: add it to scripts/edge-secrets.json.
//
//   npm run secrets:list            (or: node scripts/list-edge-secrets.mjs [functionsDir] [notesFile])
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = /\.(m?js|ts|tsx)$/;
const TEST = /\.test\.(m?js|ts|tsx)$/;
const READS = [
  /Deno\.env\.get\(\s*['"`]([A-Z][A-Z0-9_]*)['"`]\s*\)/g,
  /\benv\.([A-Z][A-Z0-9_]*)\b/g,
  /\benv\[\s*['"`]([A-Z][A-Z0-9_]*)['"`]\s*\]/g,
];
const IMPORTS = /(?:\bfrom|\bimport)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;

/** Secret names one source file reads. */
export function namesIn(code) {
  const out = new Set();
  for (const re of READS) for (const m of code.matchAll(re)) out.add(m[1]);
  return out;
}

function sourceFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (SOURCE.test(e.name) && !TEST.test(e.name)) out.push(p);
  }
  return out;
}

/** Map of secret name -> sorted list of the functions that read it, for one functions directory. */
export function scanSecrets(functionsDir) {
  const found = new Map();
  const fns = readdirSync(functionsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();
  for (const fn of fns) {
    const queue = sourceFiles(join(functionsDir, fn));
    const seen = new Set();
    while (queue.length) {
      const file = queue.shift();
      if (seen.has(file)) continue;
      seen.add(file);
      const code = readFileSync(file, 'utf8');
      for (const name of namesIn(code)) {
        if (!found.has(name)) found.set(name, new Set());
        found.get(name).add(fn);
      }
      for (const m of code.matchAll(IMPORTS)) {
        const target = resolve(dirname(file), m[1]);
        const inside = !relative(functionsDir, target).startsWith('..');
        if (inside && SOURCE.test(target) && !TEST.test(target) && existsSync(target) && statSync(target).isFile()) queue.push(target);
      }
    }
  }
  return new Map([...found].map(([name, set]) => [name, [...set].sort()]));
}

/** Rows for printing: name, need (required | optional | unknown), functions, note. Required first. */
export function secretRows(found, notes = {}) {
  const order = { required: 0, optional: 1, unknown: 2 };
  return [...found]
    .map(([name, functions]) => {
      const n = notes[name] || {};
      const need = n.need === 'required' || n.need === 'optional' ? n.need : 'unknown';
      return { name, need, functions, note: typeof n.note === 'string' ? n.note : '' };
    })
    .sort((a, b) => order[a.need] - order[b.need] || a.name.localeCompare(b.name));
}

export function formatRows(rows) {
  const w = (k) => Math.max(k.length, ...rows.map((r) => r[k].length));
  const wn = w('name');
  const wd = w('need');
  const fnText = rows.map((r) => r.functions.join(', '));
  const wf = Math.max('functions'.length, ...fnText.map((s) => s.length));
  const line = (a, b, c, d) => `${a.padEnd(wn)}  ${b.padEnd(wd)}  ${c.padEnd(wf)}  ${d}`.trimEnd();
  return [
    line('NAME', 'NEED', 'FUNCTIONS', 'NOTE'),
    ...rows.map((r, i) => line(r.name, r.need, fnText[i], r.note)),
  ].join('\n');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const functionsDir = resolve(process.argv[2] || join(ROOT, 'supabase', 'functions'));
  const notesFile = resolve(process.argv[3] || join(ROOT, 'scripts', 'edge-secrets.json'));
  const notes = existsSync(notesFile) ? JSON.parse(readFileSync(notesFile, 'utf8')) : {};
  const rows = secretRows(scanSecrets(functionsDir), notes);
  const fnCount = new Set(rows.flatMap((r) => r.functions)).size;
  console.log(`${rows.length} secret names read by ${fnCount} edge functions (names only, never values).`);
  console.log('Set with: supabase secrets set NAME=... --project-ref <ref>\n');
  console.log(formatRows(rows));
  const unknown = rows.filter((r) => r.need === 'unknown').length;
  if (unknown) console.log(`\n${unknown} name(s) marked unknown: add them to ${relative(ROOT, notesFile)}.`);
}
