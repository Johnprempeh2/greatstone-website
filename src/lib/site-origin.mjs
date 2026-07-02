// The site's canonical public origin — single source of truth for SEO (canonical link, og:url,
// schema.org URLs) and for the editor's SEO preview.
//
// DOMAIN-PORTABLE BY DESIGN. With VITE_SITE_ORIGIN unset, it falls back to the live host
// (location.origin), so the app is correct on ANY domain served at root with zero config. That is
// what keeps the eventual move to the real Greatstone domain a one-line config change, not another
// migration. Set VITE_SITE_ORIGIN at build time (the canonical domain is https://greatstoneint.com,
// decided 2 Jul: permanent, no move to greatstonesoftware.co.uk) to PIN the canonical domain for SEO
// regardless of which host actually served the page. See docs/DOMAIN-CUTOVER.md.

// Pure cores (no import.meta, no location) so they are unit-testable.
export function resolveOrigin(envOrigin, locationOrigin) {
  const e = (envOrigin || '').trim();
  if (e) return e.replace(/\/+$/, '');           // env wins; trim any trailing slash(es)
  return (locationOrigin || '').trim();          // else track the live host
}
export function originToDomain(origin) {
  return (origin || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

const ENV_ORIGIN = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SITE_ORIGIN) || '';

// Full origin incl. scheme, e.g. https://greatstone-home.netlify.app (today) or the real domain once set.
export function siteOrigin() {
  return resolveOrigin(ENV_ORIGIN, (typeof location !== 'undefined' && location.origin) || '');
}
// Bare host for UI previews that show a domain without a scheme, e.g. greatstoneint.com.
export function siteDomain() {
  return originToDomain(siteOrigin());
}
