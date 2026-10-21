import { useEffect, useRef } from 'react';

// Cloudflare Turnstile, shared by the front door and the enquiry form. The script loads only when a site key
// is configured and only once a widget mounts; with no key the widget renders nothing.
const ime = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
export const TURNSTILE_KEY = ime.VITE_TURNSTILE_SITE_KEY || '';

let turnstileLoader = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!turnstileLoader) {
    turnstileLoader = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => resolve(window.turnstile);
      s.onerror = () => { turnstileLoader = null; reject(new Error('turnstile failed to load')); };
      document.head.appendChild(s);
    });
  }
  return turnstileLoader;
}

export function Turnstile({ onToken, className = 'b-fd-turnstile' }) {
  const host = useRef(null);
  useEffect(() => {
    if (!TURNSTILE_KEY) return undefined;
    let widget = null, dead = false;
    loadTurnstile().then((ts) => {
      if (dead || !host.current) return;
      widget = ts.render(host.current, {
        sitekey: TURNSTILE_KEY, theme: 'dark',
        callback: (t) => onToken(t), 'expired-callback': () => onToken(null), 'error-callback': () => onToken(null),
      });
    }).catch(() => onToken(null));
    return () => { dead = true; if (widget != null && window.turnstile) { try { window.turnstile.remove(widget); } catch (e) { /* gone */ } } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return TURNSTILE_KEY ? <div className={className} ref={host} /> : null;
}
