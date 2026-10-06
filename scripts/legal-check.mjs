#!/usr/bin/env node
// legal-check.mjs — the legal-pages half of `npm run launch:check` (GRE-659). Exits 1 while a fact the
// Privacy page must state is still missing (src/lib/legal-facts.mjs). Not part of preflight: before launch a
// gap is expected, and the gate is go-live, as for noindex (scripts/seo-report.mjs --launch).
import { legalLaunchGaps } from '../src/lib/legal-facts.mjs';

const gaps = legalLaunchGaps();
if (gaps.length) {
  for (const g of gaps) console.log('Legal check: FAIL. ' + g);
  process.exit(1);
}
console.log('Legal check: PASS. The legal pages state every required company fact.');
