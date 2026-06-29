import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base '/' — the studio IS the site: deployed at the root of greatstone-home.netlify.app
// (previously served under the /puck-proof/ subpath of the old static homepage, now retired).
export default defineConfig(() => ({
  base: '/',
  plugins: [react()],
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
          if (id.includes('node_modules/@supabase/')) return 'supabase';
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
