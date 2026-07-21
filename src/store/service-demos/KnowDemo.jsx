// Meetings & Knowledge archetype.
//
// Six services, one spine: something that was going to evaporate becomes something you can retrieve. The
// three kinds are the three ways that happens, and each one is wired for real rather than mimed. The
// provenance links resolve, the permissions change the answer, and the rollups recompute.
import React from 'react';
import { knowFor } from './know-content.mjs';
import { ExtractScreen, AskScreen, WorkspaceScreen } from './know-screens.jsx';

const KINDS = { extract: ExtractScreen, ask: AskScreen, workspace: WorkspaceScreen };
const CHANNEL = { extract: 'From the room', ask: 'Private index', workspace: 'One record' };

export default function KnowDemo({ svc }) {
  const piece = knowFor(svc);
  if (!piece) return null;
  const Screen = KINDS[piece.kind];
  if (!Screen) return null;
  const data = piece[piece.kind];

  return (
    <div className="skn">
      <div className="sdemo-console">
        <div className="sdemo-bar">
          <span className="sdemo-dot" aria-hidden="true" />
          <span className="sdemo-name">{svc.name}</span>
          <span className="sdemo-chan">{CHANNEL[piece.kind]}</span>
        </div>
        <div className="skn-body">
          <Screen data={data} />
        </div>
      </div>

      <p className="sdemo-privacy">
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        Your material stays yours. Nothing here trains a public model, and answers respect the permissions you already have.
      </p>
    </div>
  );
}
