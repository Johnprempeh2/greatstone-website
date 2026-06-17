import { useState, useRef, useEffect } from 'react';

const LOGO = 'https://greatstone-home.netlify.app/assets/greatstone-logo-web.png';

// The admin sign-in (reached only via #admin). One account now controls the WHOLE admin — the
// console, the page editor AND the catalogue — so this authenticates against Supabase staff (the same
// sign-in the Catalogue uses), not the old prototype session. On success it resolves the staff profile
// (role) and hands a { email, name, role } user back to App. adminAuth (and the Supabase client) is
// dynamically imported so a public visitor never loads it.
export default function SignIn({ onAuthed, onCancel }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => { const t = setTimeout(() => ref.current && ref.current.focus(), 30); return () => clearTimeout(t); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const m = await import('../store/adminAuth.mjs');
      const { error } = await m.signIn(email, pass);
      if (error) { setErr(error.message || 'Those details are not recognised.'); setBusy(false); return; }
      const staff = await m.getStaffUser().catch(() => null);
      if (!staff || !m.isStaff(staff)) {
        await m.signOut().catch(() => {});
        setErr('That account isn’t a Greatstone staff member.');
        setBusy(false); return;
      }
      onAuthed({ email: staff.email, name: staff.full_name || staff.email, role: staff.role });
    } catch (e2) {
      setErr('Couldn’t reach the sign-in service. Try again.');
      setBusy(false);
    }
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
    btn: { width: '100%', marginTop: '22px', background: 'var(--gs-accent)', color: '#0e1611', border: 0, borderRadius: '100px', padding: '13px', fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: '.92rem', cursor: 'pointer', opacity: busy ? 0.7 : 1 },
    back: { display: 'inline-block', marginTop: '18px', color: 'var(--gs-text-faint)', fontSize: '.82rem', fontWeight: 700, background: 'none', border: 0, cursor: 'pointer' },
    note: { marginTop: '22px', paddingTop: '18px', borderTop: '1px solid var(--gs-border-soft)', color: 'var(--gs-text-faint)', fontSize: '.72rem', lineHeight: 1.6 },
  };

  return (
    <div style={S.screen}>
      <form style={S.card} onSubmit={submit} aria-label="Admin sign in">
        <img src={LOGO} alt="Greatstone International" width="800" height="160" decoding="async" style={S.logo} />
        <h1 style={S.h1}>Admin sign in</h1>
        <p style={S.sub}>One sign-in for the whole admin — website content, the page editor and the catalogue. Greatstone staff only.</p>

        <label style={S.label} htmlFor="gs-user">Email</label>
        <input id="gs-user" ref={ref} style={S.input} type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} autoComplete="username" placeholder="you@greatstone.dev"
          aria-invalid={err ? 'true' : undefined} aria-describedby={err ? 'gs-signin-err' : undefined} />

        <label style={S.label} htmlFor="gs-pass">Password</label>
        <input id="gs-pass" style={S.input} type="password" value={pass} onChange={(e) => { setPass(e.target.value); setErr(''); }} autoComplete="current-password" placeholder="••••••••"
          aria-invalid={err ? 'true' : undefined} aria-describedby={err ? 'gs-signin-err' : undefined} />

        {err && <div id="gs-signin-err" style={S.err} role="alert">{err}</div>}
        <button type="submit" style={S.btn} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" style={S.back} onClick={onCancel}>← Back to site</button>

        <p style={S.note}>
          Demo staff (password <b style={{ color: 'var(--gs-text-muted)' }}>stone</b>):<br />
          admin@greatstone.dev · editor@greatstone.dev<br /><br />
          The same account signs you into the live catalogue. Editing rights are enforced by role on the server (Supabase RLS).
        </p>
      </form>
    </div>
  );
}
