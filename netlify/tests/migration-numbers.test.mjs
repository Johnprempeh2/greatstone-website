// Netlify's build refuses a deploy whose migrations share a number (@netlify/build db_setup/validation.js,
// "Duplicate migration number"), before any migration runs. The CI runner (@netlify/database-dev) checks only
// duplicate names, so two 061 folders passed CI and failed every real deploy (GRE-3833). This is Netlify's rule:
// a folder is <digits>_<a-z0-9_->, holds migration.sql, and its number, leading zeros dropped, is unique.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = fileURLToPath(new URL('../database/migrations', import.meta.url));
const DIR = /^\d+_[a-z0-9_-]+$/;

export function migrationErrors(dir) {
  const errors = [];
  const byNumber = new Map();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!DIR.test(entry.name)) { errors.push(`"${entry.name}" is not <number>_<slug>, so Netlify skips it`); continue; }
    if (!existsSync(join(dir, entry.name, 'migration.sql'))) errors.push(`"${entry.name}/migration.sql" is missing`);
    const number = /^(\d+)_/.exec(entry.name)[1].replace(/^0+/, '') || '0';
    byNumber.set(number, [...(byNumber.get(number) || []), entry.name]);
  }
  for (const [number, names] of byNumber) {
    if (names.length > 1) errors.push(`duplicate migration number ${number}: ${names.sort().join(', ')}`);
  }
  return errors;
}

test('every Netlify Database migration has its own number and a migration.sql', () => {
  assert.deepEqual(migrationErrors(MIGRATIONS), []);
});
