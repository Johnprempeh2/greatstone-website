// GRE-3778 (switch S4): the GRE-1822 pages exist only as GSAM drafts, so the baked release has no
// render of them to export or compare. This adds them to the local baked release for one export run:
//
//   npm run dev:next                                    (in another terminal)
//   node next-proof/scripts/stage-export-drafts.mjs     (dev reloads the release)
//   PARITY_CHROME=1 node next-proof/scripts/export-html-pages.mjs   (chrome with the drafts, for parity)
//   node next-proof/scripts/capture-html-parity.mjs
//   node next-proof/scripts/export-html-pages.mjs                   (the export to commit: published chrome)
//   git checkout next-proof/data/release.json           (never commit the staged release)
//
// The pages come from next-proof/frozen/gre-1822-drafts.json, their latest GSAM revision, and keep
// their GSAM page ids so the import lands each one on its own page.
import { readFile, writeFile } from 'node:fs/promises';
import { stageDraftPages } from '../html-export.mjs';

const releaseUrl = new URL('../data/release.json', import.meta.url);
const baked = JSON.parse(await readFile(releaseUrl, 'utf8'));
const { pages } = JSON.parse(await readFile(new URL('../frozen/gre-1822-drafts.json', import.meta.url), 'utf8'));
const staged = stageDraftPages(baked, pages);
await writeFile(releaseUrl, `${JSON.stringify(staged, null, 2)}\n`);
console.log(`Staged ${staged.pages.length - baked.pages.length} draft pages in next-proof/data/release.json; restore it after the export`);
