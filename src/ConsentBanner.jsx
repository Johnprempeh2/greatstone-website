import { useState, useEffect, useRef } from 'react';
import { analyticsConfigured, getConsent, setConsent, CONSENT_OPEN_EVENT } from './lib/analytics.js';

// GDPR consent for analytics (Google Consent Mode v2, advanced). Only appears once a GTM container is
// configured (analyticsConfigured) AND the visitor hasn't chosen yet, or chose and then pressed "Cookie
// settings" in the footer to change it (GRE-659). While analytics is dormant there are no analytics
// cookies and no banner. The policy link is an in-app #go/ link (App's click handler).
// Wording: GRE-656 legal doc, approved by John and reviewed by Mikey.
export default function ConsentBanner() {
  const [choice, setChoice] = useState(() => getConsent());
  const [reopened, setReopened] = useState(false);
  const firstButton = useRef(null);
  useEffect(() => {
    const open = () => setReopened(true);
    window.addEventListener(CONSENT_OPEN_EVENT, open);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open);
  }, []);
  // reopened from the footer: move focus into the banner so a keyboard user lands on the choice
  useEffect(() => { if (reopened && firstButton.current) firstButton.current.focus(); }, [reopened]);
  if (!analyticsConfigured || (choice && !reopened)) return null;
  const decide = (granted) => { setConsent(granted); setChoice(granted ? 'granted' : 'denied'); setReopened(false); };
  return (
    <div className="gs-consent" role="region" aria-label="Cookie choices">
      <p className="gs-consent-text" id="gs-consent-text">We’d like to use analytics cookies to see which pages help and which don’t. They only run if you accept. We always use essential storage to remember your choices and keep the site working. <a href="#go/cookies">Cookie policy</a></p>
      <div className="gs-consent-actions">
        <button ref={firstButton} className="gs-btn ghost sm" onClick={() => decide(false)} aria-label="Decline analytics cookies" aria-describedby="gs-consent-text">Decline</button>
        <button className="gs-btn primary sm" onClick={() => decide(true)} aria-describedby="gs-consent-text">Accept analytics</button>
      </div>
    </div>
  );
}
