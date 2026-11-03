'use client';

import { useEffect, useState } from 'react';
import AccountDashboard from '../../../src/store/AccountDashboard.jsx';
import { takeVerifiedQuery } from '../../../src/lib/auth-landing.mjs';

export default function AccountPage() {
  const [verified, setVerified] = useState(false);
  // The email verification redirect lands here with ?verified=1 (see next-proof/legacy-hashes.mjs).
  useEffect(() => { if (takeVerifiedQuery(window.location, window.history)) setVerified(true); }, []);
  return <AccountDashboard verified={verified} />;
}
