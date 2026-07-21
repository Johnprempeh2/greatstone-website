// Websites & Web Apps archetype: the actual screen, in a frame you can resize.
//
// These twelve services all sell the same thing in the end: a screen that lets somebody do for themselves
// what they currently phone, email, queue or open a spreadsheet for. So the demo puts the visitor in front
// of that screen and lets them do the task. The frame carries the two claims prose cannot: it is a real
// browser page at a real address, and it works on a phone (switch the device and watch it hold up).
//
// The strip underneath names what the screen replaced, because that is the sale. The build target beside it
// is labelled a target, never a measurement, since nothing here is being timed.
import React, { useState } from 'react';
import { screenFor } from './web-content.mjs';
import Screen from './web-screens.jsx';

const DEVICES = [
  { id: 'desktop', label: 'Desktop' },
  { id: 'phone', label: 'Phone' },
];

export default function WebDemo({ svc }) {
  const screen = screenFor(svc);
  const [device, setDevice] = useState('desktop');
  if (!screen) return null;

  return (
    <div className="swd">
      <div className="sdemo-console">
        {/* browser chrome */}
        <div className="sdemo-bar swd-chrome">
          <span className="swd-lights" aria-hidden="true"><i /><i /><i /></span>
          <span className="swd-url">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            {screen.url}
          </span>
          <div className="swd-devices" role="group" aria-label="Preview size">
            {DEVICES.map((d) => (
              <button
                key={d.id} type="button" className={'swd-device' + (device === d.id ? ' is-on' : '')}
                aria-pressed={device === d.id} onClick={() => setDevice(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* the screen itself */}
        <div className={'swd-stage is-' + device}>
          <div className="swd-viewport">
            <Screen screen={screen} />
          </div>
        </div>

        {/* what it replaced, and what it is built to hit */}
        <div className="sdemo-ask swd-foot">
          <span className="swd-fact">
            <i>Replaces</i>
            <b>{screen.replaced}</b>
          </span>
          <span className="swd-fact is-target">
            <i>Build target</i>
            <b>{screen.target}</b>
          </span>
        </div>
      </div>

      <p className="sdemo-privacy">
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 2v6m0 8v6M2 12h6m8 0h6" /><circle cx="12" cy="12" r="3" />
        </svg>
        Yours to run: your domain, your data, and a handover so you can change it without us.
      </p>
    </div>
  );
}
