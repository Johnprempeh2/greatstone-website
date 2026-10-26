/**
 * The interview engine's interviewee pages on the website (GRE-2612): the router for #portal/interview… and
 * #join/<token>. App.jsx lazy-loads this and mounts it when parseInterviewHash (route.mjs) matches, ahead of
 * the client portal.
 *
 * Port: the source's Next.js (portal) route group sat behind its auth middleware. Here the gate is the website
 * account: signed out → the branded sign-in; signed in with an unverified email → "confirm your email";
 * otherwise the page. #join/<token> is public and handles sign-up / sign-in itself. Every page is keyed on
 * the full hash, so a redirect to a page re-runs its loader like a fresh server render did.
 */

import { useEffect, useState } from 'react';
import { getSession, onAuth } from '../../lib/better-auth-client.mjs';
import InterviewHome from './InterviewHome.jsx';
import InterviewSession from './InterviewSession.jsx';
import InterviewComplete from './InterviewComplete.jsx';
import InterviewGoodbye from './InterviewGoodbye.jsx';
import InterviewDiscarded from './InterviewDiscarded.jsx';
import InterviewResults from './InterviewResults.jsx';
import JoinPage from './JoinPage.jsx';
import { InterviewSignIn, VerifyEmailNotice } from './InterviewSignIn.jsx';
import { PageLoading } from './PageStatus.jsx';
import { GsLogo } from './GsLogo.jsx';
import { ButtonLink } from './Button.jsx';
import { InterviewFooter } from './Footer.jsx';
import { INTERVIEW_BASE } from './route.mjs';
import { isVerified } from './auth-model.mjs';
import './interview.css';

const PAGES = {
  home: InterviewHome,
  session: InterviewSession,
  complete: InterviewComplete,
  goodbye: InterviewGoodbye,
  discarded: InterviewDiscarded,
  results: InterviewResults,
};

function NotFound() {
  return (
    <main className="screen" aria-label="Page not found">
      <div className="welcome-wrap">
        <GsLogo className="welcome-logo" />
        <div className="kicker">Parallel Discovery Agent</div>
        <h1>That page isn&rsquo;t here</h1>
        <p className="welcome-lead">The link may be incomplete. Your conversation is safe.</p>
        <div className="welcome-cta">
          <ButtonLink href={INTERVIEW_BASE} variant="ghost">
            Back to the welcome page
          </ButtonLink>
        </div>
        <InterviewFooter borderless />
      </div>
    </main>
  );
}

/** The signed-in gate for #portal/interview… (not #join, which is public). */
function SignedIn({ children }) {
  const [session, setSession] = useState(undefined);
  const refresh = () => getSession().then((s) => setSession(s || null)).catch(() => setSession(null));
  useEffect(() => {
    refresh();
    // onAuth also re-checks on every window focus. A blip there must not tear down a live conversation (and
    // its microphone), so a "signed out" answer is confirmed once more before the page gives way.
    const { data } = onAuth((s) => {
      if (s) return setSession(s);
      setTimeout(refresh, 1500);
    });
    return () => data?.subscription?.unsubscribe?.();
  }, []);

  if (session === undefined) return <PageLoading label="Checking your account" />;
  if (!session) return <InterviewSignIn onSignedIn={refresh} />;
  if (!isVerified(session)) return <VerifyEmailNotice email={session.user?.email} />;
  return children;
}

export default function InterviewApp({ route }) {
  const hash = typeof location !== 'undefined' ? location.hash : '';
  let body;
  if (route.view === 'join') body = <JoinPage key={hash} route={route} />;
  else {
    const Page = PAGES[route.view];
    body = <SignedIn>{Page ? <Page key={hash} route={route} /> : <NotFound />}</SignedIn>;
  }
  return <div className="gs-interview gs-interview-page">{body}</div>;
}
