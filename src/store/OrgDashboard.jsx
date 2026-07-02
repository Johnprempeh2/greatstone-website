// Organization dashboard (#org) — the company-level hub, separate from the personal #account page but
// bidirectionally linked. Surfaces: identity + the company-admin banner, an at-a-glance overview, the DX
// ENGAGEMENT timeline (the digital-experience journey — staff-curated meeting recaps / milestones /
// deliverables, each inline OR an external link), the member directory, the company profile, and a
// company commerce rollup. Reads are RLS-scoped to the buyer's own company (customer_self, 0008/0013).
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { fmtMoney } from '../lib/pricing.mjs';
import { getCustomerProfile, isCustomer, isCompanyAdmin, signOut, getSession, onAuth } from './customerAuth.mjs';
import { AuthGate } from './AccountDashboard.jsx';
import MaturityRadar from './MaturityRadar.jsx';
import { sanitizeHtml } from '../lib/sanitize-html.mjs';
import { BRIEFINGS, TOPIC_LABEL, TOPIC_HUE } from '../data/ai-intel.mjs';
import { PILLARS } from '../data/maturity-seed.mjs';
import { useMaturity } from './useMaturity.mjs';
import { sinceLastVisit, firstNameOf } from './welcome-back.mjs';
import { pickAdmin, askAdminMailto } from './ask-admin.mjs';
import { toIcs } from './to-ics.mjs';
import { moveGap } from './next-move-gap.mjs';
import { monthlySpend } from './monthly-spend.mjs';
import { attendeeOverflow, filterAnnouncement } from './timeline-a11y.mjs';
import { firstRunState } from './org-firstrun.mjs';
import './store.css';
import './admin.css';

const ORG_ID = '11111111-1111-4111-8111-111111111111'; // single live org (matches ensure_customer_account)
const initialsOf = (s) => (String(s || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('') || '?').toUpperCase();
// the viewer's LOCAL calendar date (occurred_on is a local DATE) — a UTC date flips past/upcoming at the day boundary
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
// toLocaleDateString returns the literal "Invalid Date" (it does not throw) on a bad value, so guard with getTime().
const fmtDate = (s) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); };
const periodOf = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? 'Earlier' : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); };
// whole months between two local DATE strings (for the "N months in" engagement marker)
const monthsBetween = (aISO, bISO) => { try { const a = new Date(aISO + 'T00:00:00'), b = new Date(bISO + 'T00:00:00'); return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())); } catch { return 0; } };
const KIND_LABEL = { recap: 'Meeting recap', milestone: 'Milestone', deliverable: 'Deliverable', kickoff: 'Kickoff', review: 'Review', note: 'Note' };
const KIND_PLURAL = { recap: 'Recaps', milestone: 'Milestones', deliverable: 'Deliverables', kickoff: 'Kickoffs', review: 'Reviews', note: 'Notes' };
const ANCHOR_KINDS = new Set(['milestone', 'kickoff', 'review']); // filled markers — the journey anchors
const ORD_CAP = 8; // company-orders preview shows the most recent N; an honest "showing N of M" appears past it
// #org is organised into tabs (consistent with #account): identity header + role banner + KPI tiles + onboarding
// stay persistent above the tablist; each tab groups related bands so no tab is overloaded.
const ORG_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'maturity', label: 'Maturity' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'team', label: 'Team & access' },
  { id: 'company', label: 'Company' },
];
// the DX engagement journey (matches the 0013 `phase` free-text convention). Drives the Phase Navigator.
const PHASES = ['Discovery', 'Build', 'Adoption', 'Review'];
const PHASE_BLURB = { Discovery: 'Mapping the work and the drains.', Build: 'Wiring the systems that buy hours back.', Adoption: 'Embedding it in how you work.', Review: 'Measuring the return, planning the next climb.' };
// the innovation-hub lens: which AI Intelligence topics matter at each phase of the journey
const PHASE_TOPICS = {
  Discovery: ['frontier-models', 'enterprise', 'multimodal'],
  Build: ['coding', 'agents', 'infrastructure'],
  Adoption: ['enterprise', 'open-source', 'hardware'],
  Review: ['ai-security', 'regulation', 'funding'],
};

// The recap HTML sanitiser now lives in ../lib/sanitize-html.mjs (shared with the staff preview pane + unit-tested).
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'link'; } };
// honour prefers-reduced-motion on every programmatic scroll (WCAG 2.3.3): jump instantly, don't animate.
const prefersReducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const scrollToEl = (el, block = 'center') => el && el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block });

export default function OrgDashboard() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    getSession().then(s => setSession(s || null));
    const { data } = onAuth(s => setSession(s || null));
    return () => data?.subscription?.unsubscribe?.();
  }, []);
  useEffect(() => { if (session) getCustomerProfile().then(setProfile); else setProfile(null); }, [session]);

  if (session === undefined) return <div className="ca-wrap"><div className="ca-center">Checking…</div></div>;
  if (!session) return <AuthGate />;
  if (profile && !isCustomer(profile)) return (
    <div className="ca-wrap"><div className="ca-center">
      <h2>This is a staff account</h2>
      <p>{session.user?.email} manages the catalogue. The organisation dashboard is for customer companies.</p>
      <button className="gs-btn ghost" onClick={() => signOut()}>Sign out</button>
    </div></div>
  );
  if (!profile) return <div className="ca-wrap"><div className="ca-center">Loading your organisation…</div></div>;
  return <Org profile={profile} session={session} onProfile={setProfile} />;
}

