// The Method archetype.
//
// The only category that is not a tool: it is how the work starts and how it keeps running.
//
// Three of its six services have NO prototype (see NO_DEMO in index.jsx). The 8-pillar assessment, the
// command-centre build and the website audit are consultative engagements, and a few clicks would make
// them look like a quiz. The three that remain each produce a concrete artefact the catalogue already
// promises, so showing that artefact is fair rather than reductive.
import React from 'react';
import { methodFor } from './method-content.mjs';
import { WorklogScreen, AdoptionScreen } from './method-screens.jsx';

const KINDS = { worklog: WorklogScreen, adoption: AdoptionScreen };
const CHANNEL = { worklog: 'Embedded', adoption: 'Since launch' };

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
        We do not hand you a report and leave. We build what the assessment found, and then we run it.
      </p>
    </div>
  );
}
