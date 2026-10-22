import '../src/site.css';
import '../src/index.css';
import '../src/two-doors.css';
import '../src/store/store.css';
import './proof.css';
import { Window } from 'happy-dom';
import { theme } from './proof-data.js';
import { themeStyle } from './theme-style.mjs';

export default function RootLayout({ children }) {
  globalThis.DOMParser ??= new Window().DOMParser;
  return <html lang="en" style={themeStyle(theme.tokens)}><body>{children}</body></html>;
}
