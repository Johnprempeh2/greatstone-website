// Maps a Supabase staff role → what they can do in the CMS. Pure (no Supabase import) so App can
// read it without pulling the Supabase client into the eager bundle. The console/editor now sign in
// with the SAME Supabase staff account that controls the Catalogue; this is the one capability map.
// Mirrors the page workflow: editors propose, owners/admins publish; sales/viewer are read-only.
export const STAFF_CAPS = {
  owner:  { edit: true,  publish: true,  manageUsers: true },
  admin:  { edit: true,  publish: true,  manageUsers: true },
  editor: { edit: true,  publish: false, manageUsers: false },
  sales:  { edit: false, publish: false, manageUsers: false },
  viewer: { edit: false, publish: false, manageUsers: false },
};

export const ROLE_LABEL = { owner: 'Owner', admin: 'Administrator', editor: 'Editor', sales: 'Sales', viewer: 'Reviewer' };

// user here is the resolved staff object { email, name, role } (or null when signed out)
export function staffCan(user, action) {
  const caps = user && STAFF_CAPS[user.role];
  return !!(caps && caps[action]);
}

// Can this role actually use the CMS console/editor? owner/admin/editor only (sales/viewer are
// read-only roles that today have no console surface). Used to gate access AND to message the rest.
export const isCmsRole = (role) => !!(STAFF_CAPS[role] && STAFF_CAPS[role].edit);

// A human explanation for an account that authenticated but can't use the CMS — a read-only role, no
// role assigned, or a role we don't recognise. Lets the sign-in screen explain the state instead of
// looking like a rejected password.
export function roleNotice(role) {
  if (!role) return 'You’re signed in, but this account has no Greatstone role assigned yet. Ask an owner or admin to set one.';
  if (STAFF_CAPS[role]) return `You’re signed in as ${ROLE_LABEL[role] || role}, which doesn’t include website editing. Ask an admin if you need it.`;
  return `You’re signed in, but your role (“${role}”) isn’t recognised. Ask an admin to review it.`;
}
