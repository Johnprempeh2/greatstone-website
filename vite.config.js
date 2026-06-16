import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base is '/puck-proof/' for the static build (deployed under that path),
// '/' in dev so the local server serves at root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/puck-proof/' : '/',
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
          return undefined;
        },
      },
    },
  },
}));
