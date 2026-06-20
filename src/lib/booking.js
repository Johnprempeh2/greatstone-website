// Greatstone's live booking link (John's Calendly, 30-min Deep Dive) + the on-brand popup that opens it.
//
// Every "Book a Deep Dive" CTA calls openBooking(): it lazy-loads Calendly's widget once (only on the
// first click, so zero upfront weight) and opens a themed popup OVER the Greatstone site — dark canvas,
// lime accent — instead of bouncing to the default white calendly.com page. If the widget can't load
// (offline / blocked), it falls back to opening BOOKING_URL in a new tab. One constant to update the link.
export const BOOKING_URL = 'https://calendly.com/john-greatstoneinternational299/30min';

// Calendly embed theming (hex without #): dark canvas + lime primary to match the Greatstone brand.
// hide_gdpr_banner keeps the booking surface clean (the site carries its own consent). Deeper branding
// (logo, removing "powered by Calendly") is a Calendly-account/plan setting, not controllable from here.
const THEME = 'hide_gdpr_banner=1&background_color=141414&text_color=f5f5f5&primary_color=c8ff00';
const themedUrl = () => BOOKING_URL + (BOOKING_URL.includes('?') ? '&' : '?') + THEME;

let loader = null;
function loadCalendly() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.Calendly) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-calendly]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = 'https://assets.calendly.com/assets/external/widget.css';
      css.setAttribute('data-calendly', '1'); document.head.appendChild(css);
    }
    const s = document.createElement('script');
    s.src = 'https://assets.calendly.com/assets/external/widget.js'; s.async = true;
    s.onload = () => resolve(); s.onerror = () => reject(new Error('calendly failed to load'));
    document.head.appendChild(s);
  });
  return loader;
}

const fallback = () => { try { window.open(BOOKING_URL, '_blank', 'noopener,noreferrer'); } catch (e) { /* ignore */ } };

// Open the on-brand booking popup. Resolves the lazy load, then opens the themed Calendly widget;
// any failure (load error, API absent) degrades to a new-tab link so booking always works.
export function openBooking() {
  loadCalendly()
    .then(() => { if (window.Calendly && window.Calendly.initPopupWidget) window.Calendly.initPopupWidget({ url: themedUrl() }); else fallback(); })
    .catch(fallback);
}
