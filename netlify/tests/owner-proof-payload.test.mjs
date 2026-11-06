import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compareSync } from 'bcryptjs';

const prefixes = ['079636cf', 'd814b01d', 'c3f9c60f', '2d47ada5',
  '7a0c5d8e', '681507c1', 'e81bc42a', '5a85a5ba'];

test('proof payload keeps row values out and makes a usable cost-10 fixture', () => {
  const dir = mkdtempSync(join(tmpdir(), 'owner-proof-'));
  try {
    const source = join(dir, 'source.json');
    const payload = join(dir, 'payload.json');
    const credentials = join(dir, 'credentials.json');
    const users = prefixes.map((prefix, i) => ({
      id: `${prefix}-0000-4000-8000-${String(i).padStart(12, '0')}`,
      email: `PERSON${i}@EXAMPLE.TEST`, name: `Person ${i}`, emailVerified: true,
      passwordHash: '$2b$10$' + 'A'.repeat(53),
    }));
    const run = () => spawnSync(process.execPath,
      ['scripts/owner-proof-payload.mjs', '--source', source, '--payload', payload, '--credentials', credentials],
      { env: { ...process.env, GSAM_RUN_SCRATCH_DIR: dir }, encoding: 'utf8' });
    writeFileSync(source, JSON.stringify(users.map((u, i) => i ? u : { ...u, passwordHash: u.passwordHash.replace('$10$', '$09$') })));
    assert.notEqual(run().status, 0, 'cost-9 source must fail');
    writeFileSync(source, JSON.stringify(users));
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(readFileSync(payload, 'utf8'));
    const fixture = JSON.parse(readFileSync(credentials, 'utf8'));
    assert.equal(data.source.length, 8);
    assert.ok(data.source.every((row) => row.uuidDigest.length === 64 && row.emailDigest.length === 64
      && row.bcryptDigest.length === 64));
    assert.match(data.fixture.passwordHash, /^\$2b\$10\$/);
    assert.equal(compareSync(fixture.password, data.fixture.passwordHash), true);
    assert.equal(fixture.id, data.fixture.id);
    assert.equal(fixture.email, data.fixture.email);
    const output = readFileSync(payload, 'utf8') + result.stdout;
    assert.ok(!output.includes(users[0].email));
    assert.ok(!output.includes(users[0].passwordHash));
    assert.ok(!output.includes(fixture.password));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
