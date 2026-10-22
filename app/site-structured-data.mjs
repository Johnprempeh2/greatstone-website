import { BRAND_TAGLINE } from '../src/lib/brand.mjs';

export function siteStructuredData(name) {
  const origin = 'https://greatstoneint.com';
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization', '@id': origin + '/#organization', name, url: origin,
        slogan: BRAND_TAGLINE,
        description: 'Practical digital transformation and AI-enabled automation. Greatstone finds where your people’s time goes and sets up the work that should run itself, with your people in charge.',
      },
      {
        '@type': 'WebSite', '@id': origin + '/#website', name, url: origin,
        inLanguage: 'en-GB', publisher: { '@id': origin + '/#organization' },
      },
    ],
  };
}
