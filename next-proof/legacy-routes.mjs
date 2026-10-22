import { readFileSync } from 'node:fs';
import { classifyLegacyPath, redirectRulesFor, normalisePath } from '../src/lib/legacy-redirects.mjs';

const aliases = {
  '/our-services': '/services',
  '/privacy-policy': '/privacy',
  '/cookie-policy': '/cookies',
  '/terms-and-conditions': '/terms',
  '/terms-and-conditions-for-goods-and-services': '/terms',
};

export const legacyPaths = readFileSync(new URL('../scripts/legacy-urls.txt', import.meta.url), 'utf8')
  .split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));

export function nextLegacyDestination(path, publishedPaths = []) {
  const source = normalisePath(path);
  if (source === '/' || publishedPaths.includes(source)) return source;
  if (aliases[source]) return aliases[source];
  const target = classifyLegacyPath(source).dest;
  if (target === '/#shop') return '/shop';
  if (target.startsWith('/#shop/')) return target.replace('/#shop/iron-software', '/shop/ironsoftware').replace('/#shop/', '/shop/');
  if (target === '/#account') return '/contact';
  if (source === '/blog' || source.startsWith('/blog/') || source.startsWith('/news/')) return '/insights';
  return target;
}

export function nextLegacyRedirects(paths = legacyPaths, publishedPaths = []) {
  const sources = new Set(paths.map(normalisePath));
  const rules = redirectRulesFor(paths);
  return rules.filter((rule) => rule.from.endsWith('/*') || sources.has(rule.from))
    .map((rule) => ({
      source: rule.from.endsWith('/*') ? rule.from.slice(0, -1) + ':path*' : rule.from,
      destination: nextLegacyDestination(rule.from.endsWith('/*') ? rule.from.slice(0, -1) + 'sample' : rule.from, publishedPaths),
      permanent: true,
    }))
    .filter((rule) => rule.source !== rule.destination && !publishedPaths.includes(rule.source));
}
