import { useState, useEffect, useRef } from 'react';
import { ROLES } from './auth.js';
import PanelFrame from './PanelFrame.jsx';

// Team & roles (admin-only): the org roster — who's on the team, their role and responsibilities,
// plus pending invitations. This is the DX-dashboard prototype: it assigns roles and records
// invitations only. It creates NO real account, sets NO password and sends NO email — real
// multi-tenant auth + org scoping + invitation delivery are the Laravel backend (HANDOVER → Team).
const ROLE_OPTS = Object.keys(ROLES).map((id) => ({ id, label: ROLES[id].label }));

function fmtDate(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch (e) { return ''; }
}

function MemberRow({ member, isYou, onUpdate, onRemove, onResend }) {
  const [m, setM] = useState(member);
  const [open, setOpen] = useState(false);
  const [copyMsg, setCopyMsg] = useState('');
  const linkRef = useRef(null);
  useEffect(() => { setM(member); }, [member.id]);
  const set = (k, v) => setM((p) => ({ ...p, [k]: v }));
  const commit = (k, val) => { const v = val === undefined ? m[k] : val; if (v !== member[k]) onUpdate(member.id, { [k]: v }); };
  const inviteLink = member.token ? (location.origin + (import.meta.env.BASE_URL || '/') + '#join/' + member.token) : '';
  const copied = copyMsg.startsWith('Link copied');
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(inviteLink); setCopyMsg('Link copied to clipboard'); }
    catch (e) { if (linkRef.current) { linkRef.current.focus(); linkRef.current.select(); } setCopyMsg('Press Cmd or Ctrl + C to copy'); } // clipboard API is blocked on non-secure origins
    setTimeout(() => setCopyMsg(''), 2400);
  };
  return (
    <li className="gs-tm">
      <div className="gs-tm-top">
        <button className="gs-tm-id" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className={'gs-prod-caret' + (open ? ' is-open' : '')} aria-hidden="true">▸</span>
          <span className="gs-tm-name">{m.name || m.email || 'New teammate'}{isYou ? <em className="gs-tm-you">You</em> : null}</span>
          <span className={'gs-tm-status gs-tm-' + (m.status || 'active')}>{m.status === 'invited' ? 'Invited' : 'Active'}</span>
        </button>
        <span className="gs-tm-rolepill">{ROLES[m.role] ? ROLES[m.role].label : m.role}</span>
        <button className="gs-prod-del" onClick={() => onRemove(member.id, m.name || m.email)} disabled={isYou} aria-label="Remove" title={isYou ? 'You can’t remove yourself' : 'Remove'}>×</button>
      </div>
      {open && (
        <div className="gs-prod-body">
          <label className="gs-field"><span className="gs-field-label">Name</span>
            <input value={m.name || ''} onChange={(e) => set('name', e.target.value)} onBlur={() => commit('name')} /></label>
          <label className="gs-field"><span className="gs-field-label">Email</span>
            <input type="email" value={m.email || ''} onChange={(e) => set('email', e.target.value)} onBlur={() => commit('email')} /></label>
          <div className="gs-prod-row">
            <label className="gs-field"><span className="gs-field-label">Role</span>
              <select value={m.role || 'editor'} onChange={(e) => { set('role', e.target.value); commit('role', e.target.value); }}>
                {ROLE_OPTS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select></label>
            <label className="gs-field"><span className="gs-field-label">Status</span>
              <select value={m.status || 'active'} onChange={(e) => { set('status', e.target.value); commit('status', e.target.value); }}>
                <option value="active">Active</option><option value="invited">Invited</option>
              </select></label>
          </div>
          <label className="gs-field"><span className="gs-field-label">Responsibilities</span>
            <input value={m.title || ''} onChange={(e) => set('title', e.target.value)} onBlur={() => commit('title')} placeholder="e.g. Content lead" /></label>
          {m.status === 'invited' && member.token ? (
            <div className="gs-tm-invite-link">
              <div className="gs-tm-invite-meta">
                {member.invitedBy ? <span>Invited by {member.invitedBy}</span> : <span>Pending invitation</span>}
                {member.expiresAt ? <span> · expires {fmtDate(member.expiresAt)}</span> : null}
              </div>
              <div className="gs-tm-invite-row">
                <input className="gs-tm-invite-input" ref={linkRef} value={inviteLink} readOnly onFocus={(e) => e.target.select()} aria-label="Invitation link" />
                <button type="button" className="gs-btn ghost sm" onClick={copyLink}>{copied ? 'Copied ✓' : 'Copy link'}</button>
                <button type="button" className="gs-btn ghost sm" onClick={() => onResend && onResend(member.id)} title="Issue a fresh link and reset the 7-day expiry">Resend</button>
              </div>
              <span className="gs-sr-only" aria-live="polite">{copyMsg}</span>
              <span className="gs-field-hint">Share this link with {m.email || 'your teammate'}. Prototype: no email is sent; opening it shows the accept screen.</span>
            </div>
          ) : null}
        </div>
      )}
    </li>
  );
}

