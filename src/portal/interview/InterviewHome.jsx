/**
 * Welcome / consent screen, replicated from screen 1 of the signed-off
 * mockup. The 'interview-page' op resolves the verified caller email to an
 * employee in an active engagement before anything is shown.
 *
 * Port: source app/(portal)/interview/page.tsx. The server component's loader is the 'interview-page' op
 * (args { seats, consent } from the hash; data: { redirect } | { screen: 'no-match', email } |
 * { screen: 'welcome', isAdmin, seats, consent, … }); its redirects ('/interview/goodbye',
 * '/interview/complete', '/interview/session') arrive as hash redirects. The two <form action={serverAction}>
 * forms post their FormData fields as the op args: startConversation → 'start' { dataConsent, runMode },
 * declineParticipation → 'decline' {}. searchParams ?seats= and ?consent= ride on the hash. SignOutButton is
 * the website's signOut().
 */

import { useState } from 'react';
import { signOut } from '../../lib/better-auth-client.mjs';
import { GsLogo } from './GsLogo.jsx';
import { WaveDecoration } from './WaveDecoration.jsx';
import { Button, QuietLink } from './Button.jsx';
import { GlassCard } from './Card.jsx';
import { InterviewFooter, DotDivider } from './Footer.jsx';
import { pageFallback } from './PageStatus.jsx';
import { InterviewSignIn } from './InterviewSignIn.jsx';
import { usePageOp, useActionForm } from './usePageOp.mjs';

export default function InterviewHome({ route }) {
  const seats = route.query?.seats ?? null;
  const consent = route.query?.consent ?? null;
  const page = usePageOp('interview-page', { seats, consent });
  const fallback = pageFallback(page, InterviewSignIn);
  if (fallback) return fallback;
  const d = page.data ?? {};
  if (d.screen !== 'welcome') return <NoMatchScreen email={d.email ?? null} />;
  return <WelcomeScreen isAdmin={Boolean(d.isAdmin)} seats={d.seats ?? seats} consent={d.consent ?? consent} />;
}

