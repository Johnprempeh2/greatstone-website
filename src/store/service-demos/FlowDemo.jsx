// Automation & Integration archetype: a workflow you can actually run.
//
// The pitch for automation is hard to feel in prose ("it runs on its own"). So this shows it: press Run,
// the trigger fires without anyone touching it, work moves through each step with a concrete detail, and
// the end states what it just gave back. The time figures are the argument, so they are shown as a
// comparison (a person's minutes vs the automation's seconds) rather than a vague claim.
//
// Honest by construction: scripted from flow-content.mjs, no network call, labelled a prototype with
// sample numbers by the frame in index.jsx.
// A11y: progress is announced through an aria-live status line, each step carries its state in text (not
// colour alone), the run control is a real button, and reduced motion collapses the run to its end state.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { flowFor, hoursSaved } from './flow-content.mjs';

const prefersReduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const STEP_MS = 780;

export default function FlowDemo({ svc }) {
  const flow = flowFor(svc);
  // -1 idle, 0..n-1 running that step, n done (n = steps + trigger + outcome handled via index maths)
  const [at, setAt] = useState(-1);
  const [done, setDone] = useState(false);
  const timers = useRef([]);

  const clearTimers = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
  useEffect(() => clearTimers, [clearTimers]);

  if (!flow) return null;

  const total = flow.steps.length;
  const running = at >= 0 && !done;

  const run = () => {
    if (running) return;
    clearTimers();
    setDone(false);

    if (prefersReduced()) { setAt(total); setDone(true); return; }

    setAt(0);
    for (let i = 1; i <= total; i += 1) {
      timers.current.push(setTimeout(() => setAt(i), i * STEP_MS));
    }
    timers.current.push(setTimeout(() => setDone(true), total * STEP_MS + 260));
  };

  const reset = () => { clearTimers(); setAt(-1); setDone(false); };

  const stepState = (i) => {
    if (at < 0) return 'idle';
    if (done || at > i) return 'done';
    if (at === i) return 'active';
    return 'idle';
  };
  const STATE_WORD = { idle: 'waiting', active: 'running', done: 'done' };

  const hrs = hoursSaved(flow);
  const status = at < 0
    ? 'Idle. Press run to see one pass.'
    : done
      ? 'Run complete. ' + flow.outcome.label
      : 'Running step ' + Math.min(at + 1, total) + ' of ' + total + ': ' + (flow.steps[Math.min(at, total - 1)] || {}).label;

  return (
    <div className="sdemo-flow">
      <div className="sdemo-console">
        <div className="sdemo-bar">
          <span className={'sdemo-dot' + (running ? ' is-live' : '')} aria-hidden="true" />
          <span className="sdemo-name">{svc.name}</span>
          <span className="sdemo-chan">{running ? 'Running' : done ? 'Complete' : 'Ready'}</span>
        </div>

        <div className="sdemo-flowbody">
          {/* trigger: the point of automation is that nobody presses anything */}
          <div className={'sdemo-trig' + (at >= 0 ? ' is-fired' : '')}>
            <span className="sdemo-trig-l">Trigger</span>
            <div>
              <p className="sdemo-trig-n">{flow.trigger.label}</p>
              <p className="sdemo-trig-d">{flow.trigger.detail}</p>
            </div>
            <span className="sdemo-trig-tag">{at >= 0 ? 'Fired' : 'Waiting'}</span>
          </div>

          <ol className="sdemo-steps">
            {flow.steps.map((s, i) => {
              const st = stepState(i);
              return (
                <li key={s.label} className={'sdemo-step is-' + st}>
                  <span className="sdemo-step-rail" aria-hidden="true">
                    <span className="sdemo-step-node">
                      {st === 'done' ? (
                        <svg viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                      ) : <span className="sdemo-step-num">{i + 1}</span>}
                    </span>
                  </span>
                  <span className="sdemo-step-body">
                    <span className="sdemo-step-top">
                      <span className="sdemo-step-label">{s.label}</span>
                      {s.tool ? <span className="sdemo-step-tool">{s.tool}</span> : null}
                      {/* state in text, never colour alone */}
                      <span className="gs-sr-only">{STATE_WORD[st]}</span>
                    </span>
                    <span className="sdemo-step-detail">{s.detail}</span>
                  </span>
                </li>
              );
            })}
          </ol>

          <div className={'sdemo-out' + (done ? ' is-done' : '')}>
            <span className="sdemo-out-l">Outcome</span>
            <div>
              <p className="sdemo-out-n">{done ? flow.outcome.label : 'Waiting for the run'}</p>
              {done ? <p className="sdemo-out-d">{flow.outcome.detail}</p> : null}
            </div>
          </div>
        </div>

        <div className="sdemo-ask sdemo-flowfoot">
          <div className="sdemo-meters">
            <span className="sdemo-meter">
              <b>{flow.alwaysOn ? 'Always on' : flow.manualMin + ' min'}</b>
              <i>{flow.alwaysOn ? 'no one has to remember' : 'by hand'}</i>
            </span>
            <span className="sdemo-meter-arrow" aria-hidden="true">→</span>
            <span className="sdemo-meter is-auto">
              <b>{flow.autoSec} sec</b><i>automated</i>
            </span>
            {hrs > 0 ? (
              <span className="sdemo-meter is-saved">
                <b>{hrs} hrs</b><i>a month back</i>
              </span>
            ) : null}
          </div>
          <div className="sdemo-flowbtns">
            <button type="button" className="sdemo-run" onClick={run} disabled={running}>
              {running ? 'Running…' : done ? 'Run it again' : 'Run it once'}
            </button>
            {done ? <button type="button" className="sdemo-reset" onClick={reset}>Reset</button> : null}
          </div>
        </div>
      </div>

      <p className="sdemo-status gs-sr-only" role="status" aria-live="polite">{status}</p>
      <p className="sdemo-privacy">
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 2v6m0 8v6M2 12h6m8 0h6" /><circle cx="12" cy="12" r="3" />
        </svg>
        Runs on your schedule and your triggers. Nobody has to start it.
      </p>
    </div>
  );
}
