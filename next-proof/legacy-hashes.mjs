// Old Vite links used hashes as page routes. Keep them usable on the Next site.
import { interviewPathOf, parseInterviewHash } from '../src/portal/interview/route.mjs';
import { publishedAlias } from './release-1-sync.mjs';

// Renamed pages: used only when the old path is no longer published.
const renamed = { proof: '/case-studies' };
const special = { book: '/contact', shop: '/shop', breakdown: '/method', service: '/services', enquire: '/contact', 'ai-market-intelligence': '/ai-market-intelligence' };

export function legacyHashDestination(hash, pathname, pagePaths, hasAnchor = () => false) {
  if (!hash?.startsWith('#')) return null;
  let fragment;
  try { fragment = decodeURIComponent(hash.slice(1)); }
  catch { return null; }
  if (hasAnchor(fragment)) return null;
  // GRE-4245: interview links (#join/<token>, #portal/interview…?seats=…) keep their query on the way to the path.
  if (parseInterviewHash(hash)) return interviewPathOf(hash);
  const checkout = /^order-confirmed\?session=(cs_test_[A-Za-z0-9]+)$/i.exec(fragment);
  if (checkout) return `/order-confirmed?session=${checkout[1]}`;
  const privateRoute = /^(account|org|portal|invoice|catalogue)(?:\/([\w/-]+))?$/i.exec(fragment);
  if (privateRoute) {
    const [, section, rest] = privateRoute;
    const destination = section === 'org' && rest?.startsWith('e/')
      ? `/org#org/${rest}` : `/${section}${rest ? `/${rest}` : ''}`;
    return destination === pathname + hash ? null : destination;
  }
  // Store and service detail views, and the old full-screen briefing hub (#intel, #intel/<id>, IntelBand's default CTA).
  const detail = /^\/?(product|shop|service)\/([\w-]+)\/?$/i.exec(fragment);
  if (detail) return `/${detail[1].toLowerCase()}/${detail[2]}`;
  // Bare #intel is the AI Market Intelligence hub, a Next page since the cutover; a briefing id still lands on Insights.
  if (/^\/?intel\/?$/i.test(fragment)) return pathname === '/ai-market-intelligence' ? null : '/ai-market-intelligence';
  if (/^\/?intel\/[\w-]+$/i.test(fragment)) return pathname === '/insights' ? null : '/insights';
  const go = fragment.startsWith('go/');
  const parts = (go ? fragment.slice(3) : fragment).split('/').filter(Boolean);
  if (!parts.length) return null;
  if (parts[0] === 'service' || parts[0] === 'enquire') return special[parts[0]];
  let page = special[parts[0]] || `/${parts[0]}`;
  page = publishedAlias(page, pagePaths) || page;
  if (!pagePaths.includes(page) && renamed[parts[0]]) page = renamed[parts[0]];
  if (!go && parts.length > 1) return null;
  // Code pages the Next app serves outside the release pages.
  if (!pagePaths.includes(page) && !['/shop', '/ai-market-intelligence'].includes(page)) return null;
  const anchor = parts.slice(1).join('/');
  const destination = page + (anchor ? `#${encodeURIComponent(anchor)}` : '');
  return destination === pathname + hash ? null : destination;
}

// GRE-1824: "#book" opened the booking popup on the Vite site; the Next site does the same
// rather than sending the visitor to the contact page they may already be on.
export const isBookingHash = (hash) => hash === '#book';

// Auth emails land on /?token=…#account or /?verified=1#account. The query must survive the move to /account.
export function keepLandingQuery(destination, search) {
  if (!search || search === '?' || destination.includes('?')) return destination;
  const hash = destination.indexOf('#');
  return hash < 0 ? destination + search : destination.slice(0, hash) + search + destination.slice(hash);
}
