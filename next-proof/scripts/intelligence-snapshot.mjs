// GRE-1861: writes next-proof/data/intelligence-snapshot.json from two saved GSAM responses:
//   GET /api/companies/<company>/intelligence/boards                          -> boards.json
//   GET /api/companies/<company>/intelligence/reports/latest?kind=ai_briefing -> briefing.json
// Usage: node next-proof/scripts/intelligence-snapshot.mjs <boards.json> <briefing.json>
//    or: node next-proof/scripts/intelligence-snapshot.mjs --images   (refetch pictures for the committed snapshot)
// Only the public fields in next-proof/intelligence-public.mjs are written. Each news item's preview image
// is then fetched from its story page and saved under public/assets/intel/news (next-proof/intelligence-media.mjs);
// pictures no longer in the snapshot are removed.
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicIntelligence } from '../intelligence-public.mjs';
import { withNewsImages } from '../intelligence-media.mjs';

const [boardsPath, briefingPath] = process.argv.slice(2);
const imagesOnly = boardsPath === '--images';
if (!imagesOnly && (!boardsPath || !briefingPath)) {
  console.error('Usage: node next-proof/scripts/intelligence-snapshot.mjs <boards.json> <briefing.json>');
  process.exit(1);
}
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const out = fileURLToPath(new URL('../data/intelligence-snapshot.json', import.meta.url));
const dir = fileURLToPath(new URL('../../public/assets/intel/news/', import.meta.url));
const base = imagesOnly ? read(out) : publicIntelligence({ boards: read(boardsPath), briefing: read(briefingPath) });
const snapshot = await withNewsImages(base, { dir });
const kept = new Set(snapshot.news.map((item) => item.image?.src.split('/').pop()).filter(Boolean));
for (const file of readdirSync(dir)) if (!kept.has(file)) rmSync(join(dir, file));
writeFileSync(out, `${JSON.stringify(snapshot, null, 1)}\n`);
console.log(`Wrote ${out}: ${snapshot.boards.length} boards, ${snapshot.news.length} news (${kept.size} with pictures), ${snapshot.movers.length} movers (${snapshot.date}).`);
