import { useState, useRef, useEffect } from 'react';
import { ROLES } from './auth.js';

const LOGO = 'https://greatstone-home.netlify.app/assets/greatstone-logo-web.png';
// friendly labels for the capability keys, so the invitee never sees a raw identifier like "manageUsers"
const CAP_LABELS = { edit: 'Edit content', publish: 'Publish pages', manageUsers: 'Manage the team' };

// The invite-accept screen, reached at #join/<token>. It models the DX-dashboard invitation flow:
// an org admin invites a teammate, shares the link, and the teammate accepts. PROTOTYPE — accepting
// records membership only; it creates NO account, sets NO password and signs no one in. In production
// the token is server-signed, the link is emailed, and accepting provisions the real org user and
// authenticates them (Laravel + Spatie). See HANDOVER → Team & roles.
function fmtDate(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; }
}

export default function AcceptInvite({ status, org, onAccept, onBack }) {
  const [done, setDone] = useState(false);
  const cardRef = useRef(null);
  const kind = done ? 'done' : (status && status.kind) || 'notfound';
  // move focus into the screen so keyboard + screen-reader users land on the heading, not the body
  useEffect(() => { const t = setTimeout(() => { const el = cardRef.current; if (el) el.focus(); }, 40); return () => clearTimeout(t); }, [kind]);
  const m = status && status.member;
  const roleLabel = m && ROLES[m.role] ? ROLES[m.role].label : (m && m.role) || 'teammate';
  const article = /^[aeiou]/i.test(roleLabel) ? 'an' : 'a';
  const caps = m && ROLES[m.role] ? Object.entries(ROLES[m.role].can).filter(([, v]) => v).map(([k]) => k) : [];

  const S = {
    screen: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative', zIndex: 3 },
    card: { width: 'min(460px,94vw)', background: 'rgba(20,23,20,.72)', border: '1px solid var(--gs-border)', borderRadius: '20px', padding: 'clamp(28px,4vw,40px)', backdropFilter: 'blur(14px)', boxShadow: '0 40px 120px -40px rgba(0,0,0,.7)' },
    logo: { width: '150px', marginBottom: '26px' },
    eyebrow: { fontSize: '.68rem', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--gs-accent)' },
    h1: { marginTop: '8px', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.15 },
    sub: { marginTop: '12px', color: 'var(--gs-text-muted)', fontSize: '.92rem', lineHeight: 1.65 },
    meta: { marginTop: '22px', display: 'flex', flexDirection: 'column', gap: '10px' },
    row: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '14px', fontSize: '.88rem', borderTop: '1px solid var(--gs-border-soft)', paddingTop: '10px' },
    rowLabel: { color: 'var(--gs-text-faint)', fontWeight: 700, fontSize: '.74rem', letterSpacing: '.04em', textTransform: 'uppercase' },
    rowVal: { color: 'var(--gs-text)', textAlign: 'right', fontWeight: 600 },
    caps: { display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' },
    cap: { fontSize: '.64rem', fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#0e1611', background: 'var(--gs-accent)', borderRadius: '5px', padding: '2px 7px' },
    btn: { width: '100%', marginTop: '26px', background: 'var(--gs-accent)', color: '#0e1611', border: 0, borderRadius: '100px', padding: '14px', fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: '.94rem', cursor: 'pointer' },
    back: { display: 'inline-block', marginTop: '18px', color: 'var(--gs-text-faint)', fontSize: '.82rem', fontWeight: 700, background: 'none', border: 0, cursor: 'pointer' },
    note: { marginTop: '24px', paddingTop: '18px', borderTop: '1px solid var(--gs-border-soft)', color: 'var(--gs-text-faint)', fontSize: '.72rem', lineHeight: 1.6 },
    ok: { color: 'var(--gs-accent)' },
    warn: { color: 'var(--gs-warning)' },
  };

  let body;
  if (kind === 'valid') {
    body = (
      <>
        <div style={S.eyebrow}>You’re invited</div>
        <h1 style={S.h1}>Join {org ? org.name : 'the organisation'} on Greatstone</h1>
        <p style={S.sub}>{m && m.invitedBy ? <>{m.invitedBy} has invited you</> : 'You’ve been invited'} to join as {article} <b style={{ color: 'var(--gs-text)' }}>{roleLabel}</b>.</p>
        <div style={S.meta}>
          <div style={S.row}><span style={S.rowLabel}>Email</span><span style={S.rowVal}>{(m && m.email) || '—'}</span></div>
          <div style={S.row}><span style={S.rowLabel}>Role</span><span style={S.rowVal}>{roleLabel}</span></div>
          {caps.length ? <div style={S.row}><span style={S.rowLabel}>Can</span><span style={S.caps}>{caps.map((c) => <span key={c} style={S.cap}>{CAP_LABELS[c] || c}</span>)}</span></div> : null}
          {m && m.expiresAt ? <div style={S.row}><span style={S.rowLabel}>Expires</span><span style={S.rowVal}>{fmtDate(m.expiresAt)}</span></div> : null}
        </div>
        <button type="button" style={S.btn} onClick={() => { onAccept(); setDone(true); }}>Accept invitation</button>
        <button type="button" style={S.back} onClick={onBack}>← Not now</button>
        <p style={S.note}>
          <b style={{ color: 'var(--gs-text-muted)' }}>Prototype.</b> Accepting records that you joined the team. In the live product this link is emailed to you, the token is signed by the Greatstone backend, and accepting creates your account and signs you in (built in Laravel; see HANDOVER). No password is set here.
        </p>
      </>
    );
  } else if (kind === 'done') {
    body = (
      <>
        <div style={{ ...S.eyebrow, ...S.ok }}>Welcome aboard</div>
        <h1 style={S.h1}>You’ve joined {org ? org.name : 'the team'}</h1>
        <p style={S.sub}>You’re now listed as a <b style={{ color: 'var(--gs-text)' }}>{roleLabel}</b>{m && m.email ? <> ({m.email})</> : ''}. An admin can adjust your role any time from the Team panel.</p>
        <button type="button" style={S.back} onClick={onBack}>← Back to site</button>
        <p style={S.note}>
          <b style={{ color: 'var(--gs-text-muted)' }}>Prototype.</b> In the live product you’d now be signed in to your Greatstone workspace. Here, studio access is still through the team sign-in; real account provisioning is the backend (HANDOVER).
        </p>
      </>
    );
  } else if (kind === 'accepted') {
    body = (
      <>
        <div style={S.eyebrow}>Invitation</div>
        <h1 style={S.h1}>Already accepted</h1>
        <p style={S.sub}>This invitation has already been used{m && m.email ? <> by {m.email}</> : ''}. If that wasn’t you, ask your admin to send a fresh invite.</p>
        <button type="button" style={S.back} onClick={onBack}>← Back to site</button>
      </>
    );
  } else if (kind === 'expired') {
    body = (
      <>
        <div style={{ ...S.eyebrow, ...S.warn }}>Invitation</div>
        <h1 style={S.h1}>This invitation has expired</h1>
        <p style={S.sub}>Invitations are valid for 7 days. Ask {m && m.invitedBy ? m.invitedBy : 'your admin'} to send a new one.</p>
        <button type="button" style={S.back} onClick={onBack}>← Back to site</button>
      </>
    );
  } else {
    body = (
      <>
        <div style={S.eyebrow}>Invitation</div>
        <h1 style={S.h1}>This link isn’t valid</h1>
        <p style={S.sub}>We couldn’t find this invitation. It may have been withdrawn or already used.</p>
        <button type="button" style={S.back} onClick={onBack}>← Back to site</button>
        <p style={S.note}>
          <b style={{ color: 'var(--gs-text-muted)' }}>Prototype note.</b> Invitations are stored in this browser, so a link created on another device won’t resolve here. In the live product the token resolves against the Greatstone backend from any device (HANDOVER).
        </p>
      </>
    );
  }

  return (
    <div style={S.screen}>
      <div style={{ ...S.card, outline: 'none' }} role="dialog" aria-modal="true" aria-label="Accept invitation" tabIndex={-1} ref={cardRef}>
        <img src={LOGO} alt="Greatstone International" width="800" height="160" decoding="async" style={S.logo} />
        {body}
      </div>
    </div>
  );
}
