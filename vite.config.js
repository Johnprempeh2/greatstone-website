import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { indexingAllowed, releaseIndexHtml } from './src/lib/index-html.mjs';

// The release build sets ALLOW_INDEXING=true to drop index.html's noindex, and VITE_SITE_ORIGIN (default
// greatstoneint.com) is stamped into its static canonical and link-preview tags (GRE-659). Not a VITE_ variable on
// purpose: it only shapes the HTML at build time and never reaches the browser bundle.
const indexable = indexingAllowed(process.env.ALLOW_INDEXING);
const releaseHtml = { name: 'gs-release-index-html', transformIndexHtml: (html) => releaseIndexHtml(html, { indexable, origin: process.env.VITE_SITE_ORIGIN }) };
// The SPA's _redirects (fallback to index.html) and _headers live in vite-static/, not public/, so they reach
// only dist/. In public/ they would also ship with the Next build, which the root netlify.toml deploys (GRE-3873).
const viteNetlifyFiles = {
  name: 'gs-vite-netlify-files',
  apply: 'build',
  generateBundle() {
    for (const fileName of ['_redirects', '_headers'])
      this.emitFile({ type: 'asset', fileName, source: readFileSync(new URL(`./vite-static/${fileName}`, import.meta.url), 'utf8') });
  },
};

// base '/' — the studio IS the site: deployed at the root of greatstone-home.netlify.app
// (previously served under the /puck-proof/ subpath of the old static homepage, now retired).
export default defineConfig(() => ({
  base: '/',
  plugins: [react(), releaseHtml, viteNetlifyFiles],
  server: { port: 5180, host: true },
  build: {
    rollupOptions: {
      output: {
        // Keep React in its OWN chunk so it is never co-located with the Puck editor. (When Puck was
        // the only manual chunk, React landed inside it, forcing every PUBLIC visitor to download the
        // ~433KB editor package just to get React.) With React isolated, the public entry pulls only
        // react + app code; Puck (admin editor) and three.js (decorative 3D) are reachable solely via
        // lazy imports, so they load on demand — Puck when the editor opens, three when the Stage mounts.
        manualChunks(id) {
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (id.includes('node_modules/@measured/puck')) return 'puck';
          if (id.includes('node_modules/three/')) return 'three';
          // The admin studio is deferred purely by the React.lazy boundaries in App.jsx (the 33 cms/* panels).
          // We deliberately do NOT force them into a named manualChunk: a named group also pulls in the panels'
          // shared transitive deps (puck.config, store.js, MediaField, LinkField, ...) which the PUBLIC entry
          // imports statically, which would make that named chunk an EAGER dependency of the entry and defeat
          // the split. Letting Rollup auto-split each lazy import keeps shared modules in the entry (where the
          // public page needs them) and the panel code in on-demand chunks.
          return undefined;
        },
      },
    },
  },
}));
