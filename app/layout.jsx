import '../src/site.css';
import '../src/index.css';
import '../src/two-doors.css';
import '../src/store/store.css';
import './proof.css';
import { Window } from 'happy-dom';
import { headers } from 'next/headers';
import { activeRelease } from './release-source.js';
import { themeStyle } from './theme-style.mjs';
import ConsentAnalytics from './ConsentAnalytics.jsx';
import { siteStructuredData } from './site-structured-data.mjs';
import { releaseNumber } from './release-observation.mjs';
import LegacyHashRedirect from './LegacyHashRedirect.jsx';

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }) {
  globalThis.DOMParser ??= new Window().DOMParser;
  const { release } = await activeRelease();
  const nonce = (await headers()).get('x-nonce') || undefined;
  const structured = JSON.stringify(siteStructuredData(release.site.name)).replace(/</g, '\\u003c');
  return <html lang="en" style={themeStyle(release.theme.tokens)}><head><meta name="gsam-release" content={String(releaseNumber(release))} /></head><body><script id="gs-ld-org" type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: structured }} />{children}<LegacyHashRedirect pagePaths={release.pages.map((page) => page.path)} /><ConsentAnalytics /></body></html>;
}
