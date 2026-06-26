// Pure helpers for the "ask your admin" affordance (non-admin members). No React/Supabase deps so they run
// under plain `node --test`. The member's company admin is the primary contact, else the first role=admin.

export function pickAdmin(members) {
  const list = Array.isArray(members) ? members : [];
  return list.find(m => m && m.is_primary) || list.find(m => m && m.role === 'admin') || null;
}

// Prefilled mailto to the company admin (named greeting), or the Greatstone team when the admin email is unknown.
export function askAdminMailto({ company, admin, fallbackEmail = 'dx@greatstonesoftware.co.uk' } = {}) {
  const co = (company || '').trim() || 'your';
  const subject = encodeURIComponent('Re: ' + co + ' account access');
  if (admin && admin.email) {
    const greet = admin.full_name ? ' ' + String(admin.full_name).trim().split(/\s+/)[0] : '';
    const body = encodeURIComponent('Hi' + greet + ',\n\nCould you help me with access to something on our Greatstone account (' + co + ')?\n\nThanks');
    return 'mailto:' + admin.email + '?subject=' + subject + '&body=' + body;
  }
  return 'mailto:' + fallbackEmail + '?subject=' + subject;
}
