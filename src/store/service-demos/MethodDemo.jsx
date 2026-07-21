// The Method archetype.
//
// The last of the nine, and the only category that is not a tool: it is how the work starts and how it
// keeps running. The assessment is the flagship, and its one job is to prove it is a diagnostic rather
// than a brochure with your name on it, which it does by re-ranking the plan from your own answers.
//
// The eight pillars come from the live methodology explorer, not a parallel set.
import React from 'react';
import { methodFor } from './method-content.mjs';
import { AssessScreen, WorklogScreen, AdoptionScreen } from './method-screens.jsx';

const KINDS = { assess: AssessScreen, worklog: WorklogScreen, adoption: AdoptionScreen };
const CHANNEL = { assess: 'Diagnostic', worklog: 'Embedded', adoption: 'Week 12' };

export default function MethodDemo({ svc }) {
  const piece = methodFor(svc);
  if (!piece) return null;
  const Screen = KINDS[piece.kind];
  if (!Screen) return null;
  const data = piece[piece.kind];

  return (
    <div className="smt">
      <div className="sdemo-console">
        <div className="sdemo-bar">
          <span className="sdemo-dot" aria-hidden="true" />
          <span className="sdemo-name">{data.title}</span>
          <span className="sdemo-chan">{CHANNEL[piece.kind]}</span>
        </div>
        <div className="smt-body">
          <Screen data={data} />
        </div>
      </div>

      <p className="sdemo-privacy">
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 3 4 8v8l8 5 8-5V8z" /><path d="M12 12v9M12 12 4 8M12 12l8-4" />
        </svg>
        We do not hand you a report and leave. The assessment decides what gets built, and we run it after.
      </p>
    </div>
  );
}
