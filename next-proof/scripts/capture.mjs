import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.env.GSAM_RUN_SCRATCH_DIR || resolve('next-proof/screenshots');
const base = process.env.PROOF_BASE || 'http://127.0.0.1:5182';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const mockup = pathToFileURL(resolve('mockups/mica-two-doors-combined-r15.html')).href;
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    for (const [name, url] of [['v15', mockup], ['next', `${base}/`], ['next-dev-tools', `${base}/dev-tools`]]) {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.screenshot({ path: join(out, `${name}-${width}.png`), fullPage: true });
    }
    for (const slug of ['home', 'dev-tools']) {
      await page.goto(`${base}/editor/${slug}`, { waitUntil: 'networkidle' });
      await page.screenshot({ path: join(out, `next-editor-${slug}-${width}.png`), fullPage: true });
      console.log(slug, width, 'iframe count:', await page.locator('iframe').count());
    }
    await page.close();
  }
  console.log(out);
} finally { await browser.close(); }
