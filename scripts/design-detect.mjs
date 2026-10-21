// Impeccable design detector, required before every website pull request (GRE-1837).
//
// Runs the 61-rule Impeccable detector (engine 0.1.16) on the UI files the branch changed, applies the
// brand ignores in .impeccable/config.json (GRE-1821), and prints a summary to paste on the task and the PR.
// Every finding gets one line there: fixed, or justified with a reason.
//
// Safety limits from the code read (GRE-1836):
//   - The engine is a preinstalled binary, checked against the pinned SHA-256 below before every run.
//     A missing or mismatched binary fails closed. This script never downloads anything.
//   - IMPECCABLE_NO_TELEMETRY=1, IMPECCABLE_NO_UPDATE_CHECK=1 and DO_NOT_TRACK=1 are always set.
//   - No launcher, no `npx impeccable`, no hooks, no live mode, no direction picker.
//   - Rendered scans (--url) are allowed on a local site only and are a warning: they never fail the step.
//
//   npm run design:detect                 changed UI files vs origin/main (the PR step)
//   npm run design:detect -- --all        the whole of src/
//   npm run design:detect -- src/a.jsx    named files or folders
//   npm run design:detect -- --url http://localhost:5173/   also a rendered scan at 390 (warning only)
//
// Exit: 0 scan completed (with or without findings), 1 scan failed, 3 engine missing or hash mismatch.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { userInfo } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Impeccable skill-v4.7.0 (commit aeeb3d8c30b5f95aeeb3e893b0f1a308af8fdb8f) pins engine 0.1.16.
// Engine tag engine-v0.1.16 = commit 24bdeb776a66a3c36d493072a04541287a327408.
export const ENGINE_VERSION = '0.1.16';
export const ENGINE_COMMIT = '24bdeb776a66a3c36d493072a04541287a327408';
export const ENGINE_SHA256 = {
  'darwin-arm64': '5c00c3130b961f3aa1066f04ed0e1f58e87808ad153efa00f1c44184800084f2',
  'darwin-x64': '278b028848348b4dc21a20ee0a0bb33f09a8d14c5484b1a2f554df32e1d44f43',
  'linux-x64': 'a890a5b4b7d9d79ec54aa74612b5e924e5f5b422600a25fde8bcbda11b031787',
  'linux-arm64': 'a9a18bfa6d70642701446ed3b12a3e5e6eefe4a4b4c56effe30b449ccb329c4b',
  'win32-x64': 'c7dfa8846ec59ceb3a40be99b89fba29e4f3bdd16f3c412a33f19ad8a68ccff2',
};

export const ENGINE_ENV = {
  IMPECCABLE_NO_TELEMETRY: '1',
  IMPECCABLE_NO_UPDATE_CHECK: '1',
  DO_NOT_TRACK: '1',
};

const UI_FILE = /\.(jsx?|tsx?|css|html|vue|svelte|astro)$/i;
const RENDERED_VIEWPORT = '390x844';

export function platformKey(platform = process.platform, arch = process.arch) {
  return `${platform}-${arch}`;
}

