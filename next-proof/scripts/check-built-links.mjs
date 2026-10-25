import { Window } from 'happy-dom';
import { pathToFileURL } from 'node:url';
import release from '../data/release.json' with { type: 'json' };
import { legacyHashDestination } from '../legacy-hashes.mjs';

export async function checkBuiltLinks(base, paths, fetchPage = fetch) {
  const failures = [];
  const htmlByPath = new Map();
  const pagePaths = paths.map((path) => new URL(path, base).pathname);
  let checkedLinks = 0;
  let mappedLegacy = 0;

  async function page(path) {
    if (!htmlByPath.has(path)) {
      htmlByPath.set(path, (async () => {
        const response = await fetchPage(new URL(path, base));
        return { status: response.status, html: response.ok ? await response.text() : '' };
      })());
    }
    return htmlByPath.get(path);
  }

  for (const path of pagePaths) {
    const current = await page(path);
    if (current.status !== 200) { failures.push(`${path}: built page returned ${current.status}`); continue; }
    const document = new Window({ url: new URL(path, base).href }).document;
    document.write(current.html);
    for (const node of document.querySelectorAll('a[href], button[formaction], input[formaction]')) {
      const href = node.getAttribute('href') ?? node.getAttribute('formaction');
      if (!href || /^(mailto:|tel:)/i.test(href)) continue;
      checkedLinks++;
      let target;
      try { target = new URL(href, new URL(path, base)); }
      catch { failures.push(`${path}: invalid link ${href}`); continue; }
      if (target.origin !== new URL(base).origin) continue;
      const destination = legacyHashDestination(target.hash, target.pathname, pagePaths,
        (id) => target.pathname === path && Boolean(document.getElementById(id)));
      if (destination) {
        mappedLegacy++;
        target = new URL(destination, base);
      }
      const landing = await page(target.pathname + target.search);
      if (landing.status !== 200) { failures.push(`${path}: ${href} returned ${landing.status}`); continue; }
      if (target.hash) {
        const landingDocument = target.pathname === path && !destination ? document : new Window({ url: target.href }).document;
        if (landingDocument !== document) landingDocument.write(landing.html);
        let id;
        try { id = decodeURIComponent(target.hash.slice(1)); }
        catch { failures.push(`${path}: invalid anchor ${href}`); continue; }
        if (!landingDocument.getElementById(id)) failures.push(`${path}: ${href} has no #${id} anchor`);
      }
    }
  }
  return { pages: pagePaths.length, checkedLinks, mappedLegacy, failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.env.PROOF_BASE || 'http://127.0.0.1:5181';
  const result = await checkBuiltLinks(base, release.pages.map((page) => page.path));
  console.log(`Checked ${result.pages} built pages, ${result.checkedLinks} internal/link candidates, ${result.mappedLegacy} legacy hashes: ${result.failures.length} failure(s)`);
  for (const failure of result.failures) console.error(failure);
  if (result.failures.length) process.exitCode = 1;
}
