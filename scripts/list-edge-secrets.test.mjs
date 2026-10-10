// npm run secrets:list (GRE-542): run against a throwaway functions dir and against the real one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { scanSecrets, secretRows } from './list-edge-secrets.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'list-edge-secrets.mjs');

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'edgesecrets-'));
  for (const [name, content] of Object.entries(files)) {
    const p = join(dir, name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  return dir;
}

test('lists Deno.env.get names, names read through an imported config(env), and marks un-noted names unknown', () => {
  const dir = fixture({
    'alpha/index.ts': "import { crmConfig } from '../_shared/crm.mjs';\nconst k = Deno.env.get('ALPHA_KEY');\nconst c = crmConfig(Deno.env.toObject());",
    'beta/index.ts': "const k = Deno.env.get(\"ALPHA_KEY\") ?? '';\nconst x = Deno.env.get('NO_NOTE_NAME');",
    '_shared/crm.mjs': 'export function crmConfig(env = {}) { return env.PIPE_TOKEN && env["PIPE_STAGE"]; }',
    '_shared/crm.test.mjs': "Deno.env.get('ONLY_IN_TEST');",
  });
  const notes = join(dir, 'notes.json');
  writeFileSync(notes, JSON.stringify({ ALPHA_KEY: { need: 'required', note: 'a' }, PIPE_TOKEN: { need: 'required' }, PIPE_STAGE: { need: 'optional' } }));
  try {
    const found = scanSecrets(dir);
    assert.deepEqual(found.get('ALPHA_KEY'), ['alpha', 'beta']);
    assert.deepEqual(found.get('PIPE_TOKEN'), ['alpha']);
    assert.deepEqual(found.get('PIPE_STAGE'), ['alpha']);
    assert.equal(found.has('ONLY_IN_TEST'), false);

    const rows = secretRows(found, JSON.parse(readFileSync(notes, 'utf8')));
    assert.equal(rows.find((r) => r.name === 'NO_NOTE_NAME').need, 'unknown');

    const out = execFileSync(process.execPath, [SCRIPT, dir, notes], { encoding: 'utf8' });
    assert.match(out, /^NO_NOTE_NAME\s+unknown\s+beta/m);
    assert.match(out, /^PIPE_TOKEN\s+required\s+alpha/m);
    assert.match(out, /1 name\(s\) marked unknown/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the real functions: all 21 names found, every one noted, no value printed', () => {
  const found = scanSecrets(join(HERE, '..', 'supabase', 'functions'));
  for (const n of ['ANTHROPIC_API_KEY', 'TURNSTILE_SECRET_KEY', 'FRONT_DOOR_SECRET', 'PIPEDRIVE_API_TOKEN', 'PIPEDRIVE_DOMAIN', 'PIPEDRIVE_STAGE_ID', 'ENQUIRY_ALERT_TO']) {
    assert.ok(found.has(n), n);
  }
  assert.deepEqual(found.get('PIPEDRIVE_API_TOKEN'), ['front-door']);
  assert.equal(found.size, 21);
  assert.deepEqual(found.get('ENQUIRY_ALERT_TO'), ['enquiry']);

  const out = execFileSync(process.execPath, [SCRIPT], {
    encoding: 'utf8', env: { ...process.env, RESEND_API_KEY: 're_planted_value_123' },
  });
  assert.doesNotMatch(out, /unknown/);
  assert.doesNotMatch(out, /re_planted_value_123/);
  assert.match(out, /^21 secret names read by 9 edge functions/);
});

// --check (GRE-715): exit 1 with one line per problem; exit 0 when names and notes match.
function runCheck(files, notes) {
  const dir = fixture(files);
  const notesFile = join(dir, 'notes.json');
  writeFileSync(notesFile, JSON.stringify(notes));
  try {
    const r = spawnSync(process.execPath, [SCRIPT, '--check', dir, notesFile], { encoding: 'utf8' });
    return { code: r.status, out: r.stdout, err: r.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('--check: one unknown secret exits 1 and names it', () => {
  const r = runCheck(
    { 'alpha/index.ts': "Deno.env.get('ALPHA_KEY'); Deno.env.get('NEW_KEY');" },
    { ALPHA_KEY: { need: 'required' } },
  );
  assert.equal(r.code, 1);
  assert.match(r.err, /^✗ NEW_KEY is read by alpha but has no required\/optional note/m);
  assert.equal(r.err.trim().split('\n').length, 1);
});

test('--check: one stale note exits 1 and names it', () => {
  const r = runCheck(
    { 'alpha/index.ts': "Deno.env.get('ALPHA_KEY');" },
    { ALPHA_KEY: { need: 'required' }, GONE_KEY: { need: 'optional' } },
  );
  assert.equal(r.code, 1);
  assert.match(r.err, /^✗ GONE_KEY has a note in .* but no edge function reads it/m);
  assert.equal(r.err.trim().split('\n').length, 1);
});

test('--check: clean exits 0; without --check an unknown still exits 0', () => {
  const clean = runCheck({ 'alpha/index.ts': "Deno.env.get('ALPHA_KEY');" }, { ALPHA_KEY: { need: 'required' } });
  assert.equal(clean.code, 0);
  assert.match(clean.out, /✓ every secret name has a note/);
  assert.equal(clean.err, '');

  const dir = fixture({ 'alpha/index.ts': "Deno.env.get('NEW_KEY');" });
  try {
    const r = spawnSync(process.execPath, [SCRIPT, dir, join(dir, 'none.json')], { encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout + r.stderr, /✗|✓/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--check passes on the real functions and notes', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
