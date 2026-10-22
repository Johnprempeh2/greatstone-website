import '../src/site.css';
import '../src/index.css';
import '../src/two-doors.css';
import '../src/store/store.css';
import './proof.css';
import { Window } from 'happy-dom';
import { activeRelease } from './release-source.js';
import { themeStyle } from './theme-style.mjs';

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }) {
  globalThis.DOMParser ??= new Window().DOMParser;
  const { release } = await activeRelease();
  return <html lang="en" style={themeStyle(release.theme.tokens)}><body>{children}</body></html>;
}
