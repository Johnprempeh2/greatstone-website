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
import './store.css';
import './admin.css';

const ORG_ID = '11111111-1111-4111-8111-111111111111'; // single live org (matches ensure_customer_account)
const initialsOf = (s) => (String(s || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('') || '?').toUpperCase();
// the viewer's LOCAL calendar date (occurred_on is a local DATE) — a UTC date flips past/upcoming at the day boundary
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; } };
const periodOf = (iso) => { try { const d = new Date(iso); return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); } catch { return 'Earlier'; } };
const KIND_LABEL = { recap: 'Meeting recap', milestone: 'Milestone', deliverable: 'Deliverable', kickoff: 'Kickoff', review: 'Review', note: 'Note' };
const KIND_PLURAL = { recap: 'Recaps', milestone: 'Milestones', deliverable: 'Deliverables', kickoff: 'Kickoffs', review: 'Reviews', note: 'Notes' };
const ANCHOR_KINDS = new Set(['milestone', 'kickoff', 'review']); // filled markers — the journey anchors

// Allowlist sanitiser for staff-authored inline recap HTML — defence-in-depth even though authors are
// staff. Browser-only (DOMParser). The output is re-parsed by React (dangerouslySetInnerHTML), so this
// must survive the round-trip: (a) foreign-content / rawtext containers (svg/math/style/noscript/…) are
// DROPPED ENTIRELY rather than unwrapped — unwrapping them is the classic mutation-XSS vector; (b) any
// heading is demoted to <h5> so a recap can't break the page heading order (card title is <h4>); (c) the
// whole pass runs to a fixpoint so a string that re-parses differently can't smuggle live nodes through.
const ALLOWED = new Set(['P', 'H5', 'H6', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'B', 'I', 'A', 'BR', 'BLOCKQUOTE', 'CODE', 'PRE', 'SPAN', 'HR']);
const DROP_ENTIRELY = new Set(['SCRIPT', 'STYLE', 'SVG', 'MATH', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'TITLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'HEAD', 'FRAME', 'FRAMESET', 'XMP']);
const DEMOTE = new Set(['H1', 'H2', 'H3', 'H4']); // any body heading sits below the <h4> card title

function sanitizeOnce(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstChild;
  const walk = (node) => {
    for (const el of Array.from(node.children || [])) {
      const tag = el.tagName;
      if (DROP_ENTIRELY.has(tag)) { el.remove(); continue; }                 // drop the whole subtree
      if (DEMOTE.has(tag)) {                                                  // rename heading → h5
        const h = doc.createElement('h5');
        while (el.firstChild) h.appendChild(el.firstChild);
        el.replaceWith(h); walk(h); continue;
      }
      if (!ALLOWED.has(tag)) { el.replaceWith(...Array.from(el.childNodes)); continue; } // unwrap benign unknown (fixpoint re-cleans promoted children)
      for (const attr of Array.from(el.attributes)) {
        const n = attr.name.toLowerCase();
        if (el.tagName === 'A' && n === 'href') {
          if (!/^(https?:|mailto:)/i.test(attr.value.trim())) el.removeAttribute('href');
          continue;
        }
        if (n !== 'class') el.removeAttribute(attr.name);                     // strips on* handlers + everything else
      }
      if (el.tagName === 'A' && el.getAttribute('href')) {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
        el.setAttribute('aria-label', (el.textContent || 'link').trim() + ' (opens in a new tab)');
      }
      walk(el);
    }
  };
  walk(root);
  return root.innerHTML;
}
function sanitizeHtml(html) {
  if (!html || typeof window === 'undefined') return '';
  let out = String(html);
  for (let i = 0; i < 6; i++) { const next = sanitizeOnce(out); if (next === out) break; out = next; } // fixpoint
  return out;
}
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'link'; } };

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
      <p>{session.user?.email} manages the catalogue. The organization dashboard is for customer companies.</p>
      <button className="gs-btn ghost" onClick={() => signOut()}>Sign out</button>
    </div></div>
  );
  if (!profile) return <div className="ca-wrap"><div className="ca-center">Loading your organization…</div></div>;
  return <Org profile={profile} session={session} onProfile={setProfile} />;
}

