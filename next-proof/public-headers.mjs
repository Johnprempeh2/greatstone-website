// Headers for a public (non-frame) response (Next cutover gaps 4 and 6).
// Public pages hold no per-visitor content (sign-in state is read in the browser), so Netlify's CDN may
// keep them for 5 minutes and serve a stale copy for a day while it refetches. Signed-in, client,
// checkout, editor and API routes, and any URL with a query, are never cached.
const uncachedPath = /^\/(?:api|account|org|portal|catalogue|invoice|join|order-confirmed|privacy|live-design|editor|preview|effect-preview|html-export|html-sample|media|_release|_islands)(?:\/|$)/;
export const PUBLIC_CDN_CACHE = 'public, s-maxage=300, stale-while-revalidate=86400';

export function publicHeaders({ method, pathname, search }) {
  // The same security headers the Vite site sends from public/_headers, which Next does not apply.
  const headers = {
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  };
  if (['GET', 'HEAD'].includes(method) && !uncachedPath.test(pathname) && !search) headers['Netlify-CDN-Cache-Control'] = PUBLIC_CDN_CACHE;
  return headers;
}
