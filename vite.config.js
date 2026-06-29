import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base '/' — the studio IS the site: deployed at the root of greatstone-home.netlify.app
// (previously served under the /puck-proof/ subpath of the old static homepage, now retired).
// The admin-only studio panels (lazy-loaded from App.jsx). Grouped into ONE 'studio' chunk that loads on
// demand when an admin signs in. Listed EXPLICITLY (not a blanket src/cms/ match) so shared cms helpers that
// PUBLIC code imports (MediaField, LinkField, CatalogContext, staffRoles) are NOT dragged into the studio
// chunk, which would make it an eager dependency of the public entry and defeat the split.
const STUDIO_PANELS = [
  'SeoPanel', 'VersionHistory', 'ActivityPanel', 'OverviewPanel', 'ReleaseBoard', 'TeamPanel', 'PagesPanel',
  'NavigationPanel', 'LinkAuditPanel', 'ContentSearchPanel', 'RedirectsPanel', 'SavedSectionsPanel',
  'CopyCoachPanel', 'A11yPanel', 'OutlinePanel', 'CtaConsistencyPanel', 'ServicesManagerPanel', 'SeoHealthPanel',
  'NavCoveragePanel', 'MediaUsagePanel', 'ContentInventoryPanel', 'BlockUsagePanel', 'SiteHealthPanel',
  'GettingStartedPanel', 'StartersPanel', 'SchedulePanel', 'NotesPanel', 'BackgroundPanel', 'StudioPanel',
  'AdminConsole', 'SiteSettingsPanel', 'MediaLibraryPanel',
];

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
          // The admin studio panels (lazy-loaded from App.jsx) land in ONE chunk that arrives on demand when
          // an admin signs in, never on a public visitor's first paint. INERT without the React.lazy
          // boundaries in App.jsx (manualChunks alone does not defer a static import); the two stay in lockstep.
          if (STUDIO_PANELS.some((n) => id.includes('/src/cms/' + n + '.jsx'))) return 'studio';
          return undefined;
        },
      },
    },
  },
}));
