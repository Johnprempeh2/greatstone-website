// Intelligence & Reporting archetype.
//
// Nine services that all end in the same place: somebody reading a number and knowing what to do about it.
// Three kinds carry that (tiles you drill into, a list where every row shows its reason, a written edition
// that changes with its reader), and the frame puts the delivery promise underneath, because for this
// category "it arrives on its own, on a schedule" is half the product.
import React from 'react';
import { panelFor } from './intel-content.mjs';
import { DashScreen, ListScreen, BriefScreen } from './intel-screens.jsx';

const KINDS = { dash: DashScreen, list: ListScreen, brief: BriefScreen };

const CHANNEL = {
  dash: 'Live',
  list: 'Refreshed daily',
  brief: 'Scheduled',
};

export default function IntelDemo({ svc }) {
  const panel = panelFor(svc);
  if (!panel) return null;
  const Screen = KINDS[panel.kind];
  if (!Screen) return null;
  const data = panel[panel.kind];

  return (
    <div className="sir">
      <div className="sdemo-console">
        <div className="sdemo-bar">
          <span className="sdemo-dot" aria-hidden="true" />
          <span className="sdemo-name">{svc.name}</span>
          <span className="sdemo-chan">{CHANNEL[panel.kind]}</span>
        </div>

        <div className="sir-body">
          <Screen data={data} />
        </div>
      </div>

      <p className="sdemo-privacy">
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
        </svg>
        It arrives on its own. Nobody has to remember to build it, and it is current when you open it.
      </p>
    </div>
  );
}
