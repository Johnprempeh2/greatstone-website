// The services "inquiry list" — a lightweight, multi-select basket for SERVICE enquiries (no payment,
// no Supabase). A client can add several services and inquire about them all at once, or just one.
// Module singleton + useSyncExternalStore so the catalogue cards, the detail pages, the floating FAB and
// the drawer all share one source of truth without a provider. Mirrors store/cart.mjs, kept deliberately
// simpler: dedupe by slug, no quantity, no backend.
import { useSyncExternalStore } from 'react';
// NOTE: the Supabase client is imported DYNAMICALLY inside submitInquiry (below), not statically. The public
// service catalogue pulls this module via the InquiryToggle, so a static import would ship the whole Supabase
// client (~120 KB) to every visitor who lands on a services page. Deferring it keeps it out of first paint;
// it loads only when a visitor actually submits an inquiry.

const KEY = 'gs_service_inquiry_v1';
const subs = new Set();

function read() {
  try { const r = localStorage.getItem(KEY); const a = r ? JSON.parse(r) : []; return Array.isArray(a) ? a : []; }
  catch { return []; }
}
let items = read();

function commit(next) {
  items = next;
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* quota — still works in-memory */ }
  subs.forEach((f) => f());
}

export function getInquiry() { return items; }
function subscribe(f) { subs.add(f); return () => subs.delete(f); }
export function useInquiry() { return useSyncExternalStore(subscribe, getInquiry, getInquiry); }
export function inquiryCount() { return items.length; }
export function inInquiry(slug) { return items.some((x) => x.slug === slug); }

// it: { slug, name, category }
export function addInquiry(it) {
  if (!it || !it.slug || items.some((x) => x.slug === it.slug)) return;
  commit([...items, { slug: it.slug, name: it.name || it.slug, category: it.category || '' }]);
}
export function removeInquiry(slug) { commit(items.filter((x) => x.slug !== slug)); }
export function toggleInquiry(it) { if (inInquiry(it && it.slug)) removeInquiry(it.slug); else addInquiry(it); }
export function clearInquiry() { if (items.length) commit([]); }

// Drawer-open signal — lets an "Add to inquiry" or "Review inquiry" affordance anywhere open the drawer,
// which owns its own open state. Decoupled from the items store so opening never mutates the list.
const openSubs = new Set();
export function openInquiryDrawer() { openSubs.forEach((f) => f()); }
export function onOpenInquiryDrawer(f) { openSubs.add(f); return () => openSubs.delete(f); }

// Best-effort capture of an inquiry into the studio inbox (Supabase rpc submit_service_inquiry, migration
// 0023). Returns { ok, id?, error? }. A graceful no-op when the backend isn't configured or the migration
// isn't applied yet — the drawer keeps its prefilled-email flow regardless, so a submission never DEPENDS
// on this succeeding (the email is the guaranteed path; this just also logs it for the admin inbox).
export async function submitInquiry({ services = [], name, email, company, message } = {}) {
  if (!Array.isArray(services) || !services.length) return { ok: false };
  try {
    const { supabase } = await import('../lib/supabase.mjs');
    if (!supabase) return { ok: false };
    const { data, error } = await supabase.rpc('submit_service_inquiry', {
      p_services: services.map((s) => ({ slug: s.slug, name: s.name, category: s.category || '' })),
      p_name: name || null, p_email: email || null, p_company: company || null, p_message: message || null,
    });
    return error ? { ok: false, error } : { ok: true, id: data };
  } catch (error) { return { ok: false, error }; }
}
