import { useState } from 'react';
import { analyticsConfigured, getConsent, setConsent } from './lib/analytics.js';

// GDPR consent for analytics (Google Consent Mode v2). Only appears once a GTM container is configured
// (analyticsConfigured) AND the visitor hasn't chosen yet — so while analytics is dormant there are no
// non-essential cookies and no banner. Essential cookies (auth, basket) always run and aren't gated.
export default function ConsentBanner() {
  const [choice, setChoice] = useState(() => getConsent());
  if (!analyticsConfigured || choice) return null;
  const decide = (granted) => { setConsent(granted); setChoice(granted ? 'granted' : 'denied'); };
  return (
    <div className="gs-consent" role="region" aria-label="Cookie choices">
      <p className="gs-consent-text" id="gs-consent-text">We use cookies to see how the site is used and make it better. Essential cookies always run; analytics only with your say-so.</p>
      <div className="gs-consent-actions">
        <button className="gs-btn ghost sm" onClick={() => decide(false)} aria-label="Decline analytics cookies" aria-describedby="gs-consent-text">Decline</button>
        <button className="gs-btn primary sm" onClick={() => decide(true)} aria-describedby="gs-consent-text">Accept analytics</button>
      </div>
    </div>
  );
}
