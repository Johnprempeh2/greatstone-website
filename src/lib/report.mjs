// Client error reporting. Console always; forwards to Sentry (if a Sentry global is present) or to a
// configured webhook (VITE_ERROR_WEBHOOK). No-ops gracefully otherwise — drop in a Sentry loader snippet
// or set VITE_ERROR_WEBHOOK to switch on remote capture without touching code. Reporting never throws.
const WEBHOOK = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ERROR_WEBHOOK) || '';

export function reportError(err, context = {}) {
  try {
    console.error('[gs]', context.where || 'error', err);
    const g = typeof window !== 'undefined' ? window : null;
    if (g && g.Sentry && typeof g.Sentry.captureException === 'function') { g.Sentry.captureException(err, { extra: context }); return; }
    if (WEBHOOK && typeof fetch === 'function') {
      fetch(WEBHOOK, {
        method: 'POST', headers: { 'content-type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ message: String((err && err.message) || err), stack: err && err.stack, context, url: g && g.location ? g.location.href : '', ts: new Date().toISOString() }),
      }).catch(() => {});
    }
  } catch { /* never let reporting throw */ }
}

let inited = false;
export function initErrorReporting() {
  if (inited || typeof window === 'undefined') return; inited = true;
  window.addEventListener('error', (e) => reportError(e.error || e.message, { where: 'window.error' }));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, { where: 'unhandledrejection' }));
}
