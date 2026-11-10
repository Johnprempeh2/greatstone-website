// John, 8 Nov: "We should look at real case studies we've done, but hide that page for now."
// Case Studies (GSAM's /proof, served as /case-studies) stays a draft in GSAM; visitors are sent to DX Consultancy
// with a temporary (302) redirect, and the page leaves the sitemap. Delete an entry here to bring its page back.
export const HIDDEN_ROUTES = ['/case-studies', '/proof'];
// DX Consultancy is /consultancy in GSAM releases and /dx-consultancy in the baked one: send visitors to whichever
// the release publishes, so the redirect never lands on a 404.
export const hiddenTarget = (paths = []) => (paths.includes('/consultancy') || !paths.includes('/dx-consultancy') ? '/consultancy' : '/dx-consultancy');

/** Next redirects for the hidden pages (and anything under them), temporary so search engines keep no move. */
export const hiddenRedirects = (paths) => HIDDEN_ROUTES.flatMap((path) => [path, `${path}/:rest*`])
  .map((source) => ({ source, destination: hiddenTarget(paths), statusCode: 302 }));

export const isHidden = (path) => HIDDEN_ROUTES.some((hidden) => path === hidden || path.startsWith(hidden + '/'));
