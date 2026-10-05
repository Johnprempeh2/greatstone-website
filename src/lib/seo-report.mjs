// seo-report.mjs — decides, page by page, whether a built site asks search engines to stay away.
//
// At cutover the site can keep `<meta name="robots" content="noindex">` while robots.txt says
// `Allow: /`, so the launch looks fine and search engines skip it. This reads the three places a
// `noindex` can come from in a Netlify build and names the one that applies:
//   - a robots / googlebot meta tag in the page,
//   - an `X-Robots-Tag` header in `_headers` whose path rule matches the page,
//   - a robots.txt `Disallow` (for `User-agent: *`) that covers the page's path.
// Pure functions only; scripts/seo-report.mjs does the file reading and printing. It reports, it
// never fails a build; the script's --launch flag (npm run launch:check) turns it into the go-live gate.

const NOINDEX = /(^|[\s,])(noindex|none)([\s,]|$)/i;

/** Attributes of one tag's source, lower-cased names, quotes removed. */
function attrsOf(tag) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  for (const m of tag.replace(/^<meta\b/i, '').matchAll(re)) {
    out[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? '';
  }
  return out;
}

/** The robots meta tags in an HTML page that say noindex, as their content values. */
export function metaNoindex(html) {
  const found = [];
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrsOf(tag);
    const name = (a.name || '').toLowerCase();
    if ((name === 'robots' || name === 'googlebot') && NOINDEX.test(a.content || '')) {
      found.push(`${name}=${a.content}`);
    }
  }
  return found;
}

/** Netlify `_headers` as [{ pattern, headers: [[name, value]] }]. */
export function parseHeaders(text) {
  const rules = [];
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      cur = { pattern: raw.trim(), headers: [] };
      rules.push(cur);
    } else if (cur) {
      const i = raw.indexOf(':');
      if (i > 0) cur.headers.push([raw.slice(0, i).trim(), raw.slice(i + 1).trim()]);
    }
  }
  return rules;
}

function netlifyPathMatches(pattern, path) {
  if (/^[a-z]+:\/\//i.test(pattern)) return false; // host-specific rules are out of scope
  const re = '^' + pattern
    .split(/(\*|:[A-Za-z_]\w*)/)
    .map((part) => (part === '*' ? '.*' : part.startsWith(':') ? '[^/]+' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')))
    .join('') + '$';
  return new RegExp(re).test(path);
}

/** X-Robots-Tag values from `_headers` that apply to the path and say noindex. */
export function headersNoindex(rules, path) {
  const found = [];
  for (const { pattern, headers } of rules) {
    if (!netlifyPathMatches(pattern, path)) continue;
    for (const [name, value] of headers) {
      if (name.toLowerCase() === 'x-robots-tag' && NOINDEX.test(value)) found.push(`${pattern} X-Robots-Tag: ${value}`);
    }
  }
  return found;
}

/** The Allow/Disallow rules robots.txt gives `User-agent: *`. */
export function parseRobots(text) {
  const rules = [];
  let agents = [];
  let inRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === 'user-agent') {
      if (inRules) { agents = []; inRules = false; }
      agents.push(m[2].trim());
    } else if (key === 'allow' || key === 'disallow') {
      inRules = true;
      if (agents.includes('*') && m[2].trim()) rules.push({ allow: key === 'allow', path: m[2].trim() });
    }
  }
  return rules;
}

function robotsRuleMatches(rulePath, path) {
  const anchored = rulePath.endsWith('$');
  const body = anchored ? rulePath.slice(0, -1) : rulePath;
  const re = '^' + body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : '');
  return new RegExp(re).test(path);
}

/** The robots.txt Disallow that blocks the path, or null. Longest match wins; Allow wins a tie. */
export function robotsBlocks(rules, path) {
  let best = null;
  for (const r of rules) {
    if (!robotsRuleMatches(r.path, path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return best && !best.allow ? `Disallow: ${best.path}` : null;
}

/** dist-relative file name → the URL path a visitor asks for. */
export function urlPathOf(file) {
  const p = '/' + file.split(/[\\/]/).filter(Boolean).join('/');
  return p.endsWith('/index.html') ? p.slice(0, -'index.html'.length) : p;
}

/**
 * pages: [{ file, html }]; headers / robots: file text or null.
 * Returns one row per page ({ file, path, status, sources }) and the overall status.
 */
export function indexabilityReport({ pages, headers = null, robots = null }) {
  const headerRules = headers ? parseHeaders(headers) : [];
  const robotsRules = robots ? parseRobots(robots) : [];
  const rows = pages.map(({ file, html }) => {
    const path = urlPathOf(file);
    const sources = [];
    for (const m of metaNoindex(html)) sources.push(`meta tag (${m})`);
    const asFile = '/' + file.split(/[\\/]/).filter(Boolean).join('/');
    const paths = asFile === path ? [path] : [path, asFile];
    const hdr = new Set(paths.flatMap((p) => headersNoindex(headerRules, p)));
    for (const h of hdr) sources.push(`_headers (${h})`);
    const blocked = robotsBlocks(robotsRules, path);
    if (blocked) sources.push(`robots.txt (${blocked})`);
    return { file, path, status: sources.length ? 'NOINDEX' : 'INDEXABLE', sources };
  });
  const status = rows.length === 0 ? 'NO PAGES' : rows.some((r) => r.status === 'NOINDEX') ? 'NOINDEX' : 'INDEXABLE';
  return { rows, status };
}
