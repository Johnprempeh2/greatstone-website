// GRE-3778 (switch S4): parity of the HTML export with today's render. For every page at 1440 and 390
// wide it captures today's page (`/<path>`, Puck blocks) and the export (`/html-export/<path>`, schema 2
// HTML), full length, then counts the pixels that differ. Run against a local engine (`npm run dev:next`):
//
//   node next-proof/scripts/capture-html-parity.mjs
//
// PROOF_BASE overrides http://127.0.0.1:5181; PARITY_OUT sets the capture folder (default: the run's
// scratch folder). Needs Playwright with Chromium installed, as next-proof/scripts/capture.mjs does.
// The summary goes to docs/parity/GRE-3778/parity.md.
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const load = (name) => { try { return require(name); } catch { return null; } };
const { chromium } = load('playwright') || load('playwright-core') || {};
if (!chromium) throw new Error('Install Playwright (npx playwright install chromium) to capture');
const base = process.env.PROOF_BASE || 'http://127.0.0.1:5181';
const out = resolve(process.env.PARITY_OUT || join(process.env.GSAM_RUN_SCRATCH_DIR || 'next-proof/screenshots', 'parity'));
const baked = JSON.parse(await readFile(new URL('../data/release.json', import.meta.url), 'utf8'));
const WIDTHS = [1440, 390];
// A pixel differs when any channel moves by more than this; 0 for the frozen landing, which must match.
const TOLERANCE = 0;

async function compare(before, after, diffPath) {
  const [a, b] = await Promise.all([before, after].map((path) => sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  const width = Math.min(a.info.width, b.info.width);
  const height = Math.min(a.info.height, b.info.height);
  const diff = Buffer.alloc(width * height * 4);
  let changed = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * a.info.width + x) * 4;
      const j = (y * b.info.width + x) * 4;
      const k = (y * width + x) * 4;
      const moved = Math.max(Math.abs(a.data[i] - b.data[j]), Math.abs(a.data[i + 1] - b.data[j + 1]), Math.abs(a.data[i + 2] - b.data[j + 2])) > TOLERANCE;
      if (moved) changed++;
      diff[k] = moved ? 255 : a.data[i] / 4; diff[k + 1] = moved ? 0 : a.data[i + 1] / 4; diff[k + 2] = moved ? 0 : a.data[i + 2] / 4; diff[k + 3] = 255;
    }
  }
  if (changed || a.info.height !== b.info.height) await sharp(diff, { raw: { width, height, channels: 4 } }).png().toFile(diffPath);
  return { changed, share: changed / (width * height), heights: [a.info.height, b.info.height] };
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
const rows = [];
try {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    // Same consent state on both sides, so the cookie banner does not decide the comparison.
    await context.addInitScript(() => { try { localStorage.setItem('gs-consent', 'denied'); } catch {} });
    const tab = await context.newPage();
    for (const page of baked.pages) {
      const name = page.path === '/' ? 'home' : page.path.slice(1).replace(/\//g, '-');
      const files = {};
      for (const [side, url] of [['today', page.path], ['html', `/html-export${page.path === '/' ? '' : page.path}`]]) {
        await tab.goto(new URL(url, base).href, { waitUntil: 'load', timeout: 90000 });
        await tab.evaluate(() => document.fonts.ready);
        await tab.waitForTimeout(1500);
        files[side] = join(out, `${name}-${width}-${side}.png`);
        // The dev build's Next badge is not part of either page.
        await tab.screenshot({ path: files[side], fullPage: true, animations: 'disabled', style: 'nextjs-portal{display:none!important}' });
      }
      const result = await compare(files.today, files.html, join(out, `${name}-${width}-diff.png`));
      rows.push({ path: page.path, width, ...result });
      console.log(page.path, width, result.changed, result.heights.join('→'));
    }
    await context.close();
  }
} finally { await browser.close(); }

const percent = (share) => `${(share * 100).toFixed(2)}%`;
const table = [
  '# GRE-3778 parity: today\'s render against the HTML export', '',
  `Captured from ${base} at ${new Date().toISOString().slice(0, 16)}Z, reduced motion, full page. A pixel counts as changed when any colour channel differs at all. Height is today → export.`, '',
  '| Page | Width | Changed pixels | Share | Height |', '| --- | ---: | ---: | ---: | --- |',
  ...rows.map((row) => `| ${row.path} | ${row.width} | ${row.changed} | ${percent(row.share)} | ${row.heights[0]} → ${row.heights[1]}${row.heights[0] === row.heights[1] ? '' : ' ⚠'} |`),
];
await writeFile(new URL('../../docs/parity/GRE-3778/parity.md', import.meta.url), `${table.join('\n')}\n`);
console.log(`Captures in ${out}`);
