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
