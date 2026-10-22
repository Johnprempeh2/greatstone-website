import release from './next-proof/data/release.json' with { type: 'json' };
import { nextLegacyRedirects } from './next-proof/legacy-routes.mjs';

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  async redirects() {
    return nextLegacyRedirects(undefined, release.pages.map((page) => page.path));
  },
  env: {
    NEXT_PUBLIC_GTM_ID: process.env.NEXT_PUBLIC_GTM_ID || process.env.VITE_GTM_ID || '',
    NEXT_PUBLIC_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
  },
};

export default config;
