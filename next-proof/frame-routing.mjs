const framePath = /^\/(editor|preview)(\/|$)/;
const statefulPath = /^\/(api|studio)(\/|$)/;

export function frameRouteDecision({ pathname, hostname, editorHost, method, origin, fetchSite, publicOrigin }) {
  const editor = !!editorHost && hostname.toLowerCase() === editorHost.toLowerCase();
  const frame = framePath.test(pathname);
  if ((frame && !editor) || (editor && !frame && !pathname.startsWith('/_next/') && !pathname.startsWith('/assets/'))) return { status: 404, frame };
  if (!editor && statefulPath.test(pathname) && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (origin ? origin !== publicOrigin : fetchSite !== 'same-origin') return { status: 403, frame };
  }
  return { status: 200, frame };
}
