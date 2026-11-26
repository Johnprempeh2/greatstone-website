'use client';

import { useEffect, useState } from 'react';
import AccountDashboard from '../../../src/store/AccountDashboard.jsx';
import { takeVerifiedQuery } from '../../../src/lib/auth-landing.mjs';
import { ShopTide } from '../../ShopTide.jsx';
import './account-v15.css';

export default function AccountPage() {
  const [verified, setVerified] = useState(false);
  // The email verification redirect lands here with ?verified=1 (see next-proof/legacy-hashes.mjs).
  useEffect(() => { if (takeVerifiedQuery(window.location, window.history)) setVerified(true); }, []);
  // st-v15 brings the landing's tokens and glass (two-doors-theme.css); acct-v15 scopes the account styles.
  return <div className="st-v15 acct-v15"><ShopTide /><AccountDashboard verified={verified} /></div>;
}
