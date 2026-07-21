// Service demo framework: gives a service its interactive prototype.
//
// WHY A SYSTEM, NOT 78 ONE-OFFS. The catalogue has 78 services across 9 categories. Hand-building a
// bespoke demo for each would be unmaintainable and would drift in quality. Instead each CATEGORY gets one
// archetype that shows how that kind of work actually behaves, and every archetype is parameterised by the
// service (its own copy, its own script) so it reads as specific rather than generic.
//
// Archetypes are lazy: a category's demo module is only fetched when a visitor opens a service in that
// category, so the public critical path never carries any of them. A category with no archetype yet simply
// renders nothing (no empty frame, no placeholder), so this ships safely one archetype at a time.
import React, { Suspense, lazy } from 'react';
import './service-demos.css';

// category -> archetype. Add a category here as its archetype lands.
const ARCHETYPES = {
  'AI Agents & Assistants': lazy(() => import('./AgentDemo.jsx')),
  'Automation & Integration': lazy(() => import('./FlowDemo.jsx')),
  'Websites & Web Apps': lazy(() => import('./WebDemo.jsx')),
  'Brand, Content & Media': lazy(() => import('./BrandDemo.jsx')),
  'Intelligence & Reporting': lazy(() => import('./IntelDemo.jsx')),
  'Commerce & Storefronts': lazy(() => import('./ShopDemo.jsx')),
  'Meetings & Knowledge': lazy(() => import('./KnowDemo.jsx')),
  'Comms Channels': lazy(() => import('./CommsDemo.jsx')),
  'The Method': lazy(() => import('./MethodDemo.jsx')),
};

// What the demo is called on the page, per category. Kept beside the registry so the framing copy and the
// component always move together.
const FRAMING = {
  'AI Agents & Assistants': {
    heading: 'See it answer',
    lead: 'A working prototype of the assistant. Pick a question and watch it answer from its sources.',
    note: 'The questions, answers and sources are samples, not live data.',
  },
  'Automation & Integration': {
    heading: 'Watch it run',
    lead: 'One pass of the automation, end to end. Nobody starts it, and it does not forget.',
    note: 'The steps, details and time figures are a typical case, not live data.',
  },
  'Websites & Web Apps': {
    heading: 'Use it',
    lead: 'The screen this service builds, working. Do the thing it exists for, and switch it to a phone.',
    note: 'The records, names and numbers on screen are invented for the demonstration.',
  },
  'Brand, Content & Media': {
    heading: 'Watch it work',
    lead: 'Craft you can put your hands on, and production you can count. Both are running here, not recorded.',
    note: 'The motion and the generated art are real and running now. The written pieces are samples.',
  },
  'Intelligence & Reporting': {
    heading: 'Read it',
    lead: 'Numbers that explain themselves. Open any figure and the sentence saying what moved, and why, is already there.',
    note: 'The figures, names and commentary are invented for the demonstration.',
  },
  'Commerce & Storefronts': {
    heading: 'Buy something',
    lead: 'The whole way through: choose, price it, pay, and see what the payment produced. Nothing is charged.',
    note: 'A working checkout with no payment behind it. The catalogue and prices are invented; the arithmetic is real.',
  },
  'Meetings & Knowledge': {
    heading: 'Find it again',
    lead: 'What was said, what was decided, and why. Turned into something you can retrieve months later.',
    note: 'The transcripts, policies and decisions are invented. The wiring is real: provenance resolves, permissions change the answer, rollups recompute.',
  },
  'Comms Channels': {
    heading: 'Send it',
    lead: 'Compose once, reach people on the channel they actually use, and get proof it landed.',
    note: 'Nothing is sent from this page. The rosters and messages are invented; the counts and the cascade are computed.',
  },
  'The Method': {
    heading: 'What it produces',
    lead: 'These are engagements rather than tools, so the prototype shows what actually lands: the work done on the days it was done, and whether it stuck.',
    note: 'The logs and figures are invented for the demonstration.',
  },
};

const DEFAULT_NOTE = 'The content shown is a sample, not live data.';

// Services that deliberately have NO prototype.
//
// Not everything should have one. A prototype has to do the service justice, and for a deep consultative
// engagement a few clicks makes the work look smaller than it is: a five-question form reads as a lead-gen
// quiz, not as a structured walkthrough of an entire operating week. Underselling is worse than silence, so
// these render no demo section at all rather than a toy version of themselves.
const NO_DEMO = new Set([
  '8-pillar-digital-assessment',      // a walkthrough of the whole operating week; no form does that justice
  'operations-command-centre-build',  // assessment-led, so it inherits the same problem
  'website-audit-rebuild',            // a real audit measures the site; a self-scored quiz is not an audit
]);

export function hasServiceDemo(svc) {
  if (!svc || NO_DEMO.has(svc.slug)) return false;
  return !!ARCHETYPES[svc.category];
}

// The consistent frame every archetype sits in: heading, one line of framing, the prototype, and an honest
// label. The label matters. This is a marketing page, and the panel must never read as live customer data.
export default function ServiceDemo({ svc }) {
  if (!hasServiceDemo(svc)) return null;
  const Archetype = ARCHETYPES[svc.category];
  const framing = FRAMING[svc.category] || { heading: 'See it working', lead: '' };

  return (
    <section className="sp-section sdemo-section" aria-labelledby="sdemo-h">
      <div className="sdemo-head">
        <h2 id="sdemo-h">{framing.heading}</h2>
        <span className="sdemo-tag">Interactive prototype</span>
      </div>
      {framing.lead ? <p className="sdemo-lead">{framing.lead}</p> : null}
      <Suspense fallback={<div className="sdemo-loading" role="status">Loading the prototype…</div>}>
        <Archetype svc={svc} />
      </Suspense>
      <p className="sdemo-note">
        A prototype built to show how the service behaves. {framing.note || DEFAULT_NOTE}
      </p>
    </section>
  );
}
