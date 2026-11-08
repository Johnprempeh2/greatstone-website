import release from './next-proof/data/release.json' with { type: 'json' };
import { nextLegacyRedirects } from './next-proof/legacy-routes.mjs';

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  async redirects() {
    // Common guesses at old addresses that the legacy list does not carry (cutover gap 3).
    // /intel is the old alias for AI Market Intelligence (gap 1). /proof is not here: it is GSAM's Case Studies
    // path, and the catch-all page sends it to /case-studies only when the release publishes that instead.
    const guesses = [['/about-us', '/about'], ['/contact-us', '/contact'], ['/intel', '/ai-market-intelligence'], ['/sign-in', '/account'], ['/signin', '/account']]
      .map(([source, destination]) => ({ source, destination, permanent: true }));
    return [...guesses, ...nextLegacyRedirects(undefined, release.pages.map((page) => page.path))];
  },
  // GRE-1831 live design renders pages in the browser, where the sanitiser uses the browser's own
  // inert parser: happy-dom (Node only) is not bundled for the client.
  webpack(webpackConfig, { isServer }) {
    if (!isServer) webpackConfig.resolve.alias = { ...webpackConfig.resolve.alias, 'happy-dom': false };
    return webpackConfig;
  },
  env: {
    NEXT_PUBLIC_GTM_ID: process.env.NEXT_PUBLIC_GTM_ID || process.env.VITE_GTM_ID || '',
    NEXT_PUBLIC_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
    // Baked in at build: a CLI upload has no git and no COMMIT_REF at runtime (GRE-2804).
    GSAM_ENGINE_COMMIT: process.env.GSAM_ENGINE_COMMIT || '',
  },
};

export default config;
