/**
 * The warm completion card from mockup screen 3's final section: the lime
 * check, thanks, and the plain-words next steps (including the
 * change-your-mind email). Pure presentation — the sign-off panel reveals it
 * after "Confirm and finish".
 *
 * Port: source components/CompletionCard.tsx. next/link to '/' became a plain hash link to the portal home.
 */

import { PORTAL_HOME_HASH } from './route.mjs';

export function CompletionCard() {
  return (
    <div className="complete-card">
      <div className="complete-check">
        <svg viewBox="0 0 24 24">
          <path d="M22 11.1V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>
      <h2>That&rsquo;s everything. Thank you.</h2>
      <p>
        You have just helped shape how the boring parts of the job get fixed.
        Here is what happens next.
      </p>
      <div className="next-steps">
        <div className="next-step">
          <svg viewBox="0 0 24 24">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <p>
            Your summary joins everyone else&rsquo;s, and the patterns across
            the team get drawn out.
          </p>
        </div>
        <div className="next-step">
          <svg viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <p>
            The themes are shared with your team in about two weeks, in plain
            words.
          </p>
        </div>
        <div className="next-step">
          <svg viewBox="0 0 24 24">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22 6 12 13 2 6" />
          </svg>
          <p>
            Change your mind about anything above? Email{' '}
            <a href="mailto:DX@greatstoneinternational.co.uk">
              DX@greatstoneinternational.co.uk
            </a>{' '}
            and we will sort it.
          </p>
        </div>
      </div>
      <a href={PORTAL_HOME_HASH} className="btn btn-primary" style={{ marginTop: '24px' }}>
        Back to your portal
      </a>
    </div>
  );
}
