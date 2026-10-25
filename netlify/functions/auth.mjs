import { createAuthRequest } from './lib/better-auth.mjs';

export default async function handler(request) {
  const scoped = createAuthRequest();
  try {
    const response = await scoped.auth.handler(request);
    await scoped.finish(true);
    return response;
  } catch (error) {
    await scoped.finish(false);
    throw error;
  }
}

export const config = { path: '/api/auth/*' };