export default function TeamPanel({ team = [], org, currentEmail, onInvite, onUpdate, onRemove, onResend, onClose, embedded }) {
  const isMe = (m) => currentEmail && (m.email || '').toLowerCase() === String(currentEmail).toLowerCase();
  const [inv, setInv] = useState({ name: '', email: '', role: 'editor' });
  const set = (k, v) => setInv((f) => ({ ...f, [k]: v }));
  const send = (e) => {
    e.preventDefault();
    if (!inv.email.trim()) return;
    onInvite({ name: inv.name.trim(), email: inv.email.trim(), role: inv.role, status: 'invited' });
    setInv({ name: '', email: '', role: 'editor' });
  };
  const active = team.filter((m) => m.status !== 'invited');
  const invited = team.filter((m) => m.status === 'invited');

  return (
    <PanelFrame embedded={embedded} label={<>Team <span className="gs-panel-count">{team.length}</span></>} name="Team and roles" onClose={onClose}>
      <div className="gs-panel-body">
        {org ? <div className="gs-tm-org"><span className="gs-tm-org-name">{org.name}</span><span className="gs-tm-org-label">Organisation</span></div> : null}
        <p className="gs-field-hint">Assign roles and invite teammates. Prototype: this records membership only; it creates no account, sets no password and sends no email. Real org sign-in, roles and invites are the Laravel backend (see HANDOVER).</p>

        <form className="gs-tm-invite" onSubmit={send}>
          <div className="gs-prod-row">
            <label className="gs-field"><span className="gs-field-label">Name</span>
              <input value={inv.name} onChange={(e) => set('name', e.target.value)} placeholder="Teammate name" /></label>
            <label className="gs-field"><span className="gs-field-label">Role</span>
              <select value={inv.role} onChange={(e) => set('role', e.target.value)}>
                {ROLE_OPTS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select></label>
          </div>
          <label className="gs-field"><span className="gs-field-label">Work email</span>
            <input type="email" value={inv.email} onChange={(e) => set('email', e.target.value)} placeholder="teammate@company.com" required /></label>
          <button type="submit" className="gs-btn primary sm gs-tm-invitebtn">Invite teammate</button>
        </form>

        {invited.length > 0 && <div className="gs-tm-grouplabel">Pending invitations</div>}
        <ul className="gs-tms">
          {invited.map((m) => <MemberRow key={m.id} member={m} isYou={isMe(m)} onUpdate={onUpdate} onRemove={onRemove} onResend={onResend} />)}
        </ul>
        <div className="gs-tm-grouplabel">Members</div>
        <ul className="gs-tms">
          {active.map((m) => <MemberRow key={m.id} member={m} isYou={isMe(m)} onUpdate={onUpdate} onRemove={onRemove} onResend={onResend} />)}
          {active.length === 0 && <li className="gs-empty">No active members yet.</li>}
        </ul>
      </div>
    </PanelFrame>
  );
}
