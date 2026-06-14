// PROTOTYPE access gate. This is NOT real security: a client-side flag can be flipped in
// devtools and the demo password sits in the bundle. It exists only to model the correct
// admin-only experience. In the Laravel build, editing is a route behind auth + Spatie RBAC
// (only an admin / marketing-editor role loads the editor), and every page save/publish is
// authorised server-side. The public site there ships zero editor code at all.
const KEY = 'gs-studio-auth';
const DEMO_USER = 'admin@greatstone';   // prototype only
const DEMO_PASS = 'stone';              // prototype only; shared with the tester out-of-band, never the real password

export function isAuthed() {
  try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; }
}
export function signIn(user, pass) {
  const ok = (user || '').trim().toLowerCase() === DEMO_USER && pass === DEMO_PASS;
  if (ok) { try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ } }
  return ok;
}
export function signOut() { try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

// hash-based admin entry: #admin shows the sign-in; everything else is the public site
export function isAdminRoute() {
  return typeof location !== 'undefined' && /(^|#)\/?admin/i.test(location.hash);
}
export function goAdmin() { location.hash = 'admin'; }
export function leaveAdmin() {
  if (location.hash) { history.replaceState(null, '', location.pathname + location.search); }
}
