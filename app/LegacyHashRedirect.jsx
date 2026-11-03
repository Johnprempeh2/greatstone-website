'use client';

import { useEffect } from 'react';
import { isBookingHash, keepLandingQuery, legacyHashDestination } from '../next-proof/legacy-hashes.mjs';
import { openBooking } from '../src/lib/booking.js';

export default function LegacyHashRedirect({ pagePaths }) {
  useEffect(() => {
    const route = () => {
      if (isBookingHash(window.location.hash) && !document.getElementById('book')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        openBooking();
        return;
      }
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
