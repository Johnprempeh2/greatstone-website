import { readFile } from 'node:fs/promises';

const base = process.env.PROOF_BASE || 'http://127.0.0.1:5182';
const fixture = JSON.parse(await readFile(new URL('../fixtures/public-catalogue-2026-10-22.json', import.meta.url)));
const paths = [
  '/shop',
  ...fixture.vendors.map((vendor) => `/shop/${encodeURIComponent(vendor.slug)}`),
  ...fixture.offerings.map((offering) => `/product/${encodeURIComponent(offering.slug)}`),
];
const failures = [];
for (const path of paths) {
  const response = await fetch(base + path);
  const html = await response.text();
  if (response.status !== 200) failures.push(`${path}: HTTP ${response.status}`);
  if (!html.includes('<h1')) failures.push(`${path}: missing server heading`);
  if (!html.includes('<title>')) failures.push(`${path}: missing server title`);
  if (!html.includes(`rel="canonical" href="https://greatstoneint.com${path}"`)) failures.push(`${path}: missing canonical`);
}
console.log(`Checked ${paths.length} catalogue URLs: ${failures.length} failure(s)`);
for (const failure of failures) console.error(failure);
if (failures.length) process.exitCode = 1;
