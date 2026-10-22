const CONSENT_KEY = 'gs-consent';
const GTM_URL = 'https://www.googletagmanager.com/gtm.js?id=';
const OPTIONAL_LOCAL_KEYS = ['gs-attr-first', 'gs-attr-last', 'gs_service_pop_v1', 'gs-intel-profile'];
const OPTIONAL_SESSION_KEYS = ['gs_service_pop_seen_v1'];

export function createConsentAnalytics({ window, id }) {
  const { document, localStorage, sessionStorage } = window;
  let loaded = false;
  const consent = () => { try { return localStorage.getItem(CONSENT_KEY); } catch { return null; } };
  const dataLayer = () => (window.dataLayer ||= []);
  const command = (...args) => dataLayer().push(args);

  function load() {
    if (!id || loaded || consent() !== 'granted') return;
    loaded = true;
    command('consent', 'default', {
      ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
      analytics_storage: 'granted',
    });
    dataLayer().push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const script = document.createElement('script');
    script.async = true;
    script.src = GTM_URL + encodeURIComponent(id);
    document.head.appendChild(script);
  }

  function choose(granted) {
    try { localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied'); } catch { /* private mode */ }
    if (granted) load();
    else {
      try { OPTIONAL_LOCAL_KEYS.forEach((key) => localStorage.removeItem(key)); } catch { /* storage blocked */ }
      try { OPTIONAL_SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key)); } catch { /* storage blocked */ }
      if (loaded) command('consent', 'update', { analytics_storage: 'denied' });
    }
  }

  function track(event, params = {}) {
    if (consent() === 'granted') dataLayer().push({ event, ...params });
  }
  return { consent, load, choose, track };
}
