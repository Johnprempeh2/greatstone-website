'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createConsentAnalytics } from './consent-analytics.mjs';
import { captureAttribution } from '../src/lib/analytics.js';

const id = process.env.NEXT_PUBLIC_GTM_ID || '';
let analytics;

export default function ConsentAnalytics() {
  const [choice, setChoice] = useState(null);
  const [ready, setReady] = useState(false);
  const [reopened, setReopened] = useState(false);
  const firstButton = useRef(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!id) return;
    analytics ||= createConsentAnalytics({ window, id });
    const current = analytics.consent();
    captureAttribution();
    setChoice(current);
    setReady(true);
    if (current === 'granted') analytics.load();
    const open = () => setReopened(true);
    window.addEventListener('gs-consent-open', open);
    return () => window.removeEventListener('gs-consent-open', open);
  }, []);

  useEffect(() => {
    if (reopened) firstButton.current?.focus();
  }, [reopened]);

  useEffect(() => {
    if (analytics && pathname) analytics.track('page_view', { page_path: pathname, page_title: document.title.slice(0, 120) });
  }, [pathname, choice]);

  if (!id) return null;
  const decide = (granted) => {
    analytics.choose(granted);
    if (granted) captureAttribution();
    setChoice(granted ? 'granted' : 'denied');
    setReopened(false);
  };
  return <>{ready && (!choice || reopened) && <div className="gs-consent" role="region" aria-label="Cookie choices">
    <p className="gs-consent-text" id="gs-consent-text">We’d like to use analytics cookies to see which pages help and which don’t. They only run if you accept. We always use essential storage to remember your choices and keep the site working. <a href="/cookies">Cookie policy</a></p>
    <div className="gs-consent-actions">
      <button ref={firstButton} className="gs-consent-button" type="button" onClick={() => decide(false)} aria-label="Decline analytics cookies" aria-describedby="gs-consent-text">Decline</button>
      <button className="gs-consent-button primary" type="button" onClick={() => decide(true)} aria-describedby="gs-consent-text">Accept analytics</button>
    </div>
  </div>}</>;
}

export function CookieSettings() {
  if (!id) return null;
  return <button className="proof-cookie-settings" type="button" onClick={() => window.dispatchEvent(new Event('gs-consent-open'))}>Cookie settings</button>;
}
