// Comms Channels archetype.
//
// Five services, one spine: a message leaves your building, finds people on the channel they actually use,
// and comes back with proof it landed. The proof is the product, so every kind here ends in a number that
// was computed rather than asserted.
import React from 'react';
import { commsFor } from './comms-content.mjs';
import { BroadcastScreen, ThreadScreen, EventScreen } from './comms-screens.jsx';

const KINDS = { broadcast: BroadcastScreen, thread: ThreadScreen, event: EventScreen };
const CHANNEL = { broadcast: 'Compose once', thread: 'WhatsApp', event: 'On the door' };

export default function CommsDemo({ svc }) {
  const piece = commsFor(svc);
  if (!piece) return null;
  const Screen = KINDS[piece.kind];
  if (!Screen) return null;
  const data = piece[piece.kind];

  return (
    <div className="scm">
      <div className="sdemo-console">
        <div className="sdemo-bar">
          <span className="sdemo-dot" aria-hidden="true" />
          <span className="sdemo-name">{data.title}</span>
          <span className="sdemo-chan">{CHANNEL[piece.kind]}</span>
        </div>
        {data.context ? <p className="scm-context">{data.context}</p> : null}
        <div className="scm-body">
          <Screen data={data} />
        </div>
      </div>

      <p className="sdemo-privacy">
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5a8.4 8.4 0 0 1-.9-3.9 8.4 8.4 0 0 1 8.4-9 8.4 8.4 0 0 1 8.6 8.4z" />
        </svg>
        Nothing is sent from this page. No number is dialled and no list is touched.
      </p>
    </div>
  );
}
