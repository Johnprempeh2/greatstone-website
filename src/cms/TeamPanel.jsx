import { useState, useEffect } from 'react';
import { ROLES } from './auth.js';

// Team & roles (admin-only): the org roster — who's on the team, their role and responsibilities,
// plus pending invitations. This is the DX-dashboard prototype: it assigns roles and records
// invitations only. It creates NO real account, sets NO password and sends NO email — real
// multi-tenant auth + org scoping + invitation delivery are the Laravel backend (HANDOVER → Team).
const ROLE_OPTS = Object.keys(ROLES).map((id) => ({ id, label: ROLES[id].label }));

function MemberRow({ member, isYou, onUpdate, onRemove }) {
  const [m, setM] = useState(member);
  const [open, setOpen] = useState(false);
  useEffect(() => { setM(member); }, [member.id]);
  const set = (k, v) => setM((p) => ({ ...p, [k]: v }));
  const commit = (k, val) => { const v = val === undefined ? m[k] : val; if (v !== member[k]) onUpdate(member.id, { [k]: v }); };
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
        </div>
      )}
    </li>
  );
}

export default function TeamPanel({ team = [], currentEmail, onInvite, onUpdate, onRemove, onClose }) {
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
    <aside className="gs-panel" role="dialog" aria-label="Team">
      <div className="gs-panel-head">
        <h3>Team <span className="gs-panel-count">{team.length}</span></h3>
        <button className="gs-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="gs-panel-body">
        <p className="gs-field-hint">Assign roles and invite teammates. Prototype — this records membership only; it creates no account, sets no password and sends no email. Real org sign-in, roles and invites are the Laravel backend (see HANDOVER).</p>

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
          {invited.map((m) => <MemberRow key={m.id} member={m} isYou={isMe(m)} onUpdate={onUpdate} onRemove={onRemove} />)}
        </ul>
        <div className="gs-tm-grouplabel">Members</div>
        <ul className="gs-tms">
          {active.map((m) => <MemberRow key={m.id} member={m} isYou={isMe(m)} onUpdate={onUpdate} onRemove={onRemove} />)}
          {active.length === 0 && <li className="gs-empty">No active members yet.</li>}
        </ul>
      </div>
    </aside>
  );
}
