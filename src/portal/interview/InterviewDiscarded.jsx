/**
 * The branded "nothing was kept" screen shown after stop-and-discard. The
 * session, every message and every extracted note were hard-deleted before
 * this page rendered, and the invitation stays open if they want to return.
 *
 * Port: source app/(portal)/interview/discarded/page.tsx; ButtonLink href '/interview' → the interview hash.
 */

import { GsLogo } from './GsLogo.jsx';
import { WaveDecoration } from './WaveDecoration.jsx';
import { ButtonLink } from './Button.jsx';
import { InterviewFooter } from './Footer.jsx';
import { INTERVIEW_BASE } from './route.mjs';

export default function InterviewDiscarded() {
  return (
    <>
      <WaveDecoration position="top-right" />
      <main className="screen" aria-label="Conversation discarded">
        <div className="welcome-wrap">
          <GsLogo className="welcome-logo anim-up" />

          <div className="kicker anim-up d-1">Parallel Discovery Agent</div>
          <h1 className="anim-up d-2">Done. Nothing was kept.</h1>
          <p className="welcome-lead anim-up d-3">
            The whole conversation has been deleted — every message, every
            note. Nothing you said will be used, shared or summarised, and no
            one is told you stopped.
          </p>
          <p className="welcome-lead anim-up d-4">
            Your invitation stays open. If you ever feel like picking it up
            again, your link still works and the conversation starts
            completely fresh.
          </p>

          <div className="welcome-cta anim-up d-5">
            <ButtonLink href={INTERVIEW_BASE} variant="ghost">
              Back to the welcome page
            </ButtonLink>
            <p className="welcome-note">
              Questions about any of this? Email{' '}
              <a href="mailto:DX@greatstoneinternational.co.uk">DX@greatstoneinternational.co.uk</a>{' '}
              and we will sort it.
            </p>
          </div>

          <InterviewFooter borderless />
        </div>
      </main>
    </>
  );
}
