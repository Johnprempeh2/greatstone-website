// npm run secrets:list (GRE-542): run against a throwaway functions dir and against the real one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

test('the real functions: all 20 names found, every one noted, no value printed', () => {
  const found = scanSecrets(join(HERE, '..', 'supabase', 'functions'));
  for (const n of ['ANTHROPIC_API_KEY', 'TURNSTILE_SECRET_KEY', 'FRONT_DOOR_SECRET', 'PIPEDRIVE_API_TOKEN', 'PIPEDRIVE_DOMAIN', 'PIPEDRIVE_STAGE_ID']) {
    assert.ok(found.has(n), n);
  }
  assert.deepEqual(found.get('PIPEDRIVE_API_TOKEN'), ['front-door']);
  assert.equal(found.size, 20);

  const out = execFileSync(process.execPath, [SCRIPT], {
    encoding: 'utf8', env: { ...process.env, RESEND_API_KEY: 're_planted_value_123' },
  });
  assert.doesNotMatch(out, /unknown/);
  assert.doesNotMatch(out, /re_planted_value_123/);
  assert.match(out, /^20 secret names read by 7 edge functions/);
});
