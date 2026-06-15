import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base is '/puck-proof/' for the static build (deployed under that path),
// '/' in dev so the local server serves at root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/puck-proof/' : '/',
  plugins: [react()],
  server: { port: 5180, host: true },
  build: {
    // split the two heavyweights (three.js + its postprocessing addons, and the Puck editor) into
    // their own chunks so they cache independently and don't bloat one giant entry parse
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          puck: ['@measured/puck'],
        },
      },
    },
  },
}));
