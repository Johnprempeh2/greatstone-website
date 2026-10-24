import { NextResponse } from 'next/server';
import { allowedHostOrigins, frameCsp, publicFrameAncestors } from './next-proof/frame-protocol.mjs';
import { frameRouteDecision } from './next-proof/frame-routing.mjs';

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const hostname = (request.headers.get('host') || request.nextUrl.hostname).replace(/:\d+$/, '');
  const decision = frameRouteDecision({ pathname, hostname, editorHost: process.env.GSAM_EDITOR_HOST, method: request.method,
    origin: request.headers.get('origin'), fetchSite: request.headers.get('sec-fetch-site'), publicOrigin: `${request.nextUrl.protocol}//${request.headers.get('host')}` });
  if (decision.status !== 200) return new NextResponse(null, { status: decision.status });
  const isFrame = decision.frame;
  const requestHeaders = new Headers(request.headers);
  const nonce = btoa(crypto.randomUUID());
  const csp = isFrame ? frameCsp(allowedHostOrigins(process.env.GSAM_EDITOR_ORIGINS, process.env.NODE_ENV === 'development'), nonce, process.env.NODE_ENV === 'development') : null;
  if (isFrame) {
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', csp);
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (isFrame) {
    response.headers.set('Content-Security-Policy', csp);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Origin-Agent-Cluster', '?1');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), clipboard-read=()');
  } else {
    response.headers.set('Content-Security-Policy', publicFrameAncestors(process.env.GSAM_EDITOR_ORIGINS || undefined));
    response.headers.delete('X-Frame-Options');
  }
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
