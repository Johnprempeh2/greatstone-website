const framePath = /^\/(editor|preview|live-design)(\/|$)/;
const statefulPath = /^\/(api|studio)(\/|$)/;
// Machine-called endpoints that verify their own signature and never read a browser cookie:
// the GSAM admin bridge (Ed25519 request signature) and the Stripe webhook (Stripe-Signature).
// Server-to-server callers send no Origin or Sec-Fetch-Site, so the cross-site check would refuse them.
const signedPath = /^\/api\/(admin\/v1\/|stripe-webhook$)/;

export function frameRouteDecision({ pathname, hostname, editorHost, method, origin, fetchSite, publicOrigin }) {
  const editor = !!editorHost && hostname.toLowerCase() === editorHost.toLowerCase();
  const frame = framePath.test(pathname);
  if (frame && !editor) return { status: 404, frame };
  if (editor && !frame && (statefulPath.test(pathname) || !['GET', 'HEAD', 'OPTIONS'].includes(method))) return { status: 404, frame };
  if (!editor && statefulPath.test(pathname) && !signedPath.test(pathname) && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (origin ? origin !== publicOrigin : fetchSite !== 'same-origin') return { status: 403, frame };
  }
  return { status: 200, frame };
}
