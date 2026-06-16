import { useState, useRef, useEffect } from 'react';
import { signIn } from './auth.js';

const LOGO = 'https://greatstone-home.netlify.app/assets/greatstone-logo-web.png';

// The studio sign-in. Reached only via the separate admin entry (#admin). On success it
// flips the prototype session flag and hands control back to App, which then shows the
// editing chrome. Real deployments authenticate against Greatstone accounts (server-side).
export default function SignIn({ onAuthed, onCancel }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const ref = useRef(null);
  useEffect(() => { const t = setTimeout(() => ref.current && ref.current.focus(), 30); return () => clearTimeout(t); }, []);

  const submit = (e) => {
    e.preventDefault();
    const u = signIn(user, pass);
    if (u) onAuthed(u);
    else setErr('Those details are not recognised.');
  };

  const S = {
    screen: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative', zIndex: 3 },
    card: { width: 'min(420px,94vw)', background: 'rgba(20,23,20,.72)', border: '1px solid var(--gs-border)', borderRadius: '20px', padding: 'clamp(28px,4vw,40px)', backdropFilter: 'blur(14px)', boxShadow: '0 40px 120px -40px rgba(0,0,0,.7)' },
    logo: { width: '150px', marginBottom: '26px' },
    h1: { fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-.02em' },
    sub: { marginTop: '8px', color: 'var(--gs-text-muted)', fontSize: '.9rem', lineHeight: 1.6 },
    label: { display: 'block', fontSize: '.7rem', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gs-text-faint)', margin: '18px 0 8px' },
    input: { width: '100%', background: 'rgba(255,255,255,.04)', border: '1px solid var(--gs-border-soft)', borderRadius: '10px', padding: '12px 14px', color: 'var(--gs-text)', fontFamily: 'Montserrat,sans-serif', fontSize: '.92rem', outline: 'none' },
    err: { marginTop: '14px', color: '#ff6b6b', fontSize: '.82rem', fontWeight: 600 },
    btn: { width: '100%', marginTop: '22px', background: 'var(--gs-accent)', color: '#0e1611', border: 0, borderRadius: '100px', padding: '13px', fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: '.92rem', cursor: 'pointer' },
    back: { display: 'inline-block', marginTop: '18px', color: 'var(--gs-text-faint)', fontSize: '.82rem', fontWeight: 700, background: 'none', border: 0, cursor: 'pointer' },
    note: { marginTop: '22px', paddingTop: '18px', borderTop: '1px solid var(--gs-border-soft)', color: 'var(--gs-text-faint)', fontSize: '.72rem', lineHeight: 1.6 },
  };

  return (
    <div style={S.screen}>
      <form style={S.card} onSubmit={submit} aria-label="Studio sign in">
        <img src={LOGO} alt="Greatstone International" width="800" height="160" decoding="async" style={S.logo} />
        <h1 style={S.h1}>Studio sign in</h1>
        <p style={S.sub}>Editing is restricted to the Greatstone team. Sign in to open the studio.</p>

        <label style={S.label} htmlFor="gs-user">Email</label>
        <input id="gs-user" ref={ref} style={S.input} value={user} onChange={(e) => { setUser(e.target.value); setErr(''); }} autoComplete="username" placeholder="you@greatstone"
          aria-invalid={err ? 'true' : undefined} aria-describedby={err ? 'gs-signin-err' : undefined} />

        <label style={S.label} htmlFor="gs-pass">Password</label>
        <input id="gs-pass" style={S.input} type="password" value={pass} onChange={(e) => { setPass(e.target.value); setErr(''); }} autoComplete="current-password" placeholder="••••••••"
          aria-invalid={err ? 'true' : undefined} aria-describedby={err ? 'gs-signin-err' : undefined} />

        {err && <div id="gs-signin-err" style={S.err} role="alert">{err}</div>}
        <button type="submit" style={S.btn}>Sign in</button>
        <button type="button" style={S.back} onClick={onCancel}>← Back to site</button>

        <p style={S.note}>
          Prototype accounts (password <b style={{ color: 'var(--gs-text-muted)' }}>stone</b>):<br />
          admin@greatstone · editor@greatstone · viewer@greatstone<br /><br />
          The live deployment authenticates against Greatstone accounts and enforces editing rights on the server (role-based). Client-side gating here is for demonstration only.
        </p>
      </form>
    </div>
  );
}