function Org({ profile, session, onProfile }) {
  const company = profile.customer;
  const admin = isCompanyAdmin(profile);
  const firstName = firstNameOf(profile.full_name);
  // record this visit + read the gap since the last one (front-end only, runs once on mount)
  const [lastVisit] = useState(() => sinceLastVisit('gs:lastvisit:org'));
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  // ── tabs ──────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState('overview');
  // switch tab, then on the next frame scroll the deep-link target into view + focus it (the panel must un-hide first)
  const goToTab = (tabId, anchorId) => {
    setTab(tabId);
    if (!anchorId) return;
    setTimeout(() => { const el = document.getElementById(anchorId); if (!el) return; scrollToEl(el, 'center'); try { el.focus({ preventScroll: true }); } catch { /* ignore */ } }, 120);
  };
  const onTabKey = (e, i) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const last = ORG_TABS.length - 1;
    const n = e.key === 'ArrowRight' ? (i === last ? 0 : i + 1) : e.key === 'ArrowLeft' ? (i === 0 ? last : i - 1) : e.key === 'Home' ? 0 : last;
    setTab(ORG_TABS[n].id);
    const el = document.getElementById('org-tab-' + ORG_TABS[n].id); if (el) el.focus();
  };

  // ── data ──────────────────────────────────────────────────────────────────
  const [members, setMembers] = useState(null);
  const [engagements, setEngagements] = useState(null);
  const [orders, setOrders] = useState(null);
  const [quotes, setQuotes] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    setErr(null);
    supabase.from('customer_users').select('id, email, full_name, is_primary, role, created_at')
      .is('deleted_at', null).eq('customer_id', company.id)
      .order('is_primary', { ascending: false }).order('created_at', { ascending: true })
      .then(({ data, error }) => { if (error) setErr(error); setMembers(data || []); });
    // RLS (customer_self, 0013) already scopes to this company's shared, live items; the explicit
    // filters are belt-and-braces so a future RLS regression fails closed (empty) instead of leaking.
    supabase.from('engagements')
      .select('id, kind, status, title, summary, body_html, external_url, occurred_on, phase, owner_name, attendees, tags, pinned, created_at')
      .is('deleted_at', null).eq('customer_id', company.id).eq('status', 'shared').order('occurred_on', { ascending: false })
      .then(({ data, error }) => { if (error) setErr(error); setEngagements(data || []); });
    supabase.from('orders').select('id, reference, status, currency, total_minor, placed_at, created_at, customer_user_id, invoice_number')
      .is('deleted_at', null).eq('customer_id', company.id).order('created_at', { ascending: false }).limit(50)
      .then(({ data, error }) => { if (error) setErr(error); setOrders(data || []); });
    supabase.from('quotes').select('id, status').is('deleted_at', null).eq('customer_id', company.id).limit(200)
      .then(({ data, error }) => { if (error) setErr(error); setQuotes(data || []); });
  }, [company.id]);
  useEffect(() => { load(); }, [load]);
  // an external #org/e/<id> timeline permalink must reveal the Engagement tab so the item isn't in a hidden panel
  useEffect(() => {
    const applyTabHash = () => { if (/#\/?org\/e\//i.test(location.hash || '')) setTab('engagement'); };
    applyTabHash();
    addEventListener('hashchange', applyTabHash);
    return () => removeEventListener('hashchange', applyTabHash);
  }, []);

  const memberName = useMemo(() => {
    const m = {}; (members || []).forEach(u => { m[u.id] = u.full_name || u.email; }); return m;
  }, [members]);
  const primaryContact = (members || []).find(m => m.is_primary) || (members || []).find(m => m.role === 'admin');
  // "in transformation since …" marker — from the earliest past engagement + the current phase
  const sinceMarker = useMemo(() => {
    if (!engagements || !engagements.length) return null;
    const t = todayISO();
    const past = engagements.filter(e => e.occurred_on <= t);
    if (!past.length) return null;
    const start = past.reduce((a, b) => (a.occurred_on < b.occurred_on ? a : b)).occurred_on;
    const latestPhased = past.find(e => e.phase && PHASES.includes(e.phase)); // past is newest-first
    return { since: periodOf(start), months: monthsBetween(start, t), phase: latestPhased ? latestPhased.phase : null };
  }, [engagements]);
  const liveOrders = (orders || []).filter(o => o.status !== 'cancelled' && o.status !== 'refunded');
  // sum only orders in the display currency — summing minor units across currencies is meaningless and
  // would mislabel a mixed total under one symbol. Single-currency (the prototype) is unaffected.
  const investedCurr = (liveOrders[0]?.currency) || ((orders || [])[0]?.currency) || 'GBP';
  const totalSpent = liveOrders.filter(o => (o.currency || investedCurr) === investedCurr).reduce((s, o) => s + (o.total_minor || 0), 0);
  const openQuotes = (quotes || []).filter(q => !['won', 'lost', 'cancelled'].includes(q.status)).length;

  return (
    <div className="ca-wrap org-print-root" role="region" aria-label="Your organisation">
      {/* role=region (not a 2nd <main>; the shell's #gs-main owns the single unlabelled main) gives SR users a named dashboard landmark. The store is hash-routed, so a bare href would change the route; intercept and just move focus to the content */}
      <a className="gs-skip" href="#org-main" onClick={(e) => { e.preventDefault(); const m = document.getElementById('org-main'); if (m) { m.focus(); m.scrollIntoView({ block: 'start' }); } }}>Skip to your organisation</a>
      <header className="acct-id" id="org-main" tabIndex={-1}>
        <div className="acct-avatar" aria-hidden="true">{initialsOf(company.name)}</div>
        <div className="acct-id-text">
          <span className="st-kicker">Your organisation</span>
          {(firstName || lastVisit) && <p className="acct-welcome">Welcome back{firstName ? ', ' + firstName : ''}{lastVisit ? ' · ' + lastVisit : ''}</p>}
          <h1 className="acct-id-name">{company.name}</h1>
          <div className="acct-id-sub">
            {company.domain ? company.domain + ' · ' : ''}
            {members ? `${members.length} ${members.length === 1 ? 'member' : 'members'}` : '…'}
            {company.tier?.name && <span className="acct-tier">{company.tier.name}</span>}
          </div>
          {sinceMarker && (
            <div className="acct-id-marker">In transformation since {sinceMarker.since}{sinceMarker.months > 0 ? ` · ${sinceMarker.months} month${sinceMarker.months === 1 ? '' : 's'} in` : ''}{sinceMarker.phase ? ` · ${sinceMarker.phase} phase` : ''}</div>
          )}
        </div>
        <div className="acct-id-actions">
          <button className="gs-btn ghost sm" onClick={() => window.print()}>Download a summary</button>
          <a className="gs-btn ghost sm" href="#account">← Your account</a>
          <a className="gs-btn ghost sm" href="#shop">Continue shopping</a>
          <button className="gs-btn ghost sm" onClick={() => signOut()}>Sign out</button>
        </div>
      </header>

      {/* role banner — make the company admin evident */}
      <div className={'org-banner' + (admin ? ' is-admin' : '')}>
        <span className="org-banner-icon" aria-hidden="true">{admin ? '★' : '◆'}</span>
        {admin
          ? <span>You're the <b>company admin</b> for {company.name}. You can manage the company profile and you're the primary point of contact for your Greatstone engagement.</span>
          : <span>You're a <b>member</b> of {company.name}.{primaryContact ? <> Your company admin is <b>{primaryContact.full_name || primaryContact.email}</b>.</> : ''}<span className="org-role-caps">You can follow the engagement timeline, view orders and licence keys, place orders and manage your own profile. Company settings and team access are handled by your admin.</span></span>}
      </div>

      {/* at-a-glance — always visible; each tile jumps to the tab that drills into it */}
      <div className="org-stats">
        <Stat label="Members" value={members ? members.length : '…'} onClick={() => goToTab('team', 'org-mem-h')} go="Team & access" />
        <Stat label="Open quotes" value={quotes ? openQuotes : '…'} onClick={() => goToTab('company', 'org-co-h')} go="Company" />
        <Stat label="Orders" value={orders ? liveOrders.length : '…'} onClick={() => goToTab('company', 'org-co-h')} go="Company" />
        <Stat label="Invested" value={orders ? fmtMoney(totalSpent, investedCurr) : '…'} onClick={() => goToTab('company', 'org-co-h')} go="Company" />
      </div>

      {err && <div className="ca-err" role="alert" style={{ marginBottom: 16 }}>Some data couldn't load. <button className="ca-link" onClick={load}>Try again</button></div>}

      <OnboardingChecklist company={company} admin={admin} members={members} engagements={engagements} orders={orders} nav={goToTab} />

      {/* tabs — consistent with #account; identity/role/KPIs/onboarding above stay on every tab */}
      <div className="ca-tabs acct-tabs org-tabs" role="tablist" aria-label="Your organisation">
        {ORG_TABS.map((t, i) => (
          <button key={t.id} id={'org-tab-' + t.id} role="tab" type="button"
            aria-selected={tab === t.id} aria-controls={'org-panel-' + t.id}
            tabIndex={tab === t.id ? 0 : -1} className={tab === t.id ? 'on' : ''}
            onClick={() => setTab(t.id)} onKeyDown={(e) => onTabKey(e, i)}>{t.label}</button>
        ))}
      </div>

      <div role="tabpanel" id="org-panel-overview" aria-labelledby="org-tab-overview" hidden={tab !== 'overview'}>
        <ReturnStrip engagements={engagements} />
        <OrgAnalytics orders={orders} engagements={engagements} />
      </div>

      <div role="tabpanel" id="org-panel-maturity" aria-labelledby="org-tab-maturity" hidden={tab !== 'maturity'}>
        <MaturityRadar company={company} />
        <NextMove company={company} />
      </div>

      <div role="tabpanel" id="org-panel-engagement" aria-labelledby="org-tab-engagement" hidden={tab !== 'engagement'}>
        <EngagementTimeline engagements={engagements} orders={orders} companyId={company.id} companyName={company.name} memberName={memberName} />
        <InnovationBand currentPhase={sinceMarker?.phase} />
        <GreatstoneTeam engagements={engagements} />
      </div>

      <div role="tabpanel" id="org-panel-team" aria-labelledby="org-tab-team" hidden={tab !== 'team'}>
        <Members members={members} meId={profile.id} admin={admin} customerId={company.id} requestedBy={profile.id} companyName={company.name} flash={flash} />
      </div>

      <div role="tabpanel" id="org-panel-company" aria-labelledby="org-tab-company" hidden={tab !== 'company'}>
        <CompanyProfile company={company} admin={admin} onProfile={onProfile} flash={flash} />
        <RecentOrders orders={orders} memberName={memberName} />
      </div>

      {/* persistent polite live region so a screen reader hears every flash; the visible toast is decorative */}
      <div className="gs-sr-only" role="status" aria-live="polite">{toast || ''}</div>
      {toast && <div className="ca-toast"><span className="ca-toast-msg">{toast}</span><button type="button" className="ca-toast-x" aria-label="Dismiss" onClick={() => setToast(null)}>×</button></div>}
    </div>
  );
}

function Stat({ label, value, onClick, go }) {
  if (onClick) return (
    <button type="button" className="org-stat is-link" onClick={onClick} aria-label={label + ' ' + value + (go ? '. Go to ' + go : '')}>
      <div className="org-stat-v">{value}</div><div className="org-stat-l">{label}</div>
    </button>
  );
  return <div className="org-stat"><div className="org-stat-v">{value}</div><div className="org-stat-l">{label}</div></div>;
}

// First-run setup checklist — shown until the company is set up (or dismissed). Steps derive from data
// already loaded, so it self-completes; admins get the action buttons, members see progress.
function OnboardingChecklist({ company, admin, members, engagements, orders, nav }) {
  const key = 'gs-org-onboard:' + company.id;
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(key) === '1'; } catch { return false; } });
  if (members === null || engagements === null || orders === null) return null; // wait for data
  const steps = [
    { id: 'profile', label: 'Complete your company profile', hint: admin ? 'Add your website and a note about your goals.' : 'Your company admin will add this.', done: !!(company.domain && company.notes), cta: admin ? { label: 'Edit profile', onClick: () => nav('company', 'org-co-h') } : null },
    { id: 'team', label: 'Invite your team', hint: admin ? 'Bring your colleagues into the portal.' : 'Your company admin manages who has access.', done: members.length > 1, cta: admin ? { label: 'Invite a teammate', onClick: () => nav('team', 'org-mem-h') } : null },
    { id: 'kickoff', label: 'Book your kickoff', hint: 'Start your engagement with a kickoff call.', done: engagements.some(e => e.kind === 'kickoff'), cta: { label: 'Book a Diagnostic', href: '#go/contact' } },
    { id: 'order', label: 'Place your first order', hint: 'Explore the Greatstone software catalogue.', done: (orders || []).length > 0, cta: { label: 'Browse the store', href: '#shop' } },
  ];
  const doneCount = steps.filter(s => s.done).length;
  if (dismissed || doneCount === steps.length) return null; // fully set up or dismissed → hide
  const dismiss = () => { try { localStorage.setItem(key, '1'); } catch { /* ignore */ } setDismissed(true); };
  const pct = Math.round((doneCount / steps.length) * 100);
  return (
    <section className="org-onboard" aria-labelledby="org-ob-h">
      <div className="org-onboard-head">
        <div><span className="st-kicker">Get started</span><h2 id="org-ob-h">Set up your organisation</h2></div>
        <button type="button" className="org-onboard-x" onClick={dismiss} aria-label="Dismiss setup checklist">×</button>
      </div>
      <div className="org-onboard-prog"><div className="org-onboard-bar" style={{ width: pct + '%' }} role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={steps.length} aria-valuetext={`${doneCount} of ${steps.length} steps complete`} aria-label="Setup progress" /></div>
      <p className="org-onboard-count">{doneCount} of {steps.length} complete</p>
      <ul className="org-onboard-list">
        {steps.map(s => (
          <li key={s.id} className={'org-onboard-step' + (s.done ? ' done' : '')}>
            <span className="org-onboard-check" aria-hidden="true">{s.done ? '✓' : ''}</span>
            <span className="gs-sr-only">{s.done ? 'Completed: ' : 'Not started: '}</span>
            <span className="org-onboard-label"><b>{s.label}</b><span>{s.done ? 'Done' : s.hint}</span></span>
            {!s.done && s.cta && (s.cta.href
              ? <a className="gs-btn ghost sm" href={s.cta.href}>{s.cta.label}</a>
              : <button type="button" className="gs-btn ghost sm" onClick={s.cta.onClick}>{s.cta.label}</button>)}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Return on transformation — pairs the "Invested" figure with the value the engagement has delivered,
// from data already loaded (milestones reached, deliverables shipped, journey progress). The honest
// front-end read; quantified outcomes (hours saved, payback) are the later gated upgrade (cycle 15).
function ReturnStrip({ engagements }) {
  // reserve the band's height while the engagement read is in flight, so the page doesn't reflow when it lands
  if (engagements === null) return <section className="org-return" aria-hidden="true"><div className="st-skel" style={{ minHeight: 0, height: 118, borderRadius: 16 }} /></section>;
  const today = todayISO();
  const past = engagements.filter(e => e.occurred_on <= today);
  if (!past.length) return null;
  const milestones = past.filter(e => e.kind === 'milestone').length;
  const deliverables = past.filter(e => e.kind === 'deliverable').length;
  const latestPhased = past.find(e => e.phase && PHASES.includes(e.phase)); // past is newest-first
  const curIdx = latestPhased ? PHASES.indexOf(latestPhased.phase) : -1;
  // nothing tangible yet (no milestones/deliverables and not past the first phase) → stay quiet
  if (!milestones && !deliverables && curIdx < 1) return null;
  return (
    <section className="org-return" aria-labelledby="org-ret-h">
      <div className="org-return-head">
        <span className="st-kicker">Return on transformation</span>
        <h2 id="org-ret-h">What your engagement has delivered</h2>
      </div>
      <div className="org-return-grid">
        <div className="org-stat"><div className="org-stat-v">{milestones}</div><div className="org-stat-l">Milestones reached</div></div>
        <div className="org-stat"><div className="org-stat-v">{deliverables}</div><div className="org-stat-l">Deliverables shipped</div></div>
        <div className="org-stat"><div className="org-stat-v">{curIdx >= 0 ? `${curIdx + 1}/${PHASES.length}` : '—'}</div><div className="org-stat-l">{curIdx >= 0 ? 'Phases · ' + PHASES[curIdx] : 'Journey'}</div></div>
      </div>
    </section>
  );
}

// Lightweight relationship analytics — last touchpoint, total touchpoints, a monthly spend sparkline.
// All from data already loaded; hidden for a brand-new company with no history.
function OrgAnalytics({ orders, engagements }) {
  // reserve the pulse height while the reads are in flight (prevents the page jumping as it lands)
  if (orders === null || engagements === null) return <section className="org-analytics" aria-hidden="true"><div className="st-skel" style={{ minHeight: 0, height: 124, borderRadius: 14 }} /></section>;
  const today = todayISO();
  const pastEng = engagements.filter(e => e.occurred_on <= today);
  // soonest scheduled FUTURE engagement — the "next touchpoint" reassurance (date-guarded)
  const upcoming = engagements.filter(e => e.occurred_on > today).sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  const nextEng = upcoming[0] || null;
  let nextIn = null;
  if (nextEng) {
    const d = new Date(nextEng.occurred_on + 'T00:00:00');
    if (!Number.isNaN(d.getTime())) nextIn = Math.max(0, Math.round((d.getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000));
  }
  const live = orders.filter(o => o.status !== 'cancelled' && o.status !== 'refunded');
  if (!live.length && !pastEng.length && !nextEng) return null;

  let lastTouch = null;
  if (pastEng.length) {
    const latest = pastEng.reduce((a, b) => (a.occurred_on > b.occurred_on ? a : b));
    // local-calendar diff (occurred_on is a local DATE; matches todayISO so "Today" reports correctly)
    lastTouch = Math.max(0, Math.round((new Date(today + 'T00:00:00').getTime() - new Date(latest.occurred_on + 'T00:00:00').getTime()) / 86400000));
  }
  // client-side .ics so a client can save the next touchpoint to any calendar (no backend; Blob object URL; tested toIcs)
  const addToCalendar = (eng) => {
    const ics = toIcs({
      title: 'Greatstone · ' + (KIND_LABEL[eng.kind] || 'Session') + (eng.title ? ' · ' + eng.title : ''),
      date: eng.occurred_on,
      description: eng.summary || 'Your next Greatstone touchpoint.',
      uid: 'greatstone-eng-' + eng.id,
      stamp: String(eng.occurred_on || '').replace(/-/g, '') + 'T000000Z',
    });
    if (!ics) return;
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'greatstone-next-touchpoint.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  // monthly spend buckets for the sparkline (tested module; only renders as a "trend" when >= 2 months exist)
  const { months, byMonth, max, total: spendTotal, curr } = monthlySpend(orders);

  return (
    <section className="org-analytics" aria-labelledby="org-an-h">
      <h2 id="org-an-h" className="ci-sub" style={{ fontSize: '1rem' }}>Relationship pulse</h2>
      <div className="org-an-grid">
        {lastTouch !== null && <div className="org-an-tile"><div className="org-stat-v">{lastTouch === 0 ? 'Today' : lastTouch + 'd'}</div><div className="org-stat-l">Last touchpoint</div></div>}
        <div className="org-an-tile"><div className="org-stat-v">{pastEng.length}</div><div className="org-stat-l">Touchpoints</div></div>
        {nextEng ? (
          <div className="org-an-tile org-an-next">
            <div className="org-stat-v">{nextIn === 0 ? 'Today' : nextIn === 1 ? 'Tomorrow' : 'in ' + nextIn + 'd'}</div>
            <div className="org-stat-l">Next touchpoint</div>
            <div className="org-an-next-detail">{KIND_LABEL[nextEng.kind] || 'Session'}{nextEng.title ? ' · ' + nextEng.title : ''} · {fmtDate(nextEng.occurred_on)}</div>
            <button type="button" className="org-an-cal" onClick={() => addToCalendar(nextEng)} aria-label={'Add the next touchpoint on ' + fmtDate(nextEng.occurred_on) + ' to your calendar'}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              Add to calendar
            </button>
          </div>
        ) : (
          <div className="org-an-tile org-an-next is-empty">
            <div className="org-stat-l">Next touchpoint</div>
            <p className="org-an-next-empty">Nothing booked yet. <a className="ca-link" href="#go/contact">Let's plan your next session →</a></p>
          </div>
        )}
        {months.length > 1 && (
          <div className="org-an-tile org-an-spark">
            <div className="org-stat-v">{fmtMoney(spendTotal, curr)}</div>
            <div className="org-an-bars" role="img" aria-label={'Spend by month, last ' + months.length + ' months: ' + months.map(m => m + ' ' + fmtMoney(byMonth[m], curr)).join(', ') + '.'}>
              {months.map(m => <span key={m} className="org-an-bar" style={{ height: Math.max(10, Math.round(byMonth[m] / max * 100)) + '%' }} title={m + ': ' + fmtMoney(byMonth[m], curr)} />)}
            </div>
            <div className="org-stat-l">Spend · last {months.length} months</div>
            {/* visible trend endpoints so sighted users get the figures without hovering each bar */}
            <div className="org-an-spark-fig">{months[0]} {fmtMoney(byMonth[months[0]], curr)} → {months[months.length - 1]} {fmtMoney(byMonth[months[months.length - 1]], curr)}</div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── DX engagement timeline ────────────────────────────────────────────────────
function EngagementTimeline({ engagements, orders, companyId, companyName, memberName }) {
  const [filter, setFilter] = useState('all');
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const seenKey = 'gs-dx-seen:' + companyId;
  // baseline last-visit: first ever visit establishes "now" (so nothing floods as new); thereafter compare.
  const [lastSeen] = useState(() => { try { return localStorage.getItem(seenKey); } catch { return null; } });
  // mark "seen" only when LEAVING the view, so the "new" treatment survives the whole visit
  useEffect(() => () => { try { localStorage.setItem(seenKey, new Date().toISOString()); } catch { /* ignore */ } }, [seenKey]);
  // deep link: #org/e/<id> opens + scrolls to that engagement (shareable per-item permalink).
  // hashchange-driven so it works in an already-mounted view; an appliedRef stops it re-clobbering the
  // user's filter/search when data reloads under the same hash. Works for upcoming items too (their
  // What's-next card carries the same dx-item-<id>); falls back to the section top if the id isn't found.
  const appliedRef = useRef(null);
  useEffect(() => {
    if (!engagements) return;
    let timer;
    const apply = () => {
      const m = (typeof location !== 'undefined' ? location.hash : '').match(/#\/?org\/e\/([\w-]+)/i);
      if (!m) { appliedRef.current = null; return; }
      const id = m[1];
      if (appliedRef.current === id) return; // already consumed this hash → don't wipe filters on reload
      appliedRef.current = id;
      setOpenId(id); setFilter('all'); setPhaseFilter('all'); setTagFilter('all'); setQ('');
      clearTimeout(timer);
      timer = setTimeout(() => {
        const el = document.getElementById('dx-item-' + id);
        scrollToEl(el || document.getElementById('dx-h'), el ? 'center' : 'start');
      }, 120);
    };
    apply();
    addEventListener('hashchange', apply);
    return () => { removeEventListener('hashchange', apply); clearTimeout(timer); };
  }, [engagements]);

  if (engagements === null) return (
    <section className="dx-section" aria-busy="true">
      <div className="dx-head"><span className="st-kicker">Digital experience</span><h2>Your DX engagement</h2></div>
      <div className="st-skel" style={{ height: 120, borderRadius: 14 }} />
    </section>
  );

  const today = todayISO();
  const isNew = (e) => lastSeen && e.created_at && e.created_at > lastSeen;
  const newCount = engagements.filter(isNew).length;
  const upcoming = engagements.filter(e => e.occurred_on > today).sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  let past = engagements.filter(e => e.occurred_on <= today);
  const pinned = past.filter(e => e.pinned);
  const kindsPresent = [...new Set(past.map(e => e.kind))];
  // distinct engagement tags across the timeline, most-used first — drives the tag-facet pills
  const tagCounts = {};
  for (const e of past) for (const tg of (e.tags || [])) { const k = String(tg).trim(); if (k) tagCounts[k] = (tagCounts[k] || 0) + 1; }
  const tagsPresent = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a] || a.localeCompare(b));
  // phase journey: count per canonical phase, and the CURRENT phase = the phase of the most recent past
  // engagement that carries one (past is newest-first from the query). Drives the Phase Navigator stepper.
  const phaseCounts = {};
  for (const e of past) if (e.phase && PHASES.includes(e.phase)) phaseCounts[e.phase] = (phaseCounts[e.phase] || 0) + 1;
  const phasesPresent = PHASES.some(p => phaseCounts[p]);
  const latestPhased = past.find(e => e.phase && PHASES.includes(e.phase));
  const currentPhaseIdx = latestPhased ? PHASES.indexOf(latestPhased.phase) : -1;

  const scrollToNewest = () => {
    const n = past.find((e) => isNew(e));
    setFilter('all'); setPhaseFilter('all'); setTagFilter('all'); setQ('');
    if (n) { setOpenId(n.id); setTimeout(() => scrollToEl(document.getElementById('dx-item-' + n.id), 'center'), 60); }
    else scrollToEl(document.getElementById('dx-h'), 'start');
  };
  const matchQ = (e) => {
    if (!q.trim()) return true;
    const hay = [e.title, e.summary, e.phase, e.owner_name, (e.tags || []).join(' '), (e.attendees || []).join(' ')].join(' ').toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  };
  const visible = past.filter(e => (filter === 'all' || e.kind === filter) && (phaseFilter === 'all' || e.phase === phaseFilter) && (tagFilter === 'all' || (e.tags || []).includes(tagFilter)) && matchQ(e));
  // announce the filtered result to screen readers, so the count change isn't silent (empty string when unfiltered)
  const filtering = filter !== 'all' || phaseFilter !== 'all' || tagFilter !== 'all' || q.trim() !== '';
  const filterMsg = filterAnnouncement({ filtering, visible: visible.length, total: past.length });
  const firstRun = firstRunState({ engagements, orders }); // context-aware first-run empty-state messaging

  // group by period (newest first)
  const groups = [];
  for (const e of visible) {
    const p = periodOf(e.occurred_on);
    const g = groups.find(x => x.period === p);
    if (g) g.items.push(e); else groups.push({ period: p, items: [e] });
  }

  return (
    <section className="dx-section" aria-labelledby="dx-h">
      <div className="dx-head">
        <div>
          <span className="st-kicker">Digital experience</span>
          <h2 id="dx-h">Your DX engagement</h2>
          <p className="dx-sub">Your journey with Greatstone. Recaps, milestones and deliverables, newest first.</p>
        </div>
        {newCount > 0 && (
          <button type="button" className="dx-newcount" onClick={scrollToNewest}
            aria-label={`${newCount} ${newCount === 1 ? 'item' : 'items'} added since your last visit. Jump to the newest`}>
            {newCount} new
          </button>
        )}
      </div>

      {engagements.length === 0 ? (
        <div className="dx-empty">
          <div className="dx-empty-mark" aria-hidden="true">◇</div>
          <h3>Your engagement timeline starts here</h3>
          <p>{firstRun.hasOrdersNoEngagements
            ? <>Your purchases are in <a className="ca-link" href="#account">your account</a>. After your kickoff, every meeting recap, milestone and deliverable from your Greatstone engagement will appear here.</>
            : <>After your kickoff, every meeting recap, milestone and deliverable from your Greatstone engagement will appear here, a living record of your digital-experience journey.</>}</p>
          <div className="dx-empty-kinds" aria-hidden="true">
            <span className="dx-kind k-recap">Recaps</span>
            <span className="dx-kind k-milestone">Milestones</span>
            <span className="dx-kind k-deliverable">Deliverables</span>
          </div>
          <a className="gs-btn primary sm" href="#go/contact">Book your kickoff diagnostic →</a>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="dx-next" aria-label="What's next">
              <h3 className="dx-next-h">What's next</h3>
              <div className="dx-next-row">
                {upcoming.slice(0, 3).map(e => (
                  <div key={e.id} id={'dx-item-' + e.id} className="dx-next-card">
                    <span className={'dx-kind k-' + e.kind}>{KIND_LABEL[e.kind]}</span>
                    <div className="dx-next-title">{e.title}</div>
                    <div className="dx-next-date">{fmtDate(e.occurred_on)}{e.owner_name ? ' · ' + e.owner_name : ''}</div>
                    {e.summary && <p className="dx-next-sum">{e.summary}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {pinned.length > 0 && (
            <div className="dx-pins">
              <h3 className="dx-pins-h">Highlights</h3>
              <div className="dx-pins-row">
                {pinned.map(e => (
                  <button key={e.id} className="dx-pin" onClick={() => { setFilter('all'); setPhaseFilter('all'); setTagFilter('all'); setQ(''); setOpenId(e.id); setTimeout(() => scrollToEl(document.getElementById('dx-item-' + e.id), 'center'), 60); }}>
                    <span className={'dx-kind k-' + e.kind}>{KIND_LABEL[e.kind]}</span>
                    <span className="dx-pin-title">{e.title}</span>
                    <span className="dx-pin-date">{fmtDate(e.occurred_on)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {past.length === 0 ? (
            <p className="ca-note" role="status" style={{ padding: '20px 4px' }}>Your timeline fills in after your first session. See “What's next” above.</p>
          ) : (
            <>
              {phasesPresent && (
                <nav className="dx-phasenav" aria-label="Your engagement phases">
                  <ol className="dx-phaselist">
                    {PHASES.map((ph, i) => {
                      const count = phaseCounts[ph] || 0;
                      const state = currentPhaseIdx < 0 ? 'upcoming' : i < currentPhaseIdx ? 'done' : i === currentPhaseIdx ? 'current' : 'upcoming';
                      const active = phaseFilter === ph;
                      return (
                        <li key={ph} className={'dx-jstep is-' + state + (active ? ' is-active' : '')}>
                          <button type="button" className="dx-jstep-btn" aria-pressed={active} aria-current={state === 'current' ? 'step' : undefined} disabled={count === 0}
                            onClick={() => setPhaseFilter(active ? 'all' : ph)}
                            aria-label={`${ph} phase. ${PHASE_BLURB[ph]} ${count} item${count === 1 ? '' : 's'}. ${state === 'current' ? 'Current phase.' : state === 'done' ? 'Completed.' : 'Not started.'}${count ? (active ? ' Showing this phase only; activate to clear.' : ' Activate to filter the timeline to this phase.') : ''}`}>
                            <span className="dx-jstep-node" aria-hidden="true">{state === 'done' ? '✓' : i + 1}</span>
                            <span className="dx-jstep-name">{ph}</span>
                            <span className="dx-jstep-count">{count ? count + (count === 1 ? ' item' : ' items') : '—'}</span>
                            {state === 'current' && <span className="dx-jstep-here">You are here</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  {(() => {
                    // the journey as a value story: a one-line "what this phase delivers" caption for the
                    // focused phase — the filtered phase if one is active, else the phase you're currently in.
                    const cap = phaseFilter !== 'all' ? phaseFilter : (currentPhaseIdx >= 0 ? PHASES[currentPhaseIdx] : null);
                    if (!cap || !PHASE_BLURB[cap]) return null;
                    const filtered = phaseFilter !== 'all';
                    return (
                      <p className="dx-phase-delivers" role="status">
                        <span className="dx-phase-delivers-ph">{filtered ? <>Showing <b>{cap}</b></> : <>You are in <b>{cap}</b></>}</span>: {PHASE_BLURB[cap]}
                        {filtered && <> <button type="button" className="ca-link" onClick={() => setPhaseFilter('all')}>Show all phases</button></>}
                      </p>
                    );
                  })()}
                </nav>
              )}

              <div className="dx-controls">
                <div className="dx-chips" role="group" aria-label="Filter by type">
                  <button className={'dx-chip' + (filter === 'all' ? ' on' : '')} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
                  {kindsPresent.map(k => (
                    <button key={k} className={'dx-chip' + (filter === k ? ' on' : '')} aria-pressed={filter === k} onClick={() => setFilter(k)}>{KIND_PLURAL[k]}</button>
                  ))}
                </div>
                <input className="dx-search" type="search" placeholder="Search the timeline…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search engagements" />
              </div>

              {tagsPresent.length > 0 && (
                <div className="dx-tagrow" role="group" aria-label="Filter by tag">
                  <button type="button" className={'dx-tag' + (tagFilter === 'all' ? ' on' : '')} aria-pressed={tagFilter === 'all'} onClick={() => setTagFilter('all')}>All tags</button>
                  {tagsPresent.map(tg => (
                    <button type="button" key={tg} className={'dx-tag' + (tagFilter === tg ? ' on' : '')} aria-pressed={tagFilter === tg}
                      onClick={() => setTagFilter(tagFilter === tg ? 'all' : tg)}
                      aria-label={`${tg}, ${tagCounts[tg]} item${tagCounts[tg] === 1 ? '' : 's'}.${tagFilter === tg ? ' Showing this tag only; activate to clear.' : ' Activate to filter the timeline to this tag.'}`}>
                      {tg} <span className="dx-tag-n" aria-hidden="true">{tagCounts[tg]}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* polite live region: announces the narrowed count (the zero case is owned by the empty-state below) */}
              <div className="gs-sr-only" role="status" aria-live="polite">{visible.length > 0 ? filterMsg : ''}</div>

              {visible.length === 0 ? (
                <p className="ca-note" role="status" style={{ padding: '20px 4px' }}>No items match. <button className="ca-link" onClick={() => { setFilter('all'); setPhaseFilter('all'); setTagFilter('all'); setQ(''); }}>Clear filters</button></p>
              ) : (
                <div className="dx-timeline">
                  {groups.map(g => (
                    <div key={g.period} className="dx-group">
                      <h3 className="dx-period">{g.period}</h3>
                      <ol className="dx-list">
                        {g.items.map(e => (
                          <Item key={e.id} e={e} companyName={companyName} isNew={isNew(e)} open={openId === e.id} onToggle={() => setOpenId(openId === e.id ? null : e.id)} />
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

function Item({ e, companyName, isNew, open, onToggle }) {
  const anchor = ANCHOR_KINDS.has(e.kind);
  const url = location.origin + location.pathname + '#org/e/' + e.id;
  // "Discuss this" — prefilled mailto to the Greatstone team, so a client can pick up a thread in context
  const discussHref = 'mailto:dx@greatstonesoftware.co.uk'
    + '?subject=' + encodeURIComponent(`Re: ${e.title}${companyName ? ` (${companyName})` : ''}`)
    + '&body=' + encodeURIComponent(`Hi Greatstone team,\n\nI'd like to discuss this from our engagement timeline:\n• ${e.title} (${fmtDate(e.occurred_on)})\n\nThanks`);
  const [copyMsg, setCopyMsg] = useState('');
  const linkRef = useRef(null);
  const cleanBody = useMemo(() => (open && e.body_html ? sanitizeHtml(e.body_html) : ''), [open, e.body_html]);
  const copied = copyMsg === 'Link copied to clipboard';
  const needsManual = copyMsg === 'Press Cmd or Ctrl + C to copy';
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyMsg('Link copied to clipboard'); // only declare success once the write actually resolved
    } catch { // navigator.clipboard is undefined on non-secure origins, or writeText was denied
      if (linkRef.current) { linkRef.current.focus(); linkRef.current.select(); }
      setCopyMsg('Press Cmd or Ctrl + C to copy');
    }
    setTimeout(() => setCopyMsg(''), 2400);
  };
  return (
    <li className={'dx-item' + (anchor ? ' is-anchor' : '') + (isNew ? ' is-new' : '')} id={'dx-item-' + e.id}>
      <span className="dx-marker" aria-hidden="true" />
      <article className="dx-card">
        <div className="dx-card-head">
          <span className={'dx-kind k-' + e.kind}>{KIND_LABEL[e.kind]}</span>
          {e.phase && <span className="dx-phase">{e.phase}</span>}
          {isNew && <span className="dx-new" aria-label="Added since your last visit">New</span>}
        </div>
        <h4 className="dx-title">{e.title}</h4>
        <div className="dx-meta">
          <span className="dx-date">{fmtDate(e.occurred_on)}</span>
          {e.owner_name && <span className="dx-owner">· {e.owner_name}</span>}
          {(e.attendees || []).length > 0 && (() => {
            const { shown, hiddenCount, hiddenNames } = attendeeOverflow(e.attendees, 5);
            return (
              <span className="dx-attendees" aria-label={'Attendees: ' + e.attendees.join(', ')}>
                {shown.map((a, i) => <span key={i} className="dx-av" title={a}>{initialsOf(a)}</span>)}
                {hiddenCount > 0 && <span className="dx-av dx-av-more" aria-hidden="true" title={hiddenNames.join(', ')}>+{hiddenCount}</span>}
              </span>
            );
          })()}
        </div>
        {e.summary && <p className="dx-summary">{e.summary}</p>}
        <div className="dx-actions">
          {e.body_html && (
            <button className="gs-btn ghost sm" aria-expanded={open} aria-controls={'dx-body-' + e.id} onClick={onToggle}>
              {open ? 'Hide recap' : 'Read recap'}
            </button>
          )}
          {e.external_url && (
            <a className="gs-btn ghost sm dx-ext" href={e.external_url} target="_blank" rel="noopener noreferrer"
               aria-label={(e.kind === 'deliverable' ? 'Open deliverable' : 'Open') + ' (opens in a new tab)'}>
              {e.kind === 'deliverable' ? 'Open deliverable' : 'Open'} ↗ <span className="dx-host">{hostOf(e.external_url)}</span>
            </a>
          )}
          <button type="button" className="dx-copy" onClick={copyLink} aria-label={copied ? 'Link copied to clipboard' : 'Copy a link to “' + e.title + '”'}>{copied ? 'Copied ✓' : 'Copy link'}</button>
          <a className="dx-copy dx-discuss" href={discussHref} aria-label={'Email the Greatstone team about “' + e.title + '”'}>Email the team →</a>
          <input type="text" className={'dx-copy-src' + (needsManual ? ' is-shown' : '')} ref={linkRef} value={url} readOnly tabIndex={-1} aria-hidden={!needsManual} aria-label={'Link to “' + e.title + '”'} onFocus={(ev) => ev.target.select()} />
          <span className="gs-sr-only" role="status" aria-live="polite">{copyMsg}</span>
        </div>
        {open && e.body_html && (
          <div className="dx-body" id={'dx-body-' + e.id} dangerouslySetInnerHTML={{ __html: cleanBody }} />
        )}
      </article>
    </li>
  );
}

// ── rules-based "your next move" — the weakest maturity pillar becomes a concrete recommendation ────────
function NextMove({ company }) {
  const { status, data } = useMaturity(company); // shares the radar's data source (Supabase → seed → empty)
  if (status !== 'ready' || !data || !data.scores) return null;
  let lowest = null;
  for (const p of PILLARS) { const v = Number(data.scores[p.key]) || 0; if (v > 0 && (!lowest || v < lowest.v)) lowest = { ...p, v }; }
  if (!lowest) return null;
  // honest, data-only gap the move closes: headroom to the engagement's target tier, else standing vs industry
  const gap = moveGap(lowest.v, { target: data.target && data.target[lowest.key], benchmark: data.benchmark && data.benchmark[lowest.key] });
  return (
    <section className="org-move" aria-labelledby="org-move-h">
      <div className="org-move-icon" aria-hidden="true">↗</div>
      <div className="org-move-body">
        <span className="st-kicker">Your next move</span>
        <h2 id="org-move-h">Strengthen {lowest.name}</h2>
        {gap && (
          <p className={'org-move-gap' + (gap.kind === 'benchmark' && gap.delta < 0 ? ' is-behind' : '')}>
            <span aria-hidden="true">{gap.kind === 'target' || gap.delta >= 0 ? '↑' : '↓'}</span>{' '}
            {gap.kind === 'target'
              ? <><b>+{gap.delta}</b> to reach your target <span className="org-move-gap-nums">({gap.value} → {gap.ref})</span><span className="gs-sr-only">. {lowest.name} is {gap.delta} below your target tier.</span></>
              : <><b>{gap.delta >= 0 ? '+' : ''}{gap.delta}</b> {gap.delta >= 0 ? 'ahead of' : 'behind'} your industry <span className="org-move-gap-nums">({gap.value} vs {gap.ref})</span><span className="gs-sr-only">. {lowest.name} scores {gap.value} against an industry benchmark of {gap.ref}.</span></>}
          </p>
        )}
        <p>{lowest.name} is your lowest pillar right now, at {lowest.v}/10. {lowest.tag} A focused diagnostic is the fastest way to move it, and lifts the score the whole assessment hangs on.</p>
        <div className="org-move-ctas">
          <a className="gs-btn primary sm" href="#go/contact">Book a Diagnostic</a>
          <a className="gs-btn ghost sm" href="#go/method">See the eight pillars →</a>
        </div>
      </div>
    </section>
  );
}

// ── innovation hub v1: "in your field" AI Intelligence, filtered to the client's current phase ──────────
// Reuses the Intelligence hub's briefing data (src/data/ai-intel.mjs) so #org becomes a window onto what's
// moving in AI for where the client is right now, each card linking to its full #intel/<id> article.
function InnovationBand({ currentPhase }) {
  const wanted = PHASE_TOPICS[currentPhase] || ['frontier-models', 'enterprise', 'ai-security'];
  const briefs = useMemo(() => {
    const set = new Set(wanted);
    const matched = (BRIEFINGS || []).filter(b => (b.topics || []).some(t => set.has(t)));
    const pool = matched.length ? matched : (BRIEFINGS || []);
    return [...pool].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 3);
  }, [currentPhase]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!briefs.length) return null;
  const topTopic = (b) => (b.topics || []).find(t => wanted.includes(t)) || (b.topics || [])[0];
  return (
    <section className="org-intel" aria-labelledby="org-intel-h">
      <div className="org-intel-head">
        <div>
          <span className="st-kicker">In your field</span>
          <h2 id="org-intel-h">Intelligence for {currentPhase ? 'your ' + currentPhase.toLowerCase() + ' phase' : 'your transformation'}</h2>
          <p className="org-intel-sub">AI moves worth knowing while you're here, from the Greatstone Intelligence desk.</p>
        </div>
        <a className="gs-btn ghost sm" href="#intel">Open the full Intelligence hub →</a>
      </div>
      <div className="org-intel-grid">
        {briefs.map(b => {
          const t = topTopic(b);
          return (
            <a key={b.id} className="org-intel-card" href={'#intel/' + b.id}>
              <div className="org-intel-meta">
                {t && <span className="org-intel-topic" style={{ '--h': TOPIC_HUE[t] }}>{TOPIC_LABEL[t]}</span>}
                <span className="org-intel-date">{fmtDate(b.date)}</span>
              </div>
              <h3 className="org-intel-title">{b.headline}</h3>
              <span className="org-intel-vendor">{b.vendor}</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

// ── your Greatstone team ───────────────────────────────────────────────────────
// The Greatstone leads on this engagement, derived from the distinct owner_name values across the
// company's shared engagements (most-recently-active first). Zero new data; humanises the relationship.
function GreatstoneTeam({ engagements }) {
  if (engagements === null) return null;
  const seen = [];
  for (const e of engagements) { const n = (e.owner_name || '').trim(); if (n && !seen.includes(n)) seen.push(n); }
  if (!seen.length) return null;
  return (
    <section className="org-sec" aria-labelledby="org-team-h">
      <div className="acct-ordhead"><h2 id="org-team-h">Your Greatstone team</h2></div>
      <p className="ca-note" style={{ marginTop: -4 }}>The people leading your transformation.</p>
      <div className="org-team-row">
        {seen.map(n => (
          <div key={n} className="org-team-card">
            <div className="org-team-av" aria-hidden="true">{initialsOf(n)}</div>
            <div className="org-team-info"><span className="org-team-name">{n}</span><span className="org-team-role">Greatstone lead</span></div>
          </div>
        ))}
        <a className="gs-btn ghost sm org-team-cta" href="#go/contact">Book a Diagnostic</a>
      </div>
    </section>
  );
}

// ── members directory + invite requests ───────────────────────────────────────
function Members({ members, meId, admin, customerId, requestedBy, companyName, flash }) {
  const [requests, setRequests] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const loadReqs = useCallback(() => {
    supabase.from('member_invite_requests').select('id, full_name, email, role, status, created_at')
      .eq('customer_id', customerId).order('created_at', { ascending: false })
      .then(({ data, error }) => { if (!error) setRequests(data || []); }); // keep prior on a transient read error
  }, [customerId]);
  useEffect(() => { loadReqs(); }, [loadReqs]);
  const pending = requests.filter(r => r.status === 'pending');
  const taken = useMemo(() => {
    const s = new Set();
    (members || []).forEach(m => m.email && s.add(m.email.toLowerCase()));
    pending.forEach(r => r.email && s.add(r.email.toLowerCase()));
    return s;
  }, [members, requests]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="org-sec" aria-labelledby="org-mem-h">
      <div className="acct-ordhead">
        <h2 id="org-mem-h" tabIndex={-1}>Members &amp; access{pending.length > 0 && <>{' '}<span className="org-pendcount">{pending.length} pending</span></>}</h2>
        {admin && <button className="gs-btn ghost sm" aria-expanded={showForm} onClick={() => setShowForm(s => !s)}>{showForm ? 'Close' : '+ Invite a teammate'}</button>}
      </div>
      {showForm && <InviteForm customerId={customerId} requestedBy={requestedBy} taken={taken} onDone={(m) => { setShowForm(false); flash(m); loadReqs(); }} />}
      <div className="ca-table-wrap">
        <table className="ca-table ca-cards">
          <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Joined</th></tr></thead>
          <tbody>
            {members === null ? <tr><td colSpan="4" className="ca-muted" data-label=""><span role="status">Loading members…</span></td></tr>
              : members.length === 0 ? <tr><td colSpan="4" className="ca-muted" data-label=""><span role="status">No members yet.</span></td></tr>
                : members.map(m => (
                  <tr key={m.id}>
                    <td data-label="Name" className="ca-name">{m.full_name || '—'}{m.id === meId && <span className="org-you">You</span>}</td>
                    <td data-label="Email">{m.email}</td>
                    <td data-label="Role">{(m.is_primary || m.role === 'admin') ? <span className="org-rolechip is-admin">Company admin</span> : <span className="org-rolechip">Member</span>}</td>
                    <td data-label="Joined">{fmtDate(m.created_at)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {pending.length > 0 && (
        <div className="org-pending">
          <h3 className="dx-pins-h">Pending invitations ({pending.length})</h3>
          {pending.map(r => (
            <div key={r.id} className="org-pendrow">
              <span className="ca-name">{r.full_name || r.email}</span>
              <span className="ca-muted">{r.email} · {r.role === 'admin' ? 'Company admin' : 'Member'}</span>
              <span className="org-pendstatus">Requested {fmtDate(r.created_at)} · we'll provision soon</span>
            </div>
          ))}
        </div>
      )}
      {admin
        ? <p className="ca-note">Invite a teammate above and our team will set up their access and be in touch. To remove a member or change the company admin, <a className="ca-link" href="#go/contact">contact your Greatstone team</a>.</p>
        : (() => { const a = pickAdmin(members); return (
            <p className="acct-askadmin">Need a teammate added or your access changed? {a
              ? <>Ask your company admin <a className="ca-link" href={askAdminMailto({ company: companyName, admin: a })}>{firstNameOf(a.full_name) || a.email} &rarr;</a></>
              : <>Your <a className="ca-link" href="#go/contact">Greatstone team</a> can help.</>}</p>
          ); })()}
    </section>
  );
}

function InviteForm({ customerId, requestedBy, taken, onDone }) {
  const [name, setName] = useState(''); const [email, setEmail] = useState('');
  const [role, setRole] = useState('member'); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const emailRef = useRef(null);
  const fail = (msg) => { setErr(msg); emailRef.current?.focus(); };
  const submit = async (e) => {
    e.preventDefault(); setErr(null);
    const em = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { fail('Enter a valid email address.'); return; }
    if (taken?.has(em.toLowerCase())) { fail('That person is already a member or already has a pending invitation.'); return; }
    setBusy(true);
    const { error } = await supabase.from('member_invite_requests').insert({
      org_id: ORG_ID, customer_id: customerId, requested_by: requestedBy,
      full_name: name.trim() || null, email: em, role, note: note.trim() || null,
    });
    setBusy(false);
    if (error) { fail(error.code === '23505' ? 'A request for this email is already pending.' : (error.message || 'Could not send the request.')); return; }
    onDone("Invitation requested. Our team will set up access and be in touch.");
  };
  return (
    <form className="pr-form org-inviteform" onSubmit={submit}>
      <div className="pr-row">
        <label>Their name<input value={name} onChange={e => setName(e.target.value)} autoComplete="off" placeholder="Optional" /></label>
        <label htmlFor="invite-email">Their email<input id="invite-email" ref={emailRef} type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" required aria-invalid={err ? 'true' : undefined} aria-describedby={err ? 'invite-email-err' : undefined} /></label>
      </div>
      <div className="pr-row">
        <label>Role<select value={role} onChange={e => setRole(e.target.value)}><option value="member">Member</option><option value="admin">Company admin</option></select></label>
        <label>Note <span style={{ fontWeight: 400 }}>(optional)</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="Anything we should know" /></label>
      </div>
      {err && <div id="invite-email-err" className="ca-err" role="alert">{err}</div>}
      <button className="gs-btn primary" type="submit" disabled={busy}>{busy ? 'Requesting…' : 'Request access'}</button>
    </form>
  );
}

// ── company profile (admin-editable; members read-only) ────────────────────────
function CompanyProfile({ company, admin, onProfile, flash }) {
  const [name, setName] = useState(company.name || '');
  const [domain, setDomain] = useState(company.domain || '');
  const [notes, setNotes] = useState(company.notes || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(company.name || ''); setDomain(company.domain || ''); setNotes(company.notes || ''); }, [company]);
  const dirty = name !== (company.name || '') || domain !== (company.domain || '') || notes !== (company.notes || '');

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from('customers').update({ name: name.trim(), domain: domain.trim() || null, notes: notes.trim() || null }).eq('id', company.id);
    setBusy(false);
    if (error) { flash('Could not save company profile.'); return; }
    flash('Company profile saved.');
    getCustomerProfile().then(onProfile);
  };

  return (
    <section className="org-sec" aria-labelledby="org-co-h">
      <div className="acct-ordhead"><h2 id="org-co-h" tabIndex={-1}>Company profile</h2></div>
      <p className="org-sec-sub">Your organisation details and the context your Greatstone team works from.</p>
      <div className="acct-grid">
        <div className="pr-form org-profile">
          {admin ? <>
            <label>Company name<input value={name} onChange={e => setName(e.target.value)} autoComplete="organization" /></label>
            <label>Website domain<input value={domain} onChange={e => setDomain(e.target.value)} placeholder="example.com" autoComplete="url" /></label>
            <div className="pr-field">
              <label>Notes<textarea id="org-notes" aria-describedby="org-notes-hint" rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Your goals, priorities, anything we should keep in mind…" /></label>
              <p className="pr-hint" id="org-notes-hint">Shared with your Greatstone team to tailor your engagement. Not shown publicly.</p>
            </div>
            <button className="gs-btn primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save company profile'}</button>
          </> : <>
            <div className="org-field"><span className="org-field-l">Company name</span><span className="org-field-v">{company.name}</span></div>
            <div className="org-field"><span className="org-field-l">Website domain</span><span className="org-field-v">{company.domain || '—'}</span></div>
            {company.notes && <div className="org-field"><span className="org-field-l">Notes</span><span className="org-field-v">{company.notes}</span></div>}
            <p className="ca-note">Only your company admin can edit these details.</p>
          </>}
        </div>
        <div className="pr-form">
          <h2>Plan &amp; billing</h2>
          <div className="org-field"><span className="org-field-l">Tier</span><span className="org-field-v">{company.tier?.name || 'Standard'}</span></div>
          <div className="org-field"><span className="org-field-l">Client since</span><span className="org-field-v">{company.created_at ? fmtDate(company.created_at) : '—'}</span></div>
          <p className="ca-note">Saved cards, invoices and receipts live in your <a className="ca-link" href="#account">personal account → Billing</a>, in the secure Stripe portal. Tier pricing is set by your Greatstone team.</p>
        </div>
      </div>
    </section>
  );
}

// ── company commerce rollup ─────────────────────────────────────────────────────
function RecentOrders({ orders, memberName }) {
  if (orders === null) return (
    <section className="org-sec"><div className="acct-ordhead"><h2>Company orders</h2></div>
      <div className="st-skel" style={{ height: 80, borderRadius: 14 }} /></section>
  );
  return (
    <section className="org-sec" aria-labelledby="org-ord-h">
      <div className="acct-ordhead">
        <h2 id="org-ord-h">Company orders</h2>
        {orders.length > 0 && <a className="gs-btn ghost sm" href="#account">Full history &amp; invoices →</a>}
      </div>
      <div className="ca-table-wrap">
        <table className="ca-table ca-cards acct-orders">
          <thead><tr><th scope="col">Date</th><th scope="col">Reference</th><th scope="col">Placed by</th><th scope="col">Total</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {orders.length === 0
              ? <tr><td colSpan="5" className="ca-muted" data-label=""><span role="status">No orders yet. <a className="ca-link" href="#shop">Browse the store →</a></span></td></tr>
              : orders.slice(0, ORD_CAP).map(o => (
                <tr key={o.id}>
                  <td data-label="Date">{fmtDate(o.placed_at || o.created_at)}</td>
                  <td data-label="Reference" className="ca-name"><code className="ca-ref">{o.reference}</code></td>
                  <td data-label="Placed by">{memberName[o.customer_user_id] || '—'}</td>
                  <td data-label="Total" className="ca-amt">{fmtMoney(o.total_minor, o.currency)}</td>
                  <td data-label="Status"><span className={'ca-status ca-ord-' + o.status}>{o.status}</span></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {orders.length > ORD_CAP && (
        <p className="acct-ordtrunc" role="status">Showing the {ORD_CAP} most recent of {orders.length}. <a className="ca-link" href="#account">See all {orders.length} in your full history →</a></p>
      )}
    </section>
  );
}
