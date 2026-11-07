import { readFileSync } from 'node:fs';
import { normalisePath, VENDOR_PATH_MAP } from '../src/lib/legacy-redirects.mjs';
import { legacyDecisions } from './legacy-decisions.mjs';

// Routes the Next app serves outside the release pages.
const appRoutes = ['/', '/account', '/shop'];

// Sitemap target → the nearest page that exists today. Used only while the target is unpublished, so an
// old URL never redirects to a missing page (GRE-2081: switch a redirect only after its target exists).
const interimRoutes = {
  '/account/sign-in': '/account',
  '/account/security': '/account',
  '/account/orders': '/account',
  '/dev-tools/products': '/shop',
  '/dev-tools/basket': '/shop',
  '/dev-tools/checkout': '/shop',
  '/consultancy/services': '/transformation-services',
  '/consultancy/how-we-work': '/method',
  '/consultancy/how-we-help': '/how-we-help',
  '/support': '/contact',
  '/proof': '/case-studies',
  '/dev-tools/choosing-tools': '/dev-tools',
  '/dev-tools/trials': '/dev-tools',
  '/dev-tools/document-solutions': '/dev-tools',
};

export const legacyPaths = readFileSync(new URL('../scripts/legacy-urls.txt', import.meta.url), 'utf8')
  .split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));

const decisionsByPath = new Map(legacyDecisions.map((decision) => [decision.from, decision]));

export function legacyDecisionFor(path) {
  return decisionsByPath.get(normalisePath(path));
}

function interimFor(decision) {
  if (decision.product) return '/product/' + decision.product;
  const brand = decision.target.match(/^\/dev-tools\/brands\/([^/]+)$/);
  if (brand) return '/shop/' + brand[1];
  if (decision.target.startsWith('/insights/')) return '/insights';
  return interimRoutes[decision.target] || '/';
}

// Where one old path lands now, and why: 'live' (the sitemap target is published), 'interim' (nearest
// existing page until the target is built) or 'pending Ben' (product to confirm or retire; brand fallback).
export function legacyLanding(path, publishedPaths = []) {
  const source = normalisePath(path);
  const decision = legacyDecisionFor(source);
  if (!decision) {
    const vendor = VENDOR_PATH_MAP[source.slice(1).split('/')[0]];
    if (vendor) return { to: '/shop/' + source.slice(1).split('/')[0], state: 'interim' };
    if (source.startsWith('/blog/') || source.startsWith('/news/')) return { to: '/insights', state: 'interim' };
    return { to: '/', state: 'interim' };
  }
  if (publishedPaths.includes(decision.from)) return { to: decision.from, state: 'live', decision };
  if (appRoutes.includes(decision.target) || publishedPaths.includes(decision.target)) return { to: decision.target, state: 'live', decision };
  return { to: interimFor(decision), state: decision.action.includes('pending Ben') ? 'pending Ben' : 'interim', decision };
}

export function nextLegacyDestination(path, publishedPaths = []) {
  return legacyLanding(path, publishedPaths).to;
}

// Exact rules first (Next uses the first match), then wildcards for old product, blog and news URLs that
// the crawl missed. Next passes the query string through to the destination.
export function nextLegacyRedirects(paths = legacyPaths, publishedPaths = []) {
  const exact = [...new Set(paths.map(normalisePath))]
    .map((source) => ({ source, destination: nextLegacyDestination(source, publishedPaths), permanent: true }))
    .filter((rule) => rule.source !== rule.destination && !publishedPaths.includes(rule.source));
  const wildcards = [
    ...Object.keys(VENDOR_PATH_MAP).map((segment) => ({ source: `/${segment}/:path*`, destination: `/shop/${segment}`, permanent: true })),
    { source: '/blog/:path*', destination: '/insights', permanent: true },
    { source: '/news/:path*', destination: '/insights', permanent: true },
  ];
  return [...exact, ...wildcards];
}
