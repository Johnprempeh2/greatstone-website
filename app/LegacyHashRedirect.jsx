'use client';

import { useEffect } from 'react';
import { legacyHashDestination } from '../next-proof/legacy-hashes.mjs';

export default function LegacyHashRedirect({ pagePaths }) {
  useEffect(() => {
    const route = () => {
      const destination = legacyHashDestination(window.location.hash, window.location.pathname, pagePaths,
        (id) => Boolean(document.getElementById(id)));
      if (destination) window.location.replace(destination);
    };
    route();
    window.addEventListener('hashchange', route);
    return () => window.removeEventListener('hashchange', route);
  }, [pagePaths]);
  return null;
}
