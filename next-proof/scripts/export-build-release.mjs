if (process.env.GSAM_SITE_ID) await import('./export-gsam-release.mjs');
else await import('./export-pages.mjs');
