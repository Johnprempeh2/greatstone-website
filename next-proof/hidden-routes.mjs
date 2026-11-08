// John, 8 Nov: "We should look at real case studies we've done, but hide that page for now."
// Case Studies (GSAM's /proof, served as /case-studies) stays a draft in GSAM; visitors are sent to DX Consultancy
// with a temporary (302) redirect, and the page leaves the sitemap. Delete an entry here to bring its page back.
export const HIDDEN_ROUTES = ['/case-studies', '/proof'];
export const HIDDEN_TARGET = '/consultancy';

/** Next redirects for the hidden pages (and anything under them), temporary so search engines keep no move. */
export const hiddenRedirects = () => HIDDEN_ROUTES.flatMap((path) => [path, `${path}/:rest*`])
  .map((source) => ({ source, destination: HIDDEN_TARGET, statusCode: 302 }));

export const isHidden = (path) => HIDDEN_ROUTES.some((hidden) => path === hidden || path.startsWith(hidden + '/'));
