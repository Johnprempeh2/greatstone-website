// Two-factor sign-in on the account Security tab (GRE-6335). Turn on: password → scan the QR code → confirm a
// code → save the recovery codes, which are shown once. Turn off: password and a fresh code. The server
// (Better Auth two-factor plugin, netlify/functions/lib/two-factor.mjs) checks every step.
import React, { useMemo, useState } from 'react';
import PasswordInput from './PasswordInput.jsx';
import { startTwoFactor, confirmTwoFactor, disableTwoFactor, replaceRecoveryCodes } from './customerAuth.mjs';
import { qrSvgPath } from '../lib/qr.mjs';
import { twoFactorError, setupKey } from './two-factor-ui.mjs';

function QrCode({ uri }) {
  const qr = useMemo(() => qrSvgPath(uri), [uri]);
  return (
    <svg className="tf-qr" viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label="QR code to add Greatstone to your authenticator app" shapeRendering="crispEdges">
      <rect width={qr.size} height={qr.size} fill="#fff" />
      <path d={qr.path} fill="#000" />
    </svg>
  );
}

function RecoveryCodes({ codes, onDone }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = `Greatstone recovery codes\nEach code works once.\n\n${codes.join('\n')}\n`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'greatstone-recovery-codes.txt' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="tf-step">
      <h3>Save your recovery codes</h3>
      <p className="ca-note tf-lead">If you lose your phone, sign in with one of these codes instead. Each code works once. We show them only now, so keep them somewhere safe, such as a password manager.</p>
      <ol className="tf-codes" aria-label="Recovery codes">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ol>
      <div className="tf-actions">
        <button type="button" className="gs-btn ghost sm" onClick={copy}>{copied ? 'Copied ✓' : 'Copy codes'}</button>
        <button type="button" className="gs-btn ghost sm" onClick={download}>Download .txt</button>
      </div>
      <label className="tf-check"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I have saved these codes</label>
      <button type="button" className="gs-btn primary" disabled={!saved} onClick={onDone}>Done</button>
    </div>
  );
}

