/**
 * The kind, branded goodbye screen shown after declining to take part.
 * A one-click "changed my mind" path reverses the decline without anyone
 * having to email Greatstone and wait for a manual status flip.
 *
 * Port: source app/(portal)/interview/goodbye/page.tsx. <form action={rejoinAfterDecline}> posts the
 * 'rejoin' op ({} args) and follows its redirect to #portal/interview.
 */

import { useState } from 'react';
import { GsLogo } from './GsLogo.jsx';
import { WaveDecoration } from './WaveDecoration.jsx';
import { Button } from './Button.jsx';
import { InterviewFooter, DotDivider } from './Footer.jsx';
import { useActionForm } from './usePageOp.mjs';

export default function InterviewGoodbye() {
  const [actionError, setActionError] = useState(null);
  const rejoin = useActionForm('rejoin', setActionError);

  return (
    <>
      <WaveDecoration position="top-right" />
      <main className="screen" aria-label="Thanks all the same">
        <div className="welcome-wrap">
          <GsLogo className="welcome-logo anim-up" />

          <div className="kicker anim-up d-1">Parallel Discovery Agent</div>
          <h1 className="anim-up d-2">
            That&rsquo;s completely fine.
            <br />
            Thank you for letting us know.
          </h1>
          <p className="welcome-lead anim-up d-3">
            You&rsquo;ve chosen not to take part, and no one is told either
            way. Nothing has been recorded about you beyond that choice, and
            you won&rsquo;t be chased or reminded.
          </p>
          <p className="welcome-lead anim-up d-4">
            Changed your mind? You can still take part &mdash; nothing is
            locked in. Or if anything here felt unclear, email{' '}
            <a href="mailto:DX@greatstoneinternational.co.uk">DX@greatstoneinternational.co.uk</a>{' '}
            and we will sort it.
          </p>

          <div className="welcome-cta anim-up d-4">
            <form onSubmit={rejoin.onSubmit}>
              <Button variant="ghost" type="submit" aria-disabled={rejoin.pending || undefined}>
                Actually, I&rsquo;d like to take part
                <svg viewBox="0 0 24 24">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Button>
            </form>
            {actionError ? (
              <p className="welcome-note" role="alert">
                {actionError} Please try again.
              </p>
            ) : null}
          </div>

          <DotDivider className="anim-up d-5" />

          <InterviewFooter borderless />
        </div>
      </main>
    </>
  );
}
