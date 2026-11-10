// GRE-3778 (switch S4): renders every published page once with today's engine and writes the schema 2
// release GSAM imports as revision 1 of each page. Run against a local engine on the baked release:
//
//   npm run dev:next            (in another terminal; PROOF_BASE overrides http://127.0.0.1:5181)
//   node next-proof/scripts/export-html-pages.mjs
//
// Writes next-proof/data/html-export-release.json and docs/parity/GRE-3778/export-report.md.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { transformSync } from 'esbuild';
import { chromeFile, exportRenderedPage, releasePage, stripCssComments, withoutDraftLinks } from '../html-export.mjs';
import { sanitiseHtml } from '../html-sanitiser.mjs';
import { sanitiseCss } from '../css-sanitiser.mjs';
import { CHROME_KEYS } from '../gsam-release.mjs';
import { siteChrome } from '../../app/site-chrome.mjs';

const base = process.env.PROOF_BASE || 'http://127.0.0.1:5181';
const baked = JSON.parse(await readFile(new URL('../data/release.json', import.meta.url), 'utf8'));
const siteData = siteChrome(baked);

async function get(path) {
  const response = await fetch(new URL(path, base));
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.text();
}

const pages = [];
const formBlocks = {};
const blockCss = new Set();
const stylesheetLinks = new Set();
let chrome;
for (const page of baked.pages) {
  const documentHtml = await get(page.path);
  for (const [, href] of documentHtml.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)) stylesheetLinks.add(href.replace(/\?.*$/, ''));
  const exported = exportRenderedPage(documentHtml, page, siteData);
  exported.blockCss.forEach((css) => blockCss.add(css));
  Object.assign(formBlocks, exported.formBlocks);
  chrome ||= exported.chrome;
  // A shell the exporter does not recognise would otherwise publish every page with no header or footer.
  if (!exported.chrome.header.html || !exported.chrome.footer.html)
    throw new Error(`${page.path}: no header or footer found in the render; the site shell changed, so update the chrome export`);
  if (CHROME_KEYS.some((key) => exported.chrome[key].html !== chrome[key].html || exported.chrome[key].css !== chrome[key].css))
    throw new Error(`${page.path}: header or footer differs from the first page; chrome must be shared`);
  pages.push({ page, exported });
}

// The site stylesheet: the CSS the engine loads for every page (layout and page route), then the block
// CSS the renderer writes inline, in the same order the browser applies them today.
const linked = [];
for (const href of stylesheetLinks) linked.push(await get(href));
// Minified, which also drops the rules the dev build repeats, so it fits the sanitiser's size limit. The
// sanitiser refuses data: URLs, so inline SVG images become files under /assets/html-export. It also
// refuses backslash escapes, so `charset: 'utf8'` writes escaped characters (`content: "\2026"`) as
// themselves.
const assetDir = new URL('../../public/assets/html-export/', import.meta.url);
await mkdir(assetDir, { recursive: true });
let stylesheet = transformSync([...linked, ...blockCss].map(stripCssComments).join('\n'), { loader: 'css', minify: true, charset: 'utf8' }).code;
for (const [match, data] of stylesheet.matchAll(/url\("?data:image\/svg\+xml,([^")]+)"?\)/g)) {
  const svg = decodeURIComponent(data);
  const name = `${createHash('sha256').update(svg).digest('hex').slice(0, 16)}.svg`;
  await writeFile(new URL(name, assetDir), svg);
  stylesheet = stylesheet.replaceAll(match, `url(/assets/html-export/${name})`);
}

// Staged GSAM drafts (scripts/stage-export-drafts.mjs) are not published, but the footer lists every page
// in the release, so their render adds a link to each. The shared chrome drops those links, unless
// PARITY_CHROME=1 keeps them so a parity run compares like with like.
const exportUrl = new URL('../data/html-export-release.json', import.meta.url);
const draftIds = new Set(JSON.parse(await readFile(new URL('../frozen/gre-1822-drafts.json', import.meta.url), 'utf8')).pages.map((page) => page.id));
const drafts = baked.pages.filter((page) => draftIds.has(page.id));
if (drafts.length && process.env.PARITY_CHROME !== '1') chrome = withoutDraftLinks(chrome, drafts);
else if (drafts.length) console.log('PARITY_CHROME=1: the chrome links to staged drafts; for parity only, do not commit this export');

const release = {
  schema: 2, siteId: baked.siteId, orgId: baked.orgId, release: 1, theme: baked.theme,
  stylesheet, chrome,
  pages: pages.map(({ page, exported }) => releasePage(page, exported, baked.site.navigation)),
  collections: Object.fromEntries(Object.entries(baked.collections || {}).map(([key, value]) => [key, value.entries || []])),
  redirects: baked.redirects || [], media: {},
};

// What the engine's sanitisers take out at render time. The parity captures show what that costs.
const removedBy = (label, items) => (items.length ? `- ${label}: ${[...new Set(items)].map((item) => `${item} ×${items.filter((x) => x === item).length}`).join(', ')}` : null);
const site = sanitiseCss(stylesheet, { fontFace: true });
const lines = [
  '# GRE-3778 export report', '',
  `Engine render from ${base}, baked release ${baked.release.number}. ${pages.length} pages. Site stylesheet ${Math.round(stylesheet.length / 1024)} KB.`, '',
  '## Site stylesheet and chrome', '',
  removedBy('stylesheet', site.removed) || '- stylesheet: nothing removed',
  ...CHROME_KEYS.map((key) => removedBy(key, [...sanitiseHtml(chrome[key].html).removed, ...sanitiseCss(chrome[key].css, { scope: key }).removed]) || `- ${key}: nothing removed`), '',
  '## Pages', '',
];
for (const { page, exported } of pages) {
  const html = sanitiseHtml(exported.html).removed;
  const css = sanitiseCss(exported.css, { scope: 'page' }).removed;
  lines.push(`### ${page.path}`, '', `HTML ${Math.round(exported.html.length / 1024)} KB, page CSS ${exported.css.split('\n').filter(Boolean).length} rules.`, '',
    ...exported.notes.map((note) => `- ${note}`), removedBy('sanitiser removes', [...html, ...css]) || '- sanitiser removes nothing', '');
}

await writeFile(exportUrl, `${JSON.stringify(release, null, 2)}\n`);
// John, 8 Nov: GSAM refreshes its shared stylesheet and footer from this file at Publish (GET /_chrome.json),
// so they follow the site's code instead of the copy taken at import.
// ponytail: as fresh as the last export run; render it in CI if the CSS changes without one.
await writeFile(new URL('../../public/_chrome.json', import.meta.url), `${JSON.stringify(chromeFile(release), null, 0)}\n`);
await writeFile(new URL('../frozen/form-blocks.json', import.meta.url), `${JSON.stringify(formBlocks, null, 2)}\n`);
const reportDir = new URL('../../docs/parity/GRE-3778/', import.meta.url);
await mkdir(reportDir, { recursive: true });
await writeFile(new URL('export-report.md', reportDir), `${lines.join('\n')}\n`);
console.log(`Exported ${pages.length} pages to next-proof/data/html-export-release.json; report in docs/parity/GRE-3778/export-report.md`);
