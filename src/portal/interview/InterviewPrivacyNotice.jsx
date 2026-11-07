/**
 * GRE-4303: the full interview privacy notice, the page behind "Read the full interview privacy notice" on the
 * welcome screen (#privacy/interviews; /privacy/interviews on the Next site). The words are
 * `src/portal/interview-notice-full.mjs` (the `privacy-notice` document on GRE-2639, revision 5).
 *
 * Public: anyone with the link can read it. A signed-in invitee sees their round's client name and dates, from
 * the read-only 'notice-page' op; everyone else sees "your organisation" and the rule, never a sign-in wall.
 */

import { Fragment, useEffect, useState } from 'react';
import { GsLogo } from './GsLogo.jsx';
import { WaveDecoration } from './WaveDecoration.jsx';
import { ButtonLink } from './Button.jsx';
import { InterviewFooter } from './Footer.jsx';
import { portalOp } from './api.mjs';
import { INTERVIEW_BASE, hrefFor } from './route.mjs';
import { fullInterviewNotice, inlineParts } from '../interview-notice-full.mjs';

export default function InterviewPrivacyNotice() {
  const [round, setRound] = useState({});
  useEffect(() => {
    let alive = true;
    portalOp('notice-page', {}).then(({ data }) => {
      if (alive && data?.clientName) setRound(data);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return <PrivacyNoticeScreen round={round} />;
}

// The email addresses and the ICO's site in the text become links; the words stay as they are.
const LINKS = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+|ico\.org\.uk)/;

function Inline({ text }) {
  return inlineParts(text).map((part, i) => {
    const bits = part.text.split(LINKS).map((bit, j) => {
      if (j % 2 === 0) return bit;
      const href = bit.includes('@') ? `mailto:${bit}` : 'https://ico.org.uk';
      return <a key={j} href={href}>{bit}</a>;
    });
    return part.strong ? <strong key={i}>{bits}</strong> : <Fragment key={i}>{bits}</Fragment>;
  });
}

function Item({ item }) {
  return (
    <li>
      <Inline text={item.text} />
      {item.items ? <ul>{item.items.map((sub) => <Item key={sub.text} item={sub} />)}</ul> : null}
      {item.after ? <p><Inline text={item.after} /></p> : null}
    </li>
  );
}

/** The page for one round's values (or none). Exported so the render test reads the same screen. */
export function PrivacyNoticeScreen({ round = {} }) {
  const notice = fullInterviewNotice(round);
  return (
    <>
      <WaveDecoration position="top-right" />
      <main className="screen" aria-labelledby="full-notice-title">
        <div className="welcome-wrap full-notice">
          <GsLogo className="welcome-logo" />
          <div className="kicker">Parallel Discovery Agent</div>
          <h1 id="full-notice-title">{notice.title}</h1>
          <article className="full-notice-body">
            {notice.blocks.map((block, i) => {
              if (block.type === 'h2') return <h2 key={i}>{block.text}</h2>;
              if (block.type === 'ul') return <ul key={i}>{block.items.map((item) => <Item key={item.text} item={item} />)}</ul>;
              return <p key={i}><Inline text={block.text} /></p>;
            })}
          </article>
          <div className="welcome-cta">
            <ButtonLink href={hrefFor(INTERVIEW_BASE)} variant="ghost">
              Back to the welcome page
            </ButtonLink>
          </div>
          <InterviewFooter borderless />
        </div>
      </main>
    </>
  );
}
