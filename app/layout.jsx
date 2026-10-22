import '../src/site.css';
import '../src/two-doors.css';
import './proof.css';
import { theme } from './proof-data.js';
import { themeStyle } from './theme-style.mjs';

export default function RootLayout({ children }) {
  return <html lang="en" style={themeStyle(theme.tokens)}><body>{children}</body></html>;
}
