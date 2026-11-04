// GRE-1861: writes next-proof/data/intelligence-snapshot.json from two saved GSAM responses:
//   GET /api/companies/<company>/intelligence/boards                          -> boards.json
//   GET /api/companies/<company>/intelligence/reports/latest?kind=ai_briefing -> briefing.json
// Usage: node next-proof/scripts/intelligence-snapshot.mjs <boards.json> <briefing.json>
// Only the public fields in next-proof/intelligence-public.mjs are written.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { publicIntelligence } from '../intelligence-public.mjs';

const [boardsPath, briefingPath] = process.argv.slice(2);
if (!boardsPath || !briefingPath) {
  console.error('Usage: node next-proof/scripts/intelligence-snapshot.mjs <boards.json> <briefing.json>');
  process.exit(1);
}
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const snapshot = publicIntelligence({ boards: read(boardsPath), briefing: read(briefingPath) });
const out = fileURLToPath(new URL('../data/intelligence-snapshot.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(snapshot, null, 1)}\n`);
console.log(`Wrote ${out}: ${snapshot.boards.length} boards, ${snapshot.news.length} news, ${snapshot.movers.length} movers (${snapshot.date}).`);
