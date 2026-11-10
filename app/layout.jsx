import './fonts.css';
import '../src/site.css';
import '../src/index.css';
import '../src/studio.css';
import '../src/two-doors.css';
import '../src/store/store.css';
import './proof.css';
import '../src/responsive.css'; // keep last: the shared page box and left edge (see the file header)
import { Window } from 'happy-dom';
import { activeRelease } from './release-source.js';
import { themeStyle } from './theme-style.mjs';
import ConsentAnalytics from './ConsentAnalytics.jsx';
import { siteStructuredData } from './site-structured-data.mjs';
import { releaseNumber } from './release-observation.mjs';
import LegacyHashRedirect from './LegacyHashRedirect.jsx';

// Public pages are rendered once and kept for five minutes (Next cutover gap 6): the layout reads no request data.
// Pages stay current within five minutes of a release; the editor frame routes opt back into per-request rendering
// in their own segments, where Next applies the CSP nonce from the middleware's request header.
export const revalidate = 300;

export default async function RootLayout({ children }) {
  globalThis.DOMParser ??= new Window().DOMParser;
  const { release } = await activeRelease();
  const structured = JSON.stringify(siteStructuredData(release.site.name)).replace(/</g, '\\u003c');
  return <html lang="en" style={themeStyle(release.theme.tokens)}><head><meta name="gsam-release" content={String(releaseNumber(release))} /><link rel="preload" href="/fonts/montserrat-latin.woff2" as="font" type="font/woff2" crossOrigin="" /></head><body><script id="gs-ld-org" type="application/ld+json" dangerouslySetInnerHTML={{ __html: structured }} />{children}<LegacyHashRedirect pagePaths={release.pages.map((page) => page.path)} /><ConsentAnalytics /></body></html>;
}
