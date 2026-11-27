import release from './next-proof/data/release.json' with { type: 'json' };
import { nextLegacyRedirects } from './next-proof/legacy-routes.mjs';
import { hiddenRedirects } from './next-proof/hidden-routes.mjs';
import { INSIGHTS_PATH, AI_MARKET_INTELLIGENCE_PATH } from './next-proof/case-studies-path.mjs';

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  async redirects() {
    // Common guesses at old addresses that the legacy list does not carry (cutover gap 3).
    // /intel is the old alias for AI Market Intelligence (gap 1). /proof is the old name of Case Studies (John, 25 Oct):
    // it always moves to /case-studies, which serves the page even when the release publishes it as /proof
    // (next-proof/case-studies-path.mjs).
    const guesses = [['/about-us', '/about'], ['/contact-us', '/contact'], ['/intel', '/ai-market-intelligence'], ['/sign-in', '/account'], ['/signin', '/account'], ['/proof', '/case-studies']]
      .map(([source, destination]) => ({ source, destination, permanent: true }));
    // Insights opens AI Market Intelligence (John, 27 Nov): temporary, so the Insights page can come back later.
    const insights = { source: INSIGHTS_PATH, destination: AI_MARKET_INTELLIGENCE_PATH, permanent: false };
    // Hidden pages first, so a permanent alias never answers before them.
    return [...hiddenRedirects(release.pages.map((page) => page.path)), insights, ...guesses, ...nextLegacyRedirects(undefined, release.pages.map((page) => page.path))];
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