function Org({ profile, session, onProfile }) {
  const company = profile.customer;
  const admin = isCompanyAdmin(profile);
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2800); };

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
      .is('deleted_at', null).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setOrders(data || []));
    supabase.from('quotes').select('id, status').is('deleted_at', null)
      .then(({ data }) => setQuotes(data || []));
  }, [company.id]);
  useEffect(() => { load(); }, [load]);

  const memberName = useMemo(() => {
    const m = {}; (members || []).forEach(u => { m[u.id] = u.full_name || u.email; }); return m;
  }, [members]);
  const primaryContact = (members || []).find(m => m.is_primary) || (members || []).find(m => m.role === 'admin');
  const liveOrders = (orders || []).filter(o => o.status !== 'cancelled' && o.status !== 'refunded');
  const totalSpent = liveOrders.reduce((s, o) => s + (o.total_minor || 0), 0);
  const openQuotes = (quotes || []).filter(q => !['won', 'lost', 'cancelled'].includes(q.status)).length;

  return (
    <div className="ca-wrap">
      <header className="acct-id">
        <div className="acct-avatar" aria-hidden="true">{initialsOf(company.name)}</div>
        <div className="acct-id-text">
          <span className="st-kicker">Your organization</span>
          <h1 className="acct-id-name">{company.name}</h1>
          <div className="acct-id-sub">
            {company.domain ? company.domain + ' · ' : ''}
            {members ? `${members.length} ${members.length === 1 ? 'member' : 'members'}` : '…'}
            {company.tier?.name && <span className="acct-tier">{company.tier.name}</span>}
          </div>
        </div>
        <div className="acct-id-actions">
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
          : <span>You're a <b>member</b> of {company.name}.{primaryContact ? <> Your company admin is <b>{primaryContact.full_name || primaryContact.email}</b>.</> : ''}</span>}
      </div>

      {/* at-a-glance */}
      <div className="org-stats">
        <Stat label="Members" value={members ? members.length : '…'} />
        <Stat label="Open quotes" value={quotes ? openQuotes : '…'} />
        <Stat label="Orders" value={orders ? liveOrders.length : '…'} />
        <Stat label="Invested" value={orders ? fmtMoney(totalSpent, (orders[0]?.currency) || 'GBP') : '…'} />
      </div>

      {err && <div className="ca-err" role="alert" style={{ marginBottom: 16 }}>Some data couldn't load. <button className="ca-link" onClick={load}>Try again</button></div>}

      <OnboardingChecklist company={company} admin={admin} members={members} engagements={engagements} orders={orders} />

      <OrgAnalytics orders={orders} engagements={engagements} />

      <MaturityRadar company={company} />

      <EngagementTimeline engagements={engagements} companyId={company.id} companyName={company.name} memberName={memberName} />

      <Members members={members} meId={profile.id} admin={admin} customerId={company.id} requestedBy={profile.id} flash={flash} />

      <CompanyProfile company={company} admin={admin} onProfile={onProfile} flash={flash} />

      <RecentOrders orders={orders} memberName={memberName} />

      {toast && <div className="ca-toast" role="status">{toast}</div>}
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="org-stat"><div className="org-stat-v">{value}</div><div className="org-stat-l">{label}</div></div>;
}

// First-run setup checklist — shown until the company is set up (or dismissed). Steps derive from data
// already loaded, so it self-completes; admins get the action buttons, members see progress.
function OnboardingChecklist({ company, admin, members, engagements, orders }) {
  const key = 'gs-org-onboard:' + company.id;
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(key) === '1'; } catch { return false; } });
  if (members === null || engagements === null || orders === null) return null; // wait for data
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const steps = [
    { id: 'profile', label: 'Complete your company profile', hint: 'Add your website and a note about your goals.', done: !!(company.domain && company.notes), cta: admin ? { label: 'Edit profile', onClick: () => scrollTo('org-co-h') } : null },
    { id: 'team', label: 'Invite your team', hint: 'Bring your colleagues into the portal.', done: members.length > 1, cta: admin ? { label: 'Invite a teammate', onClick: () => scrollTo('org-mem-h') } : null },
    { id: 'kickoff', label: 'Book your kickoff', hint: 'Start your engagement with a kickoff call.', done: engagements.some(e => e.kind === 'kickoff'), cta: { label: 'Book a deep dive', href: '#go/contact' } },
    { id: 'order', label: 'Place your first order', hint: 'Explore the Greatstone software catalogue.', done: (orders || []).length > 0, cta: { label: 'Browse the store', href: '#shop' } },
  ];
  const doneCount = steps.filter(s => s.done).length;
  if (dismissed || doneCount === steps.length) return null; // fully set up or dismissed → hide
  const dismiss = () => { try { localStorage.setItem(key, '1'); } catch { /* ignore */ } setDismissed(true); };
  const pct = Math.round((doneCount / steps.length) * 100);
  return (
    <section className="org-onboard" aria-labelledby="org-ob-h">
      <div className="org-onboard-head">
        <div><span className="st-kicker">Get started</span><h2 id="org-ob-h">Set up your organization</h2></div>
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

// Lightweight relationship analytics — last touchpoint, total touchpoints, a monthly spend sparkline.
// All from data already loaded; hidden for a brand-new company with no history.
function OrgAnalytics({ orders, engagements }) {
  if (orders === null || engagements === null) return null;
  const today = todayISO();
  const pastEng = engagements.filter(e => e.occurred_on <= today);
  const live = orders.filter(o => o.status !== 'cancelled' && o.status !== 'refunded');
  if (!live.length && !pastEng.length) return null;

  let lastTouch = null;
  if (pastEng.length) {
    const latest = pastEng.reduce((a, b) => (a.occurred_on > b.occurred_on ? a : b));
    // local-calendar diff (occurred_on is a local DATE; matches todayISO so "Today" reports correctly)
    lastTouch = Math.max(0, Math.round((new Date(today + 'T00:00:00').getTime() - new Date(latest.occurred_on + 'T00:00:00').getTime()) / 86400000));
  }
  const byMonth = {};
  for (const o of live) { const d = new Date(o.placed_at || o.created_at); const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); byMonth[k] = (byMonth[k] || 0) + (o.total_minor || 0); }
  const months = Object.keys(byMonth).sort().slice(-6);
  const max = Math.max(1, ...months.map(m => byMonth[m]));
  const curr = live[0]?.currency || 'GBP';

  return (
    <section className="org-analytics" aria-labelledby="org-an-h">
      <h2 id="org-an-h" className="ci-sub" style={{ fontSize: '1rem' }}>Relationship pulse</h2>
      <div className="org-an-grid">
        {lastTouch !== null && <div className="org-an-tile"><div className="org-stat-v">{lastTouch === 0 ? 'Today' : lastTouch + 'd'}</div><div className="org-stat-l">Last touchpoint</div></div>}
        <div className="org-an-tile"><div className="org-stat-v">{pastEng.length}</div><div className="org-stat-l">Touchpoints</div></div>
        {months.length > 0 && (
          <div className="org-an-tile org-an-spark">
            <div className="org-an-bars" role="img" aria-label={'Spend trend, last ' + months.length + ' month' + (months.length === 1 ? '' : 's') + ': ' + months.map(m => m + ' ' + fmtMoney(byMonth[m], curr)).join(', ') + '. Total ' + fmtMoney(live.reduce((s, o) => s + (o.total_minor || 0), 0), curr) + '.'}>
              {months.map(m => <span key={m} className="org-an-bar" style={{ height: Math.max(10, Math.round(byMonth[m] / max * 100)) + '%' }} title={m + ': ' + fmtMoney(byMonth[m], curr)} />)}
            </div>
            <div className="org-stat-l">Spend trend</div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── DX engagement timeline ────────────────────────────────────────────────────
function EngagementTimeline({ engagements, companyId, companyName, memberName }) {
  const [filter, setFilter] = useState('all');
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
      setOpenId(id); setFilter('all'); setQ('');
      clearTimeout(timer);
      timer = setTimeout(() => {
        const el = document.getElementById('dx-item-' + id);
        (el || document.getElementById('dx-h'))?.scrollIntoView({ behavior: 'smooth', block: el ? 'center' : 'start' });
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

  const scrollToNewest = () => {
    const n = past.find((e) => isNew(e));
    setFilter('all'); setQ('');
    if (n) { setOpenId(n.id); setTimeout(() => document.getElementById('dx-item-' + n.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60); }
    else document.getElementById('dx-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const matchQ = (e) => {
    if (!q.trim()) return true;
    const hay = [e.title, e.summary, e.phase, e.owner_name, (e.tags || []).join(' '), (e.attendees || []).join(' ')].join(' ').toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  };
  const visible = past.filter(e => (filter === 'all' || e.kind === filter) && matchQ(e));

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
          <p className="dx-sub">Your journey with Greatstone — recaps, milestones and deliverables, newest first.</p>
        </div>
        {newCount > 0 && (
          <button type="button" className="dx-newcount" onClick={scrollToNewest}
            aria-label={`${newCount} ${newCount === 1 ? 'item' : 'items'} added since your last visit — jump to the newest`}>
            {newCount} new
          </button>
        )}
      </div>

      {engagements.length === 0 ? (
        <div className="dx-empty">
          <div className="dx-empty-mark" aria-hidden="true">◇</div>
          <h3>Your engagement timeline starts here</h3>
          <p>After your kickoff, every meeting recap, milestone and deliverable from your Greatstone engagement will appear here — a living record of your digital-experience journey.</p>
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
                  <button key={e.id} className="dx-pin" onClick={() => { setFilter('all'); setQ(''); setOpenId(e.id); setTimeout(() => document.getElementById('dx-item-' + e.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60); }}>
                    <span className={'dx-kind k-' + e.kind}>{KIND_LABEL[e.kind]}</span>
                    <span className="dx-pin-title">{e.title}</span>
                    <span className="dx-pin-date">{fmtDate(e.occurred_on)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {past.length === 0 ? (
            <p className="ca-note" role="status" style={{ padding: '20px 4px' }}>Your timeline fills in after your first session — see “What's next” above.</p>
          ) : (
            <>
              <div className="dx-controls">
                <div className="dx-chips" role="group" aria-label="Filter by type">
                  <button className={'dx-chip' + (filter === 'all' ? ' on' : '')} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
                  {kindsPresent.map(k => (
                    <button key={k} className={'dx-chip' + (filter === k ? ' on' : '')} aria-pressed={filter === k} onClick={() => setFilter(k)}>{KIND_PLURAL[k]}</button>
                  ))}
                </div>
                <input className="dx-search" type="search" placeholder="Search the timeline…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search engagements" />
              </div>

              {visible.length === 0 ? (
                <p className="ca-note" role="status" style={{ padding: '20px 4px' }}>No items match. <button className="ca-link" onClick={() => { setFilter('all'); setQ(''); }}>Clear filters</button></p>
              ) : (
                <div className="dx-timeline">
                  {groups.map(g => (
                    <div key={g.period} className="dx-group">
                      <h3 className="dx-period">{g.period}</h3>
                      <ol className="dx-list">
                        {g.items.map(e => (
                          <Item key={e.id} e={e} isNew={isNew(e)} open={openId === e.id} onToggle={() => setOpenId(openId === e.id ? null : e.id)} />
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

function Item({ e, isNew, open, onToggle }) {
  const anchor = ANCHOR_KINDS.has(e.kind);
  const url = location.origin + location.pathname + '#org/e/' + e.id;
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
          {isNew && <span className="dx-new">New</span>}
        </div>
        <h4 className="dx-title">{e.title}</h4>
        <div className="dx-meta">
          <span className="dx-date">{fmtDate(e.occurred_on)}</span>
          {e.owner_name && <span className="dx-owner">· {e.owner_name}</span>}
          {(e.attendees || []).length > 0 && (
            <span className="dx-attendees" aria-label={'Attendees: ' + e.attendees.join(', ')}>
              {e.attendees.slice(0, 5).map((a, i) => <span key={i} className="dx-av" title={a}>{initialsOf(a)}</span>)}
            </span>
          )}
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

// ── members directory + invite requests ───────────────────────────────────────
function Members({ members, meId, admin, customerId, requestedBy, flash }) {
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
        <h2 id="org-mem-h">Members &amp; access</h2>
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
          <h3 className="dx-pins-h">Pending invitations</h3>
          {pending.map(r => (
            <div key={r.id} className="org-pendrow">
              <span className="ca-name">{r.full_name || r.email}</span>
              <span className="ca-muted">{r.email} · {r.role === 'admin' ? 'Company admin' : 'Member'}</span>
              <span className="org-pendstatus">Requested {fmtDate(r.created_at)} · we'll provision soon</span>
            </div>
          ))}
        </div>
      )}
      <p className="ca-note">{admin
        ? <>Invite a teammate above and our team will set up their access and be in touch. To remove a member or change the company admin, </>
        : <>To add or remove teammates, or change who's the company admin, </>}
        <a className="ca-link" href="#go/contact">contact your Greatstone team</a>.</p>
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
    onDone("Invitation requested — our team will set up access and be in touch.");
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
      <div className="acct-ordhead"><h2 id="org-co-h">Company profile</h2></div>
      <div className="acct-grid">
        <div className="pr-form">
          {admin ? <>
            <label>Company name<input value={name} onChange={e => setName(e.target.value)} autoComplete="organization" /></label>
            <label>Website domain<input value={domain} onChange={e => setDomain(e.target.value)} placeholder="example.com" autoComplete="url" /></label>
            <label>Notes<textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} /></label>
            <button className="gs-btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save company profile'}</button>
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
              : orders.slice(0, 8).map(o => (
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
    </section>
  );
}
