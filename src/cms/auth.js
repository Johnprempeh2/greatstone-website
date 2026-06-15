// PROTOTYPE auth + a PLACEHOLDER users "database". This is NOT real security: the records and
// the check live in the client bundle and a session flag can be edited in devtools. It exists
// to MODEL the real shape so the swap to the Laravel backend is a data-source change, not a
// rewrite. In production: users + hashed passwords live in the database, sign-in is a POST to
// Laravel auth, roles are Spatie RBAC, and every page save/publish is authorised server-side.
// The front end is already built around roles/capabilities so new user types drop straight in.

// roles → what each can do (the capability map the UI reads; mirrors the planned RBAC)
export const ROLES = {
  admin:  { label: 'Administrator', can: { edit: true,  publish: true,  manageUsers: true } },
  editor: { label: 'Editor',        can: { edit: true,  publish: true,  manageUsers: false } },
  viewer: { label: 'Reviewer',      can: { edit: false, publish: false, manageUsers: false } },
};

// placeholder records. Same shape a /users table would return (minus the password hash).
const USERS = [
  { email: 'admin@greatstone',  password: 'stone', name: 'Studio Admin',     role: 'admin' },
  { email: 'editor@greatstone', password: 'stone', name: 'Marketing Editor', role: 'editor' },
  { email: 'viewer@greatstone', password: 'stone', name: 'Reviewer',         role: 'viewer' },
];

const KEY = 'gs-studio-session';

export function signIn(email, password) {
  const u = USERS.find((x) => x.email.toLowerCase() === (email || '').trim().toLowerCase() && x.password === password);
  if (!u) return null;
  const session = { email: u.email, name: u.name, role: u.role };
  try { sessionStorage.setItem(KEY, JSON.stringify(session)); } catch (e) { /* ignore */ }
  return session;
}
export function signOut() { try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
export function currentUser() {
  try { const raw = sessionStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
export function isAuthed() { return !!currentUser(); }

// capability check the UI gates on (e.g. can(user, 'edit'))
export function can(user, action) {
  const r = user && ROLES[user.role];
  return !!(r && r.can[action]);
}

// hash-based admin entry: #admin shows sign-in; everything else is the public site
export function isAdminRoute() {
  return typeof location !== 'undefined' && /(^|#)\/?admin/i.test(location.hash);
}
