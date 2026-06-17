import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initErrorReporting } from './lib/report.mjs';
import './site.css';   // the REAL shared Greatstone stylesheet (tokens, type, primitives, footer) — same file the live site ships
import './index.css';  // studio-only additions: the 3D stage layers + JS-driven reveal
import './studio.css'; // studio chrome: header, edit toolbar, command palette, panels

initErrorReporting(); // capture uncaught errors + promise rejections (forwards to Sentry/webhook if configured)

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
