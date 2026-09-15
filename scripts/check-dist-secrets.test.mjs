// The go-live secret gate, run for real against a planted build.
//
// This scanner calls itself the go-live gate, and it used to choose files by EXTENSION:
// .js .mjs .cjs .css .html .json .map. `_headers` and `_redirects` have no extension at all. They
// are Netlify configuration, they ship, and they are exactly where a proxy credential ends up:
//   /api/* https://x.supabase.co/rest/v1/:splat?apikey=<key> 200
// A token planted in either printed "clean (87 files)" and exited 0.
//
// Run as a child process against a temporary dist/, because the thing worth testing is what the
// gate DOES, not what its source says. A source-reading test would have passed the old version too:
// the extension list was right there, plainly, and looked deliberate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-dist-secrets.mjs');

/** Build a throwaway dist/ and run the real scanner over it. */
function scan(files) {
  const dir = mkdtempSync(join(tmpdir(), 'distscan-'));
  mkdirSync(join(dir, 'dist', 'assets'), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const p = join(dir, 'dist', name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  try {
    const out = execFileSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const CLEAN = {
  'index.html': '<!doctype html><title>fine</title>',
  'assets/app.js': 'const k="pk_live_thisIsPublishableAndFine";',
};

test('a clean build passes, and says how much it actually read', () => {
  const r = scan(CLEAN);
  assert.equal(r.code, 0, `a clean build was refused: ${r.out}`);
  assert.match(r.out, /text files read/,
    'the gate no longer reports how many files it read, so "clean" cannot be read against anything');
  // ⚠ It used to print the length of an already-filtered list, which described a seventh of the
  // build while reading like all of it.
  assert.match(r.out, /2 text files read/, 'the count must be what was scanned, not what was listed');
});

test('a secret in a file with no extension is caught', () => {
  // The whole point. Netlify config ships and has no extension.
  for (const [name, line] of [
    ['_headers', '  Authorization: Bearer sbp_abcdefghijklmnopqrstuvwxyz012345'],
    ['_redirects', '/api/* https://x.supabase.co/rest/v1/:splat?apikey=service_role 200'],
  ]) {
    const r = scan({ ...CLEAN, [name]: `${line}\n` });
    assert.equal(r.code, 1, `a secret in ${name} was not caught: ${r.out}`);
    assert.match(r.out, new RegExp(name), `the report does not name ${name}`);
  }
});

test('every secret shape is caught, wherever it sits', () => {
  const shapes = {
    'notes.txt': 'sk_live_abcdefghijklmnop',
    'sitemap.xml': '<url>whsec_abcdefghijklmnop</url>',
    'assets/app.js': 'const c="postgresql://user:pw@db.example.com:5432/x";',
  };
  for (const [name, content] of Object.entries(shapes)) {
    const r = scan({ ...CLEAN, [name]: content });
    assert.equal(r.code, 1, `${name} carrying a secret passed: ${r.out}`);
  }
});

test('a publishable key is not a secret, and a binary is skipped rather than guessed at', () => {
  // pk_ keys are meant to be public: flagging them would train everyone to ignore this gate.
  assert.equal(scan(CLEAN).code, 0);
  // A NUL byte means binary. It is skipped and SAID to be skipped: a text scan cannot look inside a
  // PNG, and counting it as checked would be the same lie the extension filter told.
  const withPng = { ...CLEAN, 'assets/x.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]) };
  const r = scan(withPng);
  assert.equal(r.code, 0);
  assert.match(r.out, /1 binary files? skipped/, 'the gate no longer reports what it could not read');
});