export default function TwoFactorCard({ enabled, flash }) {
  // null (summary) | password | scan | codes | disable | regen
  const [step, setStep] = useState(null);
  const [pw, setPw] = useState(''); const [code, setCode] = useState('');
  const [setup, setSetup] = useState(null); // { uri, codes }
  const [codes, setCodes] = useState(null); // { list, done } shown once, then dropped
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const reset = () => { setStep(null); setPw(''); setCode(''); setSetup(null); setErr(null); };
  const run = async (fn) => { setBusy(true); setErr(null); try { await fn(); } finally { setBusy(false); } };

  const begin = (e) => { e.preventDefault(); run(async () => {
    const { data, error } = await startTwoFactor(pw);
    if (error) { setErr(twoFactorError(error)); return; }
    setSetup({ uri: data.totpURI, codes: data.backupCodes }); setPw(''); setStep('scan');
  }); };
  const confirm = (e) => { e.preventDefault(); run(async () => {
    const { error } = await confirmTwoFactor(code);
    if (error) { setErr(twoFactorError(error)); return; }
    setCodes({ list: setup.codes, done: 'Two-factor sign-in is on.' }); setSetup(null); setCode(''); setStep('codes');
  }); };
  const turnOff = (e) => { e.preventDefault(); run(async () => {
    const { error } = await disableTwoFactor(pw, code);
    if (error) { setErr(twoFactorError(error)); return; }
    reset(); flash?.('Two-factor sign-in is off.');
  }); };
  const regen = (e) => { e.preventDefault(); run(async () => {
    const { data, error } = await replaceRecoveryCodes(pw);
    if (error) { setErr(twoFactorError(error)); return; }
    setPw(''); setCodes({ list: data.backupCodes, done: 'New recovery codes saved. The old ones no longer work.' }); setStep('codes');
  }); };

  const errBox = err && <div id="tf-err" className="ca-err" role="alert">{err}</div>;
  const cancel = <button type="button" className="ca-link" onClick={reset} disabled={busy}>Cancel</button>;
  const pwField = (label = 'Your password') => (
    <label>{label}<PasswordInput value={pw} onChange={(e) => { setPw(e.target.value); setErr(null); }} autoComplete="current-password" required ariaInvalid={err ? 'true' : undefined} ariaDescribedby={err ? 'tf-err' : undefined} /></label>
  );
  const codeField = (label, hint) => (
    <label>{label}
      <input className="tf-code" value={code} onChange={(e) => { setCode(e.target.value); setErr(null); }} inputMode={hint === 'digits' ? 'numeric' : 'text'}
        autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} maxLength={hint === 'digits' ? 7 : 14} required
        aria-invalid={err ? 'true' : undefined} aria-describedby={err ? 'tf-err' : undefined} />
    </label>
  );

  return (
    <section className="pr-form tf-card" aria-labelledby="tf-h">
      <div className="tf-head">
        <h2 id="tf-h">Two-factor sign-in</h2>
        <span className={'tf-state' + (enabled ? ' is-on' : '')}>{enabled ? 'On' : 'Off'}</span>
      </div>

      {step === 'codes' && codes ? <RecoveryCodes codes={codes.list} onDone={() => { flash?.(codes.done); setCodes(null); reset(); }} />
        : step === 'password' ? (
          <form className="tf-step" onSubmit={begin}>
            <p className="ca-note tf-lead">Enter your password to start. You need an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or 1Password.</p>
            {pwField()}
            {errBox}
            <div className="tf-actions"><button className="gs-btn primary" type="submit" disabled={busy || !pw}>{busy ? 'Working…' : 'Continue'}</button>{cancel}</div>
          </form>
        ) : step === 'scan' && setup ? (
          <form className="tf-step" onSubmit={confirm}>
            <p className="ca-note tf-lead">1. Scan this QR code with your authenticator app.</p>
            <div className="tf-scan">
              <QrCode uri={setup.uri} />
              <details className="tf-key"><summary>Can’t scan it? Type this key instead</summary><code>{setupKey(setup.uri)}</code></details>
            </div>
            <p className="ca-note tf-lead">2. Type the 6-digit code the app shows for Greatstone.</p>
            {codeField('Code from your app', 'digits')}
            {errBox}
            <div className="tf-actions"><button className="gs-btn primary" type="submit" disabled={busy || !code.trim()}>{busy ? 'Checking…' : 'Turn on'}</button>{cancel}</div>
          </form>
        ) : step === 'disable' ? (
          <form className="tf-step" onSubmit={turnOff}>
            <p className="ca-note tf-lead">To turn it off, enter your password and a new code from your app, or one of your recovery codes.</p>
            {pwField()}
            {codeField('Code from your app or a recovery code', 'any')}
            {errBox}
            <div className="tf-actions"><button className="gs-btn primary" type="submit" disabled={busy || !pw || !code.trim()}>{busy ? 'Working…' : 'Turn off two-factor sign-in'}</button>{cancel}</div>
          </form>
        ) : step === 'regen' ? (
          <form className="tf-step" onSubmit={regen}>
            <p className="ca-note tf-lead">New codes replace all your old recovery codes. Enter your password to continue.</p>
            {pwField()}
            {errBox}
            <div className="tf-actions"><button className="gs-btn primary" type="submit" disabled={busy || !pw}>{busy ? 'Working…' : 'Make new codes'}</button>{cancel}</div>
          </form>
        ) : enabled ? (
          <>
            <p className="ca-note tf-lead">Each sign-in asks for a code from your authenticator app. If you lose your phone, use a recovery code.</p>
            <div className="tf-actions">
              <button type="button" className="gs-btn ghost sm" onClick={() => setStep('regen')}>New recovery codes</button>
              <button type="button" className="gs-btn ghost sm" onClick={() => setStep('disable')}>Turn off</button>
            </div>
          </>
        ) : (
          <>
            <p className="ca-note tf-lead">Add a second step at sign-in: after your password, type a code from an authenticator app on your phone. Someone who learns your password still cannot sign in.</p>
            <div className="tf-actions"><button type="button" className="gs-btn primary sm" onClick={() => setStep('password')}>Turn on two-factor sign-in</button></div>
          </>
        )}
    </section>
  );
}
