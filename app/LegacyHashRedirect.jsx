'use client';

import { useEffect } from 'react';
import { keepLandingQuery, legacyHashDestination } from '../next-proof/legacy-hashes.mjs';

export default function LegacyHashRedirect({ pagePaths }) {
  useEffect(() => {
    const route = () => {
      const destination = legacyHashDestination(window.location.hash, window.location.pathname, pagePaths,
        (id) => Boolean(document.getElementById(id)));
      if (destination) window.location.replace(keepLandingQuery(destination, window.location.search));
    };
    route();
    window.addEventListener('hashchange', route);
    return () => window.removeEventListener('hashchange', route);
  }, [pagePaths]);
  return null;
}