function WelcomeScreen({ isAdmin, seats, consent }) {
  const [actionError, setActionError] = useState(null);
  const start = useActionForm('start', setActionError);
  const decline = useActionForm('decline', setActionError);

  return (
    <>
      <WaveDecoration position="top-right" />
      <main className="screen" aria-label="Welcome and consent">
        <div className="welcome-wrap">
          <GsLogo className="welcome-logo anim-up" />

          <div className="kicker anim-up d-1">Parallel Discovery Agent</div>
          <h1 className="anim-up d-2">
            A conversation about
            <br />
            your work
          </h1>
          <p className="welcome-lead anim-up d-3">
            Hello. I&rsquo;m Everest, a discovery agent built by{' '}
            <strong>Greatstone International</strong>. Your employer has asked
            us to learn how work really gets done here, so the slow and
            repetitive parts can be fixed. The honest way to learn that is to
            ask the people doing the work. That is you.
          </p>

          <div className="run-by anim-up d-4">
            <span className="run-chip">
              <svg viewBox="0 0 24 24">
                <path d="M3 21h18" />
                <path d="M5 21V7l7-4 7 4v14" />
                <path d="M9 21v-4h6v4" />
              </svg>
              Commissioned by your employer
            </span>
            <span className="run-chip">
              <svg viewBox="0 0 24 24">
                <path d="M12 3l8 6-2.5 11h-11L4 9z" />
              </svg>
              Run independently by Greatstone
            </span>
          </div>

          <GlassCard className="trust-card anim-up d-5">
            <div className="trust-title">
              <svg viewBox="0 0 24 24">
                <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z" />
              </svg>
              Who sees what
            </div>

            <div className="trust-row first">
              <div className="trust-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
              <div>
                <h3>Managers see themes and quotes, not transcripts</h3>
                <p>
                  They will never see a full transcript with your name on it.
                  Only the patterns across the whole team, and short quotes.
                </p>
              </div>
            </div>

            <div className="trust-row">
              <div className="trust-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M17 8l5 5" />
                  <path d="M22 8l-5 5" />
                </svg>
              </div>
              <div>
                <h3>Your name comes off any quote you choose</h3>
                <p>
                  Before anything is shared, you decide whether your words
                  carry your name or stay anonymous.
                </p>
              </div>
            </div>

            <div className="trust-row">
              <div className="trust-icon">
                <svg viewBox="0 0 24 24">
                  <polygon points="5 4 15 12 5 20 5 4" />
                  <line x1="19" y1="5" x2="19" y2="19" />
                </svg>
              </div>
              <div>
                <h3>Skip anything, or stop at any time</h3>
                <p>
                  No question is required. If you stop the conversation,
                  nothing you said is kept.
                </p>
              </div>
            </div>

            <div className="trust-row">
              <div className="trust-icon">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15.5 14" />
                </svg>
              </div>
              <div>
                <h3>About 25 minutes, at your pace</h3>
                <p>
                  You can leave and come back whenever you like. The
                  conversation waits for you.
                </p>
              </div>
            </div>
          </GlassCard>

          {seats === 'exhausted' ? (
            <div className="notice-card anim-up" role="status">
              <strong>All seats for this conversation round are taken.</strong>{' '}
              Nothing is wrong with your invitation; the round simply filled
              up. Your project lead can open more seats. Please try again a
              little later.
            </div>
          ) : null}

          {consent === 'required' ? (
            <div className="notice-card anim-up" role="status">
              <strong>Please tick the box to agree first.</strong> The
              conversation can only begin once you have agreed to your answers
              being recorded and stored for the analysis.
            </div>
          ) : null}

          {actionError ? (
            <div className="notice-card anim-up" role="alert">
              <strong>One moment.</strong> {actionError} Please try again.
            </div>
          ) : null}

          <div className="welcome-cta anim-up d-6">
            <form onSubmit={start.onSubmit}>
              {isAdmin ? (
                <fieldset className="run-mode">
                  <legend>Because you administer this engagement, is this a test?</legend>
                  <label className="run-mode-opt">
                    <input type="radio" name="runMode" value="test" defaultChecked />
                    <span>
                      <strong>Just testing the agent.</strong> This run is not saved to the
                      analysis.
                    </span>
                  </label>
                  <label className="run-mode-opt">
                    <input type="radio" name="runMode" value="save" />
                    <span>
                      <strong>Include my perspective.</strong> Save this conversation to the
                      analysis, alongside everyone else&rsquo;s.
                    </span>
                  </label>
                </fieldset>
              ) : null}
              <label className="consent-ack">
                <input type="checkbox" name="dataConsent" required />
                <span>
                  <strong>I agree to take part.</strong> I understand my
                  answers will be recorded and stored so that Greatstone can
                  prepare this analysis, and that I can skip anything and stop
                  and delete my conversation at any time.
                </span>
              </label>
              <Button type="submit" aria-disabled={start.pending || undefined}>
                Start the conversation
                <svg viewBox="0 0 24 24">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Button>
            </form>
            <form onSubmit={decline.onSubmit}>
              <QuietLink type="submit">I&rsquo;d rather not take part</QuietLink>
            </form>
            <p className="welcome-note">
              Choosing not to take part is completely fine, and no one is told
              either way.
            </p>
          </div>

          <DotDivider className="anim-up d-6" />

          <InterviewFooter borderless />
        </div>
      </main>
    </>
  );
}

/**
 * Branded screen for a signed-in email that matches no employee on any
 * active engagement.
 */
function NoMatchScreen({ email }) {
  return (
    <>
      <WaveDecoration position="top-right" />
      <main className="screen" aria-label="Invitation not recognised">
        <div className="welcome-wrap">
          <GsLogo className="welcome-logo anim-up" />

          <div className="kicker anim-up d-1">Parallel Discovery Agent</div>
          <h1 className="anim-up d-2">This invitation link doesn&rsquo;t match an active engagement</h1>
          <p className="welcome-lead anim-up d-3">
            {email ? (
              <>
                The email you signed in with, <strong>{email}</strong>, is not
                on the invitation list for any conversation that is currently
                running.
              </>
            ) : (
              <>
                We could not confirm the email you signed in with against any
                conversation that is currently running.
              </>
            )}{' '}
            If you were expecting to take part, your invitation may have been
            sent to a different address, or the engagement may have closed.
          </p>

          <div className="welcome-cta anim-up d-4">
            <Button variant="ghost" onClick={() => void signOut()}>
              Try a different email
            </Button>
            <p className="welcome-note">
              Think this is wrong? Email{' '}
              <a href="mailto:DX@greatstoneinternational.co.uk">DX@greatstoneinternational.co.uk</a>{' '}
              and we will sort it.
            </p>
          </div>

          <DotDivider className="anim-up d-5" />

          <InterviewFooter borderless />
        </div>
      </main>
    </>
  );
}