// The engine lives outside the repo so every checkout shares one verified copy. os.userInfo() is used, not
// $HOME, because agent runs get a temporary HOME. IMPECCABLE_ENGINE points at another copy; it is hash-checked too.
export function defaultEnginePath(key = platformKey()) {
  const name = `impeccable-${key.replace(/^win32/, 'windows')}${key.startsWith('win32') ? '.exe' : ''}`;
  return join(userInfo().homedir, '.local', 'share', 'greatstone-tools', 'impeccable', ENGINE_VERSION, name);
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** { ok: true, path, sha256 } or { ok: false, reason }. Fails closed on anything but an exact match. */
export function verifyEngine(path, key = platformKey()) {
  const expected = ENGINE_SHA256[key];
  if (!expected) return { ok: false, reason: `no pinned engine hash for platform ${key}` };
  if (!path || !existsSync(path)) return { ok: false, reason: `engine not found at ${path}` };
  const actual = sha256File(path);
  if (actual !== expected) {
    return { ok: false, reason: `engine hash mismatch at ${path}: expected ${expected}, got ${actual}` };
  }
  return { ok: true, path, sha256: actual };
}

export function engineEnv(base = process.env) {
  const env = { ...base, ...ENGINE_ENV };
  // Never let a stray setting point the engine at another binary or download base.
  delete env.IMPECCABLE_BIN;
  delete env.IMPECCABLE_DOWNLOAD_BASE;
  return env;
}

/** Rendered scans only on a local site (code read: local test site only). */
export function isLocalUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

export function parseArgs(argv) {
  const opts = { all: false, urls: [], targets: [], base: 'origin/main', out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') opts.all = true;
    else if (a === '--url') opts.urls.push(argv[++i]);
    else if (a === '--base') opts.base = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else opts.targets.push(a);
  }
  for (const u of opts.urls) {
    if (!u || !isLocalUrl(u)) throw new Error(`--url must be a local site (localhost or 127.0.0.1), got ${u}`);
  }
  return opts;
}

/** UI files the branch changed against base, plus uncommitted ones. Deleted files are left out. */
export function changedUiFiles(base, cwd = ROOT) {
  const git = (args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
  const committed = git(['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`]);
  if (committed.status !== 0) throw new Error(`git diff against ${base} failed: ${committed.stderr.trim()}`);
  const working = git(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD']);
  const untracked = git(['ls-files', '--others', '--exclude-standard']);
  const files = [committed.stdout, working.stdout, untracked.stdout].join('\n').split('\n').map((f) => f.trim());
  return [...new Set(files)].filter((f) => f && f.startsWith('src/') && UI_FILE.test(f) && existsSync(join(cwd, f))).sort();
}

function runEngine(engine, args) {
  const r = spawnSync(engine, ['detect', '--json', ...args], {
    cwd: ROOT,
    env: engineEnv(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
  });
  // Engine exit: 0 clean, 2 findings, 1 a target could not be scanned.
  let findings = null;
  try {
    findings = JSON.parse(r.stdout || '[]');
  } catch {
    findings = null;
  }
  const failed = r.error || r.status === 1 || r.status === null || !Array.isArray(findings);
  return { failed, findings: Array.isArray(findings) ? findings : [], status: r.status, stderr: (r.stderr || '').trim(), error: r.error };
}

const rel = (file) => (file && isAbsolute(file) ? relative(ROOT, file) : file);

/** Markdown for the task and the PR: counts by rule, then one line per finding to mark fixed or justified. */
export function summarise({ targets, source, rendered = [] }) {
  const lines = [`## Impeccable detector (engine ${ENGINE_VERSION}, ignores from .impeccable/config.json)`, ''];
  const primary = source.filter((f) => !f.advisory);
  lines.push(`Source scan of ${targets.length} target(s): **${primary.length} finding(s)**, ${source.length - primary.length} advisory.`);
  if (source.length) {
    const counts = {};
    for (const f of source) counts[f.antipattern] = (counts[f.antipattern] || 0) + 1;
    lines.push('', 'By rule: ' + Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `\`${k}\` ${n}`).join(', '));
    lines.push('', 'Each finding: fixed, or justified with a reason.', '');
    for (const f of source) {
      lines.push(`- [ ] \`${rel(f.file)}:${f.line ?? '?'}\` \`${f.antipattern}\`${f.advisory ? ' (advisory)' : ''}: ${f.name}`);
    }
  }
  for (const r of rendered) {
    lines.push('', `Rendered scan (warning only) ${r.url} at ${RENDERED_VIEWPORT}: ` +
      (r.failed ? `did not complete (${r.reason}). Noted; the PR goes on.` : `${r.findings.length} finding(s).`));
    for (const f of r.findings) lines.push(`- [ ] \`${f.antipattern}\` ${f.selector ?? ''}: ${f.name}`);
  }
  return lines.join('\n');
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`design:detect: ${err.message}`);
    return 1;
  }

  const enginePath = process.env.IMPECCABLE_ENGINE || defaultEnginePath();
  const check = verifyEngine(enginePath);
  if (!check.ok) {
    console.error(`design:detect: ${check.reason}`);
    console.error('The engine is preinstalled and hash-pinned; this script does not download it. Ask Bedrock to install');
    console.error(`engine ${ENGINE_VERSION} (see docs/design-detector.md), then run this again. Do not open the PR without the scan.`);
    return 3;
  }
  console.error(`design:detect: engine ${ENGINE_VERSION} sha256 ${check.sha256} OK; telemetry and update check off.`);

  const targets = opts.targets.length ? opts.targets : opts.all ? ['src'] : changedUiFiles(opts.base);
  let source = [];
  if (targets.length) {
    const r = runEngine(check.path, targets);
    if (r.failed) {
      console.error(`design:detect: source scan failed (exit ${r.status}). ${r.error?.message ?? r.stderr}`);
      return 1;
    }
    source = r.findings;
  } else {
    console.error(`design:detect: no UI files under src/ changed against ${opts.base}.`);
  }

  const rendered = opts.urls.map((url) => {
    const r = runEngine(check.path, ['--viewport', RENDERED_VIEWPORT, url]);
    return { url, failed: r.failed, findings: r.findings, reason: r.error?.message ?? (r.stderr.split('\n').pop() || `exit ${r.status}`) };
  });

  const report = { engine: { version: ENGINE_VERSION, commit: ENGINE_COMMIT, sha256: check.sha256 }, env: ENGINE_ENV,
    targets, source, rendered, scannedAt: new Date().toISOString() };
  const out = opts.out || join(ROOT, '.impeccable', 'reports', 'detect-latest.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n');

  console.log(summarise({ targets, source, rendered }));
  console.error(`design:detect: full report in ${rel(out)}. Attach it to the task.`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
