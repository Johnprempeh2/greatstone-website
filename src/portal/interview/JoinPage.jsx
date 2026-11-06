/**
 * Public self-serve enrolment page for a shareable #join/<token> link.
 *
 * Not behind the sign-in, so a brand-new person can reach it. It validates the token server-side and either
 * shows the branded join card or an honest "not active" screen.
 *
 * Port: source app/join/[token]/page.tsx + JoinForm.tsx. What changed, and why (docs/INTERVIEW-ENGINE.md
 * "Identity and enrolment"): the website account is the only way in, and the VERIFIED email is the join key.
 *   - The page's token lookup is `POST /api/interview/join { op: 'info', token, team? }` → { data: { valid,
 *     expired, clientName, domains, team, teams: [{ id, name }] } } (public, no personal data). ?team=<unitId>
 *     is honoured exactly as before: only when it is a real team of this round (`team`, resolved server-side).
 *   - The source enrol() created the account itself (typed email + password). Here the person first signs up
 *     (Better Auth sends a verification email that returns them to this link) or signs in, and only then
 *     enrols: `{ op: 'enrol', token, name, unitId? }` → { data: { ok, message, redirect? } }. On success the
 *     browser goes to the redirect, or #portal/interview.
 *   - logInFromJoin() is the website's signIn().
 * Copy, states, the team picker and the domain hint are the source's. The inline styles became classes in
 * interview.css (join-*) so the site's tokens apply.
 */

import { useEffect, useState } from 'react';
import { authClient, getSession, onAuth, signIn, signOut, notifyAuthChange } from '../../lib/better-auth-client.mjs';
import { GsLogo } from './GsLogo.jsx';
import { WaveDecoration } from './WaveDecoration.jsx';
import { Button } from './Button.jsx';
import { InterviewFooter } from './Footer.jsx';
import { PageLoading, PageError } from './PageStatus.jsx';
import { joinOp, navigate, redirectOf } from './api.mjs';
import { INTERVIEW_BASE } from './route.mjs';
import { domainHint as hintFor, teamUnitFor } from './model.mjs';
import {
  MIN_PASSWORD, isVerified, isUnverifiedError, isExistingAccountError, signInErrorMessage, signUpErrorMessage,
  verifyCallbackURL,
} from './auth-model.mjs';
import { resendVerification } from './InterviewSignIn.jsx';

const joinHash = (token, unitId) => `#join/${token}${unitId ? `?team=${encodeURIComponent(unitId)}` : ''}`;

export default function JoinPage({ route }) {
  const token = route.token;
  const [info, setInfo] = useState({ status: 'loading' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setInfo({ status: 'loading' });
    joinOp('info', { token, team: route.unitId || undefined }).then(({ data, error }) => {
      if (!alive) return;
      setInfo(error ? { status: 'error', error } : { status: 'ready', data: data ?? {} });
    });
    return () => {
      alive = false;
    };
  }, [token, route.unitId, tick]);

  if (info.status === 'loading') return <PageLoading />;
  if (info.status === 'error') return <PageError error={info.error} onRetry={() => setTick((t) => t + 1)} />;

  const eng = info.data;
  const teams = eng.teams ?? [];
  // Optional team-targeted link (?team=<unitId>): honoured only when it is a
  // real team of THIS engagement; anything else silently falls back to the
  // company-wide join (the enrol op re-validates server-side regardless).
  const teamUnit = eng.team ?? teamUnitFor(teams, route.unitId);

  if (!eng.valid) {
    return (
      <>
        <WaveDecoration position="top-right" />
        <main className="screen" aria-label="Invitation link not active">
          <div className="welcome-wrap signin-wrap">
            <GsLogo className="welcome-logo anim-up" />
            <div className="kicker anim-up d-1">Parallel Discovery Agent</div>
            <h1 className="anim-up d-2">This invitation link isn&rsquo;t active</h1>
            <p className="welcome-lead anim-up d-3">
              {eng.expired
                ? 'This link has expired. Please ask whoever shared it for a fresh one.'
                : 'We couldn’t find an active conversation for this link. Please double-check the full link, or ask whoever shared it.'}
            </p>
            <InterviewFooter borderless />
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <WaveDecoration position="top-right" />
      <main className="screen" aria-label="Join the conversation">
        <div className="welcome-wrap signin-wrap">
          <GsLogo className="welcome-logo anim-up" />
          <div className="kicker anim-up d-1">Parallel Discovery Agent</div>
          <h1 className="anim-up d-2">
            {teamUnit
              ? `Join the ${teamUnit.name} conversation at ${eng.clientName}`
              : `Join the conversation at ${eng.clientName}`}
          </h1>
          <p className="welcome-lead anim-up d-3">
            A short, confidential conversation about how your work really gets done, run
            independently by Greatstone. Create your account and you can start straight away.
          </p>
          <div className="signin-card anim-up d-4">
            <JoinForm
              token={token}
              domains={eng.domains ?? []}
              unitId={teamUnit?.id ?? null}
              teams={teamUnit ? [] : teams}
            />
          </div>
          <InterviewFooter borderless />
        </div>
      </main>
    </>
  );
}

/**
 * The company auth card: a typical Sign up / Log in pair on the branded join page, then the enrol step once
 * the website account is signed in with a verified email.
 */
function JoinForm({ token, domains, unitId, teams = [] }) {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    getSession().then((s) => setSession(s || null)).catch(() => setSession(null));
    const { data } = onAuth((s) => setSession(s || null));
    return () => data?.subscription?.unsubscribe?.();
  }, []);

  // Ask for a team only on the one-company link (not a team-targeted link) and
  // only once teams exist. The FIRST person signs up before any teams do, so
  // they never see this — they become the admin who creates the teams.
  const showTeamPicker = !unitId && teams.length > 0;
  const domainHint = hintFor(domains);

  if (session === undefined) return <p className="welcome-note" role="status">Checking your account…</p>;
  if (!session) return <AccountStep token={token} unitId={unitId} domainHint={domainHint} />;
  if (!isVerified(session)) return <VerifyStep email={session.user?.email} />;
  return (
    <EnrolStep
      token={token}
      unitId={unitId}
      teams={teams}
      showTeamPicker={showTeamPicker}
      user={session.user}
      domainHint={domainHint}
    />
  );
}

