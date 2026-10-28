/**
 * Port: the loading and failure states a server-rendered page never needed. Next streamed the page once its
 * loader finished (or showed its error boundary); the client loads after mount, so it holds the space while
 * waiting and offers a retry when a load fails. Copy in the source's voice.
 */

import { GsLogo } from './GsLogo.jsx';
import { Button } from './Button.jsx';
import { InterviewFooter } from './Footer.jsx';

export function PageLoading({ label = 'Loading' }) {
  return (
    <div className="gsi-loading" role="status" aria-live="polite">
      {label}…
    </div>
  );
}

export function PageError({ error, onRetry }) {
  return (
    <main className="screen" aria-label="Something went wrong">
      <div className="welcome-wrap">
        <GsLogo className="welcome-logo" />
        <div className="kicker">Parallel Discovery Agent</div>
        <h1>That did not load just now</h1>
        <p className="welcome-lead" role="alert">
          {error || 'Something went wrong on our side.'} Nothing you said has been lost.
        </p>
        <div className="welcome-cta">
          {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
          <p className="welcome-note">
            Still stuck? Email{' '}
            <a href="mailto:DX@greatstoneinternational.co.uk">DX@greatstoneinternational.co.uk</a> and we will
            sort it.
          </p>
        </div>
        <InterviewFooter borderless />
      </div>
    </main>
  );
}

/**
 * What a page shows before its data is ready: loading, a sign-in (the session ran out mid-visit), the
 * failure screen, or nothing while a redirect is being followed. Null once the data is ready.
 */
export function pageFallback(page, SignIn) {
  if (page.status === 'ready') return null;
  if (page.status === 'signed-out') return <SignIn onSignedIn={page.reload} />;
  if (page.status === 'error') return <PageError error={page.error} onRetry={page.reload} />;
  return <PageLoading />;
}
