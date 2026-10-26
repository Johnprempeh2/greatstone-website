/**
 * Branded sign-in for signed-out visits to #portal/interview…, and the "confirm your email" screen for a
 * signed-in account whose email is not verified yet.
 *
 * Port: source app/sign-in/[[...sign-in]]/page.tsx + SignInForm.tsx, same shell and classes. The
 * signInWithPassword server action became the website's Better Auth signIn(); there is no redirect_url
 * because the hash route the person asked for is still in the address bar and re-renders once signed in.
 * The portal's AuthGate (src/store/AccountDashboard.jsx) is not reused: it is the store's account form and
 * provisions a store customer on sign-in, which an interviewee is not.
 */

import { useState } from 'react';
import { authClient, signIn, signOut } from '../../lib/better-auth-client.mjs';
import { GsLogo } from './GsLogo.jsx';
import { WaveDecoration } from './WaveDecoration.jsx';
import { InterviewFooter } from './Footer.jsx';
import { Button } from './Button.jsx';
import { isUnverifiedError, signInErrorMessage, verifyCallbackURL } from './auth-model.mjs';

const currentHash = () => (typeof location !== 'undefined' ? location.hash : '');

/** Send a fresh verification link that returns to this page. */
export async function resendVerification(email) {
  return authClient.sendVerificationEmail({ email: String(email || '').trim(), callbackURL: verifyCallbackURL(currentHash()) });
}

export function SignInForm({ onSignedIn, hint }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [unverified, setUnverified] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await signIn(email, password);
      if (res?.error) {
        setUnverified(isUnverifiedError(res.error));
        setError(signInErrorMessage(res.error));
        return;
      }
      onSignedIn?.();
    } catch {
      setError('Something went wrong. Please try again in a moment.');
    } finally {
      setPending(false);
    }
  };

  const resend = async () => {
    setPending(true);
    setError(null);
    const { error: err } = await resendVerification(email).catch(() => ({ error: true }));
    setPending(false);
    if (err) setError('Could not send a fresh link just now. Please try again in a moment.');
    else setNotice('A fresh confirmation link is on its way. Check your email (and spam).');
  };

  return (
    <form onSubmit={submit} className="signin-form">
      <label className="signin-field">
        <span>Email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          autoFocus
          disabled={pending}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="signin-field">
        <span>Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="Your password"
          required
          disabled={pending}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error ? (
        <p className="signin-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="signin-hint" role="status">
          {notice}
        </p>
      ) : null}
      <button type="submit" className="signin-submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      {unverified ? (
        <p className="signin-hint">
          <button type="button" className="join-linkbtn" onClick={() => void resend()} disabled={pending}>
            Send the confirmation link again
          </button>
        </p>
      ) : null}
      <p className="signin-hint">
        {hint ?? (
          <>
            Invited to a conversation? Open the link you were sent to create your account first. Lost it? Ask
            whoever invited you, or email{' '}
            <a href="mailto:DX@greatstoneinternational.co.uk">DX@greatstoneinternational.co.uk</a>.
          </>
        )}
      </p>
    </form>
  );
}

export function InterviewSignIn({ onSignedIn }) {
  return (
    <>
      <WaveDecoration position="top-right" />
      <main className="screen" aria-label="Sign in">
        <div className="welcome-wrap signin-wrap">
          <GsLogo className="welcome-logo anim-up" />

          <div className="kicker anim-up d-1">Parallel Discovery Agent</div>
          <h1 className="anim-up d-2">Sign in to continue</h1>
          <p className="welcome-lead anim-up d-3">Use the email address your invitation was sent to.</p>

          <div className="signin-card anim-up d-4">
            <SignInForm onSignedIn={onSignedIn} />
          </div>

          <InterviewFooter borderless />
        </div>
      </main>
    </>
  );
}

/** Signed in, but the email is not confirmed yet: the interview keys on the verified email, so say so. */
export function VerifyEmailNotice({ email }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const resend = async () => {
    setBusy(true);
    const { error } = await resendVerification(email).catch(() => ({ error: true }));
    setBusy(false);
    setNote(
      error
        ? 'Could not send a fresh link just now. Please try again in a moment.'
        : 'A fresh confirmation link is on its way. Check your email (and spam).'
    );
  };

  return (
    <>
      <WaveDecoration position="top-right" />
      <main className="screen" aria-label="Confirm your email">
        <div className="welcome-wrap signin-wrap">
          <GsLogo className="welcome-logo anim-up" />
          <div className="kicker anim-up d-1">Parallel Discovery Agent</div>
          <h1 className="anim-up d-2">Please confirm your email first</h1>
          <p className="welcome-lead anim-up d-3">
            We sent a confirmation link to <strong>{email}</strong>. Open it, and you will come straight back
            here. Your conversation is matched to your confirmed work email, so it can only begin once that is
            done.
          </p>
          <div className="welcome-cta anim-up d-4">
            <Button variant="ghost" disabled={busy} onClick={() => void resend()}>
              {busy ? 'Sending…' : 'Send the link again'}
            </Button>
            {note ? (
              <p className="welcome-note" role="status">
                {note}
              </p>
            ) : null}
            <button type="button" className="quiet-link" onClick={() => void signOut()}>
              Use a different account
            </button>
          </div>
          <InterviewFooter borderless />
        </div>
      </main>
    </>
  );
}
