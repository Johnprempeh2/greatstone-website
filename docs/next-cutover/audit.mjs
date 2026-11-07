// Next cutover parity audit: renders each route on the Vite site and the Next build and compares
// what a visitor and a crawler get. Read only (GETs and page loads). Usage: node audit.mjs VITE NEXT OUT.json
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const [VITE, NEXT, OUT] = process.argv.slice(2);
const pages = JSON.parse(readFileSync(new URL('./routes.json', import.meta.url)));

async function render(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)));
  let status = null;
  try {
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 });
    status = res?.status() ?? null;
    await page.waitForTimeout(1500);
  } catch (e) { errors.push(`load: ${e.message.slice(0, 120)}`); }
  const data = await page.evaluate(() => {
    const meta = (sel) => document.querySelector(sel)?.getAttribute('content') ?? null;
    const main = document.querySelector('main') ?? document.body;
    const text = (main?.innerText ?? '').replace(/\s+/g, ' ').trim();
    return {
      finalUrl: location.href,
      title: document.title,
      description: meta('meta[name="description"]'),
      robots: meta('meta[name="robots"]'),
      canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
      ogImage: meta('meta[property="og:image"]'),
      h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.replace(/\s+/g, ' ').trim()).slice(0, 2),
      h2: document.querySelectorAll('h2').length,
      textLength: text.length,
      textHead: text.slice(0, 160),
      carousel: document.querySelectorAll('[data-behaviour="carousel"]').length,
      forms: document.querySelectorAll('form').length,
      gtm: !!document.querySelector('script[src*="googletagmanager"]'),
      signIn: /sign in/i.test(document.body?.innerText ?? ''),
    };
  }).catch((e) => ({ evalError: e.message }));
  await page.close();
  return { status, errors: errors.slice(0, 5), ...data };
}

const norm = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function verdict(v, n) {
  const notes = [];
  if (!n.status || n.status >= 400 || n.textLength < 40) return { verdict: 'missing', notes: [`Next ${n.status ?? 'no response'}, ${n.textLength ?? 0} chars`] };
  if (norm(v.title) !== norm(n.title)) notes.push(`title "${v.title}" vs "${n.title}"`);
  if (norm(v.h1?.[0]) !== norm(n.h1?.[0])) notes.push(`h1 "${v.h1?.[0] ?? ''}" vs "${n.h1?.[0] ?? ''}"`);
  const ratio = n.textLength / Math.max(1, v.textLength);
  if (ratio < 0.75 || ratio > 1.33) notes.push(`text ${v.textLength} vs ${n.textLength} chars`);
  if (v.carousel !== n.carousel) notes.push(`carousel ${v.carousel} vs ${n.carousel}`);
  if (v.forms !== n.forms) notes.push(`forms ${v.forms} vs ${n.forms}`);
  if ((v.description ?? '') !== (n.description ?? '')) notes.push('meta description differs');
  if (!!v.canonical !== !!n.canonical) notes.push(`canonical ${v.canonical ? 'yes' : 'no'} vs ${n.canonical ? 'yes' : 'no'}`);
  if (v.gtm !== n.gtm) notes.push(`GTM ${v.gtm} vs ${n.gtm}`);
  if (n.errors.length > v.errors.length) notes.push(`Next console errors: ${n.errors.join(' | ')}`);
  return { verdict: notes.length ? 'differs' : 'matches', notes };
}

async function api(base, path) {
  try {
    const res = await fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    return { status: res.status, type: (res.headers.get('content-type') ?? '').split(';')[0] };
  } catch (e) { return { status: null, type: e.message.slice(0, 60) }; }
}

const browser = await chromium.launch();
const out = { vite: VITE, next: NEXT, at: new Date().toISOString(), pages: [], apis: [], headers: {}, redirects: [] };
for (const p of pages.pages) {
  const v = await render(browser, VITE + p.vite);
  const n = await render(browser, NEXT + p.next);
  out.pages.push({ ...p, ...verdict(v, n), v, n });
  console.log(p.name, out.pages.at(-1).verdict);
}
for (const path of pages.apis) {
  const v = await api(VITE, path), n = await api(NEXT, path);
  out.apis.push({ path, v, n, verdict: v.status === n.status ? 'matches' : (n.status === 404 ? 'missing' : 'differs') });
}
for (const path of pages.redirects) {
  const v = await fetch(VITE + path, { redirect: 'manual' }), n = await fetch(NEXT + path, { redirect: 'manual' });
  const vl = v.headers.get('location'), nl = n.headers.get('location');
  out.redirects.push({ path, v: `${v.status} ${vl ?? ''}`, n: `${n.status} ${nl ?? ''}`, verdict: v.status === n.status ? 'matches' : 'differs' });
}
for (const [label, base] of [['vite', VITE], ['next', NEXT]]) {
  const res = await fetch(base + '/');
  out.headers[label] = Object.fromEntries(['content-security-policy', 'x-frame-options', 'strict-transport-security', 'referrer-policy', 'permissions-policy', 'x-content-type-options', 'cache-control', 'x-robots-tag']
    .map((h) => [h, res.headers.get(h)]));
}
await browser.close();
writeFileSync(OUT, JSON.stringify(out, null, 2));