/** Signed out: create a website account (verification email) or log in. */
function AccountStep({ token, unitId, domainHint }) {
  const [mode, setMode] = useState('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [sentTo, setSentTo] = useState(null);
  const [unverified, setUnverified] = useState(false);

  const submitSignup = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Port: Better Auth sends the verification email; its link returns to this join link.
      const r = await authClient.signUp.email({
        email: email.trim(),
        password,
        name: name.trim() || email.trim(),
        callbackURL: verifyCallbackURL(joinHash(token, unitId)),
      });
      if (r?.error) {
        if (isExistingAccountError(r.error)) {
          // Flip to Log in, keep their email, nudge with a friendly note.
          setMode('login');
          setPassword('');
          setNotice(signUpErrorMessage(r.error));
          return;
        }
        setError(signUpErrorMessage(r.error));
        return;
      }
      if (r?.data?.token || r?.data?.session) {
        notifyAuthChange(); // verification not required on this deployment: signed in already
        return;
      }
      setSentTo(email.trim());
    } catch {
      setError('Something went wrong. Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const submitLogin = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await signIn(email, password);
      if (r?.error) {
        setUnverified(isUnverifiedError(r.error));
        setError(signInErrorMessage(r.error));
      }
      // Success: onAuth refreshes the session and the enrol step takes over.
    } catch {
      setError('Something went wrong. Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const resend = async (to) => {
    setBusy(true);
    setError(null);
    const { error: err } = await resendVerification(to).catch(() => ({ error: true }));
    setBusy(false);
    if (err) setError('Could not send a fresh link just now. Please try again in a moment.');
    else setNotice('A fresh confirmation link is on its way. Check your email (and spam).');
  };

  if (sentTo) {
    return (
      <div className="join-form">
        <div className="notice-card" role="status" style={{ textAlign: 'left' }}>
          <strong>Account created.</strong> We have sent a confirmation link to {sentTo}. Open it and you will
          come straight back here to start your conversation.
        </div>
        {notice ? <p className="welcome-note" role="status">{notice}</p> : null}
        {error ? <p role="alert" className="join-error">{error}</p> : null}
        <p className="join-toggle">
          Nothing arrived?{' '}
          <button type="button" className="join-linkbtn" disabled={busy} onClick={() => void resend(sentTo)}>
            Send it again
          </button>
        </p>
      </div>
    );
  }

  if (mode === 'login') {
    return (
      <form onSubmit={submitLogin} className="join-form">
        {notice ? (
          <div className="notice-card" role="status" style={{ textAlign: 'left', marginBottom: 16, marginTop: 0 }}>
            {notice}
          </div>
        ) : null}
        <label className="join-field">
          Your work email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            required
            disabled={busy}
          />
        </label>
        <label className="join-field">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            disabled={busy}
          />
        </label>

        {error ? (
          <p role="alert" className="join-error">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={busy}>
          {busy ? 'Logging you in…' : 'Log in'}
        </Button>

        {unverified ? (
          <p className="join-toggle">
            <button type="button" className="join-linkbtn" disabled={busy} onClick={() => void resend(email)}>
              Send the confirmation link again
            </button>
          </p>
        ) : null}

        <p className="join-toggle">
          New here?{' '}
          <button
            type="button"
            className="join-linkbtn"
            onClick={() => {
              setMode('signup');
              setError(null);
              setNotice(null);
            }}
          >
            Create an account
          </button>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={submitSignup} className="join-form">
      <label className="join-field">
        Your name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
          disabled={busy}
        />
      </label>
      <label className="join-field">
        Your work email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          required
          disabled={busy}
        />
      </label>
      <label className="join-field">
        Choose a password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          placeholder="At least 8 characters"
          required
          disabled={busy}
        />
      </label>

      {error ? (
        <p role="alert" className="join-error">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={busy}>
        {busy ? 'Creating your account…' : 'Create account and start'}
      </Button>

      <p className="join-toggle">
        Already have an account?{' '}
        <button
          type="button"
          className="join-linkbtn"
          onClick={() => {
            setMode('login');
            setError(null);
            setName('');
            setPassword('');
          }}
        >
          Log in
        </button>
      </p>

      {domainHint ? (
        <p className="welcome-note" style={{ marginTop: 12 }}>
          {domainHint} Choosing to take part is up to you, and no one is told either way.
        </p>
      ) : null}
    </form>
  );
}

/** Signed in with an unconfirmed email: the join key is the verified email, so say so and offer a resend. */
function VerifyStep({ email }) {
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
    <div className="join-form">
      <div className="notice-card" role="status" style={{ textAlign: 'left', marginTop: 0 }}>
        <strong>Please confirm your email first.</strong> We sent a link to {email}. Open it and you will come
        straight back here to start.
      </div>
      {note ? <p className="welcome-note" role="status">{note}</p> : null}
      <p className="join-toggle">
        <button type="button" className="join-linkbtn" disabled={busy} onClick={() => void resend()}>
          Send the link again
        </button>{' '}
        ·{' '}
        <button type="button" className="join-linkbtn" onClick={() => void signOut()}>
          Use a different account
        </button>
      </p>
    </div>
  );
}

/** Signed in and verified: enrol this account in the round, then start. */
function EnrolStep({ token, unitId, teams, showTeamPicker, user, domainHint }) {
  const [name, setName] = useState(user?.name && user.name !== user.email ? user.name : '');
  const [teamId, setTeamId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const chosenUnit = unitId ?? (showTeamPicker ? teamId : undefined);
      const { data, error } = await joinOp('enrol', { token, name: name.trim(), unitId: chosenUnit || undefined });
      if (error) {
        setResult({ ok: false, message: error });
        return;
      }
      if (data?.ok) {
        setResult(data);
        navigate(redirectOf(data) ?? INTERVIEW_BASE);
        return;
      }
      setResult({ ok: false, message: data?.message ?? 'Something went wrong. Please try again in a moment.' });
    } catch {
      setResult({ ok: false, message: 'Something went wrong. Please try again in a moment.' });
    } finally {
      setBusy(false);
    }
  };

  // Terminal success state (we already navigated; fallback copy).
  if (result?.ok) {
    return (
      <div className="notice-card" role="status" style={{ textAlign: 'left' }}>
        <strong>You&rsquo;re in.</strong> {result.message}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="join-form">
      <p className="welcome-note" style={{ marginTop: 0, marginBottom: 16, maxWidth: 'none' }}>
        Signed in as <strong>{user?.email}</strong>.{' '}
        <button type="button" className="join-linkbtn" onClick={() => void signOut()}>
          Not you?
        </button>
      </p>
      <label className="join-field">
        Your name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
          disabled={busy}
        />
      </label>
      {showTeamPicker ? (
        <label className="join-field">
          Your team
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} required disabled={busy}>
            <option value="" disabled>
              Select your team…
            </option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {result && !result.ok ? (
        <p role="alert" className="join-error">
          {result.message}
        </p>
      ) : null}

      <Button type="submit" disabled={busy}>
        {busy ? 'Setting you up…' : 'Join and start'}
      </Button>

      {domainHint ? (
        <p className="welcome-note" style={{ marginTop: 12 }}>
          {domainHint} Choosing to take part is up to you, and no one is told either way.
        </p>
      ) : null}
    </form>
  );
}
