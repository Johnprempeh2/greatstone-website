import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base is '/puck-proof/' for the static build (deployed under that path),
// '/' in dev so the local server serves at root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/puck-proof/' : '/',
  plugins: [react()],
  server: { port: 5180, host: true },
}));
