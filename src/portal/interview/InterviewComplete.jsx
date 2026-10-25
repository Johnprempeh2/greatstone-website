/**
 * The sign-off screen. The participant is deliberately NOT shown a read-back of
 * what was captured. An end-of-interview summary handed to the participant is
 * not useful to them and can put people off; any feedback belongs on the
 * Greatstone side, after the whole engagement is synthesised and a person has
 * reviewed it. So this screen is a warm close plus the two consent choices (how
 * their words can be used), and nothing more.
 *
 * Port: source app/(portal)/interview/complete/page.tsx (+ signoff.css, now in interview.css). Its loader
 * (getSignOffContext + loadConsentState) is the 'signoff-page' op: data { redirect } when nothing has ended
 * yet (the same '/interview/goodbye' | '/interview/session' | '/interview' choice the page made), else
 * { sessionId, initialAttribution: 'named' | 'anonymised', initialMemory: boolean } (safe defaults: anonymised,
 * false).
 */

import { GsLogo } from './GsLogo.jsx';
import { WaveDecoration } from './WaveDecoration.jsx';
import { SignOffPanel } from './SignOffPanel.jsx';
import { InterviewFooter } from './Footer.jsx';
import { pageFallback } from './PageStatus.jsx';
import { InterviewSignIn } from './InterviewSignIn.jsx';
import { usePageOp } from './usePageOp.mjs';

export default function InterviewComplete() {
  const page = usePageOp('signoff-page', {});
  const fallback = pageFallback(page, InterviewSignIn);
  if (fallback) return fallback;
  const { sessionId, initialAttribution, initialMemory } = page.data;

  return (
    <>
      <WaveDecoration position="top-right" />
      <main className="screen" aria-label="Sign-off">
        <div className="signoff-wrap">
          <GsLogo className="signoff-logo anim-up" />

          <div className="signoff-head">
            <div className="kicker anim-up d-1">Before you go</div>
            <h1 className="anim-up d-2">Thank you, that is really helpful</h1>
            <p className="anim-up d-3">
              Just two last things about how your words can be used. Nothing you
              said is shared with anyone until the Greatstone team has been
              through the whole picture properly.
            </p>
          </div>

          <SignOffPanel
            sessionId={sessionId}
            initialAttribution={initialAttribution === 'named' ? 'named' : 'anonymised'}
            initialMemory={initialMemory === true}
          />

          <InterviewFooter />
        </div>
      </main>
    </>
  );
}
