import { legacyPaths, nextLegacyDestination } from '../legacy-routes.mjs';
import release from '../data/release.json' with { type: 'json' };

const base = process.env.PROOF_BASE || 'http://127.0.0.1:5181';
const pages = release.pages.map((page) => page.path);
const failures = [];
async function check(path) {
  const expected = nextLegacyDestination(path, pages);
  const response = await fetch(base + path, { redirect: 'manual' });
  const actual = response.headers.get('location');
  if (expected === path) {
    if (response.status !== 200) failures.push(`${path}: expected 200, got ${response.status}`);
  } else if (![301, 308].includes(response.status) || new URL(actual || '/', base).pathname !== expected) {
    failures.push(`${path}: expected redirect to ${expected}, got ${response.status} ${actual}`);
  }
  const landing = await fetch(base + expected);
  if (landing.status !== 200) failures.push(`${path}: ${expected} landed on ${landing.status}`);
}
for (let index = 0; index < legacyPaths.length; index += 8) {
  await Promise.all(legacyPaths.slice(index, index + 8).map(check));
}
console.log(`Checked ${legacyPaths.length} legacy URLs and landing routes: ${failures.length} failure(s)`);
for (const failure of failures) console.error(failure);
if (failures.length) process.exitCode = 1;
