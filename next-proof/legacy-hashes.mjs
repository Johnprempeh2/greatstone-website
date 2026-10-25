// Old Vite links used hashes as page routes. Keep them usable on the Next site.
const special = { book: '/contact', shop: '/shop', breakdown: '/method', service: '/services', enquire: '/contact', 'ai-market-intelligence': '/insights' };

export function legacyHashDestination(hash, pathname, pagePaths, hasAnchor = () => false) {
  if (!hash?.startsWith('#')) return null;
  let fragment;
  try { fragment = decodeURIComponent(hash.slice(1)); }
  catch { return null; }
  if (hasAnchor(fragment)) return null;
  const go = fragment.startsWith('go/');
  const parts = (go ? fragment.slice(3) : fragment).split('/').filter(Boolean);
  if (!parts.length) return null;
  if (parts[0] === 'service' || parts[0] === 'enquire') return special[parts[0]];
  const page = special[parts[0]] || `/${parts[0]}`;
  if (!go && parts.length > 1) return null;
  if (!pagePaths.includes(page) && page !== '/shop') return null;
  const anchor = parts.slice(1).join('/');
  const destination = page + (anchor ? `#${encodeURIComponent(anchor)}` : '');
  return destination === pathname + hash ? null : destination;
}
