import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.env.CAPTURE_BASE || 'http://127.0.0.1:5183';
const out = resolve(process.env.CAPTURE_OUT || 'docs/screenshots/GRE-3406');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    for (const [name, url] of [['home', base + '/'], ['dx', base + '/#dx-consultancy'], ['services', base + '/#services']]) {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.screenshot({ path: join(out, `after-${name}-${width}.png`), fullPage: true });
    }
    await page.goto(base + '/gre3406-visual.html', { waitUntil: 'networkidle' });
    for (const name of ['Hero', 'LogoWall', 'PillarCards', 'StatStrip', 'ComparisonMatrix', 'TimeSavingsCalculator', 'AiCostCalculator', 'DxConsultancyMethod', 'Invite']) {
      await page.locator(`[data-review-block="${name}"]`).screenshot({ path: join(out, `after-${name}-${width}.png`) });
    }
    await page.close();

    const motion = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    await motion.goto(base + '/gre3406-visual.html', { waitUntil: 'networkidle' });
    const viewport = motion.locator('.b-logos-marquee .b-logos-viewport');
    const row = motion.locator('.b-logos-marquee .b-logos-row');
    await viewport.scrollIntoViewIfNeeded();
    const running = await row.evaluate((node) => getComputedStyle(node).animationPlayState);
    await viewport.screenshot({ path: join(out, `after-LogoWall-motion-${width}.png`) });
    await viewport.hover();
    const hovered = await row.evaluate((node) => getComputedStyle(node).animationPlayState);
    await viewport.focus();
    const focused = await row.evaluate((node) => getComputedStyle(node).animationPlayState);
    if (running !== 'running' || hovered !== 'paused' || focused !== 'paused') throw new Error(`Marquee state ${width}: ${running}/${hovered}/${focused}`);
    console.log(`Marquee ${width}: ${running} / ${hovered} / ${focused}`);
    const stat = motion.locator('[data-review-block="StatStrip"] .b-stat-num[data-target]').first();
    await stat.scrollIntoViewIfNeeded();
    await motion.waitForTimeout(1700);
    const { actual, target } = await stat.evaluate((node) => ({ actual: node.textContent.trim(), target: node.dataset.target }));
    if (!actual.includes(target)) throw new Error(`Stat count-up ${width}: ${actual} != ${target}`);
    console.log(`Stat count-up ${width}: ${actual}`);
    await motion.close();
  }
} finally {
  await browser.close();
}
