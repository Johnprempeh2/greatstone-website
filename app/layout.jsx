import '../src/site.css';
import '../src/index.css';
import '../src/two-doors.css';
import '../src/store/store.css';
import './proof.css';
import { Window } from 'happy-dom';
import { activeRelease } from './release-source.js';
import { themeStyle } from './theme-style.mjs';
import ConsentAnalytics from './ConsentAnalytics.jsx';
import { siteStructuredData } from './site-structured-data.mjs';

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }) {
  globalThis.DOMParser ??= new Window().DOMParser;
  const { release } = await activeRelease();
  const structured = JSON.stringify(siteStructuredData(release.site.name)).replace(/</g, '\\u003c');
  return <html lang="en" style={themeStyle(release.theme.tokens)}><body><script id="gs-ld-org" type="application/ld+json" dangerouslySetInnerHTML={{ __html: structured }} />{children}<ConsentAnalytics /></body></html>;
}
