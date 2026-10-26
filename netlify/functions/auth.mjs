import { createAuthRequest } from './lib/better-auth.mjs';

export function cleanVerificationRedirect(request, response) {
  if (new URL(request.url).pathname !== '/api/auth/verify-email' || response.status < 300 || response.status >= 400) return response;
  const location = response.headers.get('location');
  if (!location) return response;
  const target = new URL(location, request.url);
  if (target.origin !== new URL(request.url).origin) return response;
  target.searchParams.delete('token');
  target.searchParams.delete('callbackURL');
  if (!target.searchParams.has('error')) target.searchParams.set('verified', '1');
  const headers = new Headers(response.headers);
  headers.set('location', `${target.pathname}${target.search}${target.hash}`);
  headers.set('referrer-policy', 'no-referrer');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function makeAuthHandler(create = createAuthRequest) {
  return async function handler(request) {
    const scoped = create();
    try {
      const response = await scoped.auth.handler(request);
      await scoped.finish(true);
      return cleanVerificationRedirect(request, response);
    } catch (error) {
      await scoped.finish(false);
      throw error;
    }
  };
}

export default makeAuthHandler();

export const config = { path: '/api/auth/*' };
