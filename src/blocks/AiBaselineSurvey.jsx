import { useState, useId, useMemo, useRef, useEffect, useCallback } from 'react';
import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { resolveLink } from '../lib/link-resolver.mjs';
import { track, getConsent, getAttribution } from '../lib/analytics.js';
import { fireLead, validateEnquiry } from '../lib/enquiry.mjs';
import { sendToolLead } from '../lib/lead-tools.mjs';
import { Turnstile, TURNSTILE_KEY } from './Turnstile.jsx';
import { PILLARS } from '../data/maturity-seed.mjs';
import { SURVEY } from '../data/ai-baseline-survey.mjs';
import { LEAD_TOOL_COPY } from '../data/ai-lead-tools-copy.mjs';

// The AI Readiness Baseline: a free, gated lead magnet (Ben + John, 1 Jul marketing session). A visitor
// answers eight questions, one per Greatstone pillar, then gives name/company/email to see their result:
// a Laggard→Pioneer result with a per-pillar bar chart against a Greatstone reference point, plus
// two downloads: their own scored result and the blank survey. The enquiry path saves a short result
// summary; individual answers remain in the browser.
const COPY = LEAD_TOOL_COPY.survey;

const pillarName = (key) => (PILLARS.find((p) => p.key === key) || {}).name || key;
const SCALE = 4; // options are graded 1..4 (Laggard..Pioneer)

// the overall band for an average score on the 1..4 scale (phases tile the range with no gaps)
function phaseFor(avg) {
  const list = SURVEY.phases;
  for (const p of list) { if (avg >= p.min && avg <= p.max) return p; }
  return avg < list[0].min ? list[0] : list[list.length - 1];
}

const round1 = (n) => Math.round(n * 10) / 10;

// CSV helpers — quote any cell containing a comma, quote or newline, doubling inner quotes (RFC 4180).
const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csvRows = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
function downloadText(filename, text, type = 'text/csv') {
  try {
    const blob = new Blob(['﻿' + text], { type: type + ';charset=utf-8' }); // BOM so Excel reads UTF-8
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (e) { /* download unsupported — the on-screen result still stands */ }
}

export function AiBaselineSurvey({ id, puck, anchorId = '', kicker, heading, headingLevel = 'h2', intro, point1, point2, point3, startLabel,
  surveyDownloadNote, gateHeading, gateBody, nameLabel, companyLabel, emailLabel, dataNotice,
  submitLabel, backLabel, benchmarkLabel, benchmarkNote, chartAriaLabel, csvBenchmarkHeader,
  sentNote, failNote, ctaLabel, ctaHref }) {
  const editing = !!(puck && puck.isEditing);
  const ref = useReveal();
  const uid = useId();
  const questions = SURVEY.questions || [];
  const total = questions.length;

  const [step, setStep] = useState('intro'); // intro | quiz | gate | results
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState({}); // pillarKey -> score(1..4)
  const [lead, setLead] = useState({ name: '', company: '', email: '' });
  const [err, setErr] = useState('');
  const [sendState, setSendState] = useState('idle');
  const [token, setToken] = useState(null);
  const [website, setWebsite] = useState('');

  const liveRef = useRef(null);
  const headRef = useRef(null);
  // carry keyboard + screen-reader focus to the top of each new step (question, gate, result)
  useEffect(() => { if (step !== 'intro' && headRef.current) headRef.current.focus(); }, [step, qi]);

  const answered = Object.keys(answers).length;
  const q = questions[qi];

  const choose = useCallback((pillarKey, score) => {
    setAnswers((a) => ({ ...a, [pillarKey]: score }));
    if (qi + 1 >= total) setStep('gate');
    else setQi((i) => i + 1);
  }, [qi, total]);

  const restart = () => { setAnswers({}); setQi(0); setErr(''); setStep('intro'); };

  const submitGate = async (e) => {
    e.preventDefault();
    const name = lead.name.trim(), company = lead.company.trim(), email = lead.email.trim();
    const errors = validateEnquiry({ name, email });
    if (Object.keys(errors).length) { setErr(Object.values(errors).join(' ')); return; }
    if (TURNSTILE_KEY && !token) { setErr(LEAD_TOOL_COPY.securityError); return; }
    setErr('');
    setSendState('sending');
    const attribution = getAttribution();
    const out = await sendToolLead({ name, company, email, interest: 'AI Readiness Baseline',
      summary: `Overall: ${result.avg} of 4, ${result.phase.label}. Strongest: ${result.strongest.name}. First to move: ${result.weakest.name}.`,
      attribution, page: window.location.pathname + window.location.hash, website, turnstile: token });
    setSendState(out.ok ? 'sent' : 'failed');
    if (out.ok) fireLead({ track, getConsent, attribution, form: 'ai_baseline_survey' });
    setStep('results');
  };

  // scored result — computed once we have all eight answers
  const result = useMemo(() => {
    const rows = PILLARS.map((p) => {
      const score = Number(answers[p.key]) || 0;
      const bench = Number((SURVEY.benchmark || {})[p.key]) || 0;
      return { key: p.key, name: p.name, score, bench, phase: score ? phaseFor(score) : null };
    });
    const scored = rows.filter((r) => r.score > 0);
    const avg = scored.length ? round1(scored.reduce((s, r) => s + r.score, 0) / scored.length) : 0;
    const ranked = [...scored].sort((a, b) => b.score - a.score);
    return { rows, avg, phase: phaseFor(avg), strongest: ranked[0], weakest: ranked[ranked.length - 1] };
  }, [answers]);

  const downloadResult = () => {
    const head = [[COPY.resultTitle], [COPY.name, lead.name], [COPY.company, lead.company], [], [COPY.pillar, COPY.scoreHeader, COPY.levelHeader, csvBenchmarkHeader]];
    const body = result.rows.map((r) => [r.name, r.score || '-', r.phase ? r.phase.label : '-', r.bench || '-']);
    const foot = [[], [COPY.overall, result.avg, result.phase.label, '']];
    downloadText('greatstone-ai-readiness-result.csv', csvRows([...head, ...body, ...foot]));
  };
  const downloadSurvey = () => {
    const header = COPY.surveyHeaders;
    const body = questions.map((qq) => [pillarName(qq.pillarKey), qq.question, ...qq.options.map((o) => o.label)]);
    downloadText('greatstone-ai-readiness-survey.csv', csvRows([header, ...body]));
  };

  const pct = (v) => Math.max(0, Math.min(100, (v / SCALE) * 100));

  return (
    <section ref={ref} id={anchorId || undefined} className="b-abs" tabIndex={anchorId ? -1 : undefined}>
      <div className="wrap b-abs-wrap">
        <div className="b-abs-head" data-reveal>
          {kicker ? <span className="kicker">{kicker}</span> : null}
          {heading ? (headingLevel === 'h1' ? <h1 className="h2 b-abs-h">{heading}</h1> : <h2 className="h2 b-abs-h">{heading}</h2>) : null}
          {intro ? <p className="b-abs-intro muted">{intro}</p> : null}
        </div>

        <div className="b-abs-panel" data-reveal>
          {step === 'intro' && (
            <div className="b-abs-intro-card">
              <ol className="b-abs-points">
                <li>{point1}</li>
                <li>{point2}</li>
                <li>{point3}</li>
              </ol>
              <button type="button" className="b-cta b-abs-start" onClick={() => { setStep('quiz'); setQi(0); }}>
                {startLabel}<Arrow />
              </button>
              <p className="b-abs-fine">{surveyDownloadNote}</p>
            </div>
          )}

          {step === 'quiz' && q && (
            <div className="b-abs-quiz">
              <div className="b-abs-prog">
                <div className="b-abs-prog-bar"><span style={{ width: ((qi) / total) * 100 + '%' }} /></div>
                <span className="b-abs-prog-lbl" ref={headRef} tabIndex={-1}>{COPY.question} {qi + 1} {COPY.of} {total} · {pillarName(q.pillarKey)}</span>
              </div>
              <h3 className="b-abs-q">{q.question}</h3>
              <div className="b-abs-opts" role="group" aria-label={q.question}>
                {q.options.map((o, i) => {
                  const on = answers[q.pillarKey] === o.score;
                  return (
                    <button key={i} type="button" className={'b-abs-opt' + (on ? ' is-on' : '')} onClick={() => choose(q.pillarKey, o.score)}>
                      <span className="b-abs-opt-dot" aria-hidden="true" />
                      <span className="b-abs-opt-lbl">{o.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="b-abs-quiz-nav">
                <button type="button" className="b-abs-back" onClick={() => setQi((i) => Math.max(0, i - 1))} disabled={qi === 0}>{COPY.back}</button>
                <span className="b-abs-quiz-hint">{COPY.pick}</span>
              </div>
            </div>
          )}

          {step === 'gate' && (
            <form className="b-abs-gate" onSubmit={submitGate} noValidate>
              <h3 className="b-abs-gate-h" ref={headRef} tabIndex={-1}>{gateHeading}</h3>
              <p className="muted b-abs-gate-p">{gateBody}</p>
              <div className="b-abs-field"><label htmlFor={uid + 'n'}>{nameLabel}</label><input id={uid + 'n'} className="fld" value={lead.name} onChange={(e) => setLead((l) => ({ ...l, name: e.target.value }))} autoComplete="name" required /></div>
              <div className="b-abs-field"><label htmlFor={uid + 'c'}>{companyLabel}</label><input id={uid + 'c'} className="fld" value={lead.company} onChange={(e) => setLead((l) => ({ ...l, company: e.target.value }))} autoComplete="organization" /></div>
              <div className="b-abs-field"><label htmlFor={uid + 'e'}>{emailLabel}</label><input id={uid + 'e'} className="fld" type="email" value={lead.email} onChange={(e) => setLead((l) => ({ ...l, email: e.target.value }))} autoComplete="email" required /></div>
              <div className="gs-sr-only" aria-hidden="true"><label htmlFor={uid + 'w'}>{LEAD_TOOL_COPY.honeypot}</label><input id={uid + 'w'} tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></div>
              {editing ? null : <Turnstile onToken={setToken} />}
              {err ? <div className="b-abs-err" role="alert">{err}</div> : null}
              <p className="b-abs-notice">{dataNotice} <a href="#go/privacy">{LEAD_TOOL_COPY.privacyPolicy}</a>.</p>
              <button type="submit" className="b-cta b-abs-reveal" disabled={sendState === 'sending'}>{sendState === 'sending' ? LEAD_TOOL_COPY.sending : submitLabel}<Arrow /></button>
              <button type="button" className="b-abs-back b-abs-gate-back" onClick={() => { setStep('quiz'); setQi(total - 1); }}>{backLabel}</button>
            </form>
          )}

          {step === 'results' && (
            <div className="b-abs-results">
              <p className="b-abs-send-state" role="status">{sendState === 'sent' ? sentNote : failNote.replace('{contact}', LEAD_TOOL_COPY.contactEmail)}</p>
              <div className="b-abs-verdict">
                <span className="b-abs-badge">{result.phase.label}</span>
                <h3 className="b-abs-verdict-h" ref={headRef} tabIndex={-1}>{result.phase.headline}</h3>
                <p className="b-abs-verdict-read">{result.phase.read}</p>
                <div className="b-abs-score" aria-hidden="true"><b>{result.avg}</b><span>/ {SCALE} {COPY.scoreOverall}</span></div>
              </div>

              <div className="b-abs-chart" role="img" aria-label={chartAriaLabel.replace('{avg}', result.avg).replace('{phase}', result.phase.label).replace('{pillar}', result.rows.map((r) => `${r.name}: ${r.phase?.label || COPY.notScored}, ${r.score} ${COPY.of} 4, ${benchmarkLabel.toLowerCase()} ${r.bench}`).join(' '))}>
                {result.rows.map((r) => (
                  <div className="b-abs-row" key={r.key}>
                    <div className="b-abs-row-top"><span className="b-abs-row-name">{r.name}</span><span className="b-abs-row-lvl">{r.phase ? r.phase.label : COPY.notScored}</span></div>
                    <div className="b-abs-track">
                      <span className="b-abs-fill" style={{ width: pct(r.score) + '%' }} />
                      {r.bench ? <span className="b-abs-bench" style={{ left: pct(r.bench) + '%' }} title={benchmarkLabel + ' ' + r.bench} /> : null}
                    </div>
                  </div>
                ))}
                <div className="b-abs-legend"><span className="b-abs-lg-fill">{COPY.yourScore}</span><span className="b-abs-lg-bench">{benchmarkLabel}</span></div>
              </div>
              <p className="b-abs-fine">{benchmarkNote}</p>

              <div className="b-abs-reads">
                {result.strongest ? <p><b>{COPY.strongest}</b> {SURVEY.strongestLead.replace('{pillar}', result.strongest.name)}</p> : null}
                {result.weakest ? <p><b>{COPY.firstToMove}</b> {SURVEY.weakestLead.replace('{pillar}', result.weakest.name)}</p> : null}
              </div>

              <div className="b-abs-actions">
                <button type="button" className="b-cta b-abs-dl" onClick={downloadResult}>{COPY.resultDownload}</button>
                <button type="button" className="b-abs-dl2" onClick={downloadSurvey}>{COPY.surveyDownload}</button>
              </div>
              <p className="b-abs-fine">{surveyDownloadNote}</p>

              {ctaLabel ? <a className="b-cta b-abs-cta" {...resolveLink(ctaHref)}>{ctaLabel}<Arrow /></a> : null}
              <button type="button" className="b-abs-retake" onClick={restart}>{COPY.retake}</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-abs{padding:clamp(56px,9vw,110px) 0;position:relative}
.b-abs-wrap{max-width:820px}
.b-abs-head{margin-bottom:clamp(20px,3.4vw,34px);max-width:660px}
.b-abs-h{font-size:clamp(1.5rem,3.4vw,2.4rem);font-weight:800;letter-spacing:-.02em;line-height:1.06;margin-top:.5rem}
.b-abs-intro{margin-top:.7rem;color:var(--gs-text-muted);line-height:1.7}
.b-abs-panel{border:1px solid var(--gs-border);border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.02),rgba(255,255,255,.005));
  padding:clamp(22px,3.4vw,40px);box-shadow:0 30px 80px -50px rgba(200,255,0,.18)}

/* intro */
.b-abs-points{list-style:none;margin:0 0 22px;padding:0;display:flex;flex-direction:column;gap:12px;counter-reset:abs}
.b-abs-points li{position:relative;padding-left:40px;color:var(--gs-text-muted);line-height:1.55;font-size:.98rem}
.b-abs-points li::before{counter-increment:abs;content:counter(abs);position:absolute;left:0;top:-1px;width:26px;height:26px;border-radius:8px;
  display:grid;place-items:center;font-size:.82rem;font-weight:800;color:#1f1f1f;background:var(--gs-accent)}
.b-abs-points b{color:var(--gs-text)}
.b-abs-start{margin-top:4px}
.b-abs-fine{margin-top:16px;font-size:.8rem;color:var(--gs-text-faint);line-height:1.6}

/* quiz */
.b-abs-prog{margin-bottom:20px}
.b-abs-prog-bar{height:6px;border-radius:100px;background:rgba(255,255,255,.08);overflow:hidden}
.b-abs-prog-bar span{display:block;height:100%;background:var(--gs-accent);border-radius:100px;transition:width .35s var(--gs-ease,ease)}
.b-abs-prog-lbl{display:inline-block;margin-top:10px;font-size:.74rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gs-accent);outline:none}
.b-abs-q{font-size:clamp(1.15rem,2.4vw,1.5rem);font-weight:800;line-height:1.25;letter-spacing:-.01em;margin-bottom:18px}
.b-abs-opts{display:flex;flex-direction:column;gap:10px}
.b-abs-opt{display:flex;align-items:flex-start;gap:12px;width:100%;text-align:left;padding:14px 16px;border-radius:12px;cursor:pointer;font:inherit;
  color:var(--gs-text);background:rgba(255,255,255,.03);border:1px solid var(--gs-border-soft,rgba(255,255,255,.12));
  transition:transform var(--gs-dur-micro,150ms) var(--gs-ease,ease),border-color var(--gs-dur-micro,150ms) var(--gs-ease,ease),background var(--gs-dur-micro,150ms) var(--gs-ease,ease)}
.b-abs-opt:hover{transform:translateY(-2px);border-color:var(--gs-accent-mid,rgba(200,255,0,.4));background:rgba(255,255,255,.05)}
.b-abs-opt.is-on{border-color:var(--gs-accent);background:var(--gs-accent-dim,rgba(200,255,0,.1))}
.b-abs-opt-dot{flex:none;width:18px;height:18px;margin-top:2px;border-radius:50%;border:2px solid var(--gs-border-strong,rgba(200,255,0,.3));transition:all .15s var(--gs-ease,ease)}
.b-abs-opt.is-on .b-abs-opt-dot{border-color:var(--gs-accent);background:var(--gs-accent);box-shadow:inset 0 0 0 3px #1f1f1f}
.b-abs-opt-lbl{line-height:1.45;font-size:.96rem}
.b-abs-quiz-nav{display:flex;align-items:center;justify-content:space-between;margin-top:16px}
.b-abs-back{background:none;border:none;color:var(--gs-text-muted);font:inherit;font-size:.86rem;font-weight:700;cursor:pointer;padding:6px 0}
.b-abs-back:hover:not(:disabled){color:var(--gs-text)}
.b-abs-back:disabled{opacity:.35;cursor:not-allowed}
.b-abs-quiz-hint{font-size:.78rem;color:var(--gs-text-faint)}

/* gate */
.b-abs-gate-h{font-size:1.4rem;font-weight:800;outline:none}
.b-abs-gate-p{margin:.5rem 0 1.2rem}
.b-abs-field{margin-bottom:1rem}
.b-abs-field label{display:block;font-size:.74rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--gs-text-muted);margin-bottom:.45rem}
.b-abs-gate .fld{width:100%;font-family:inherit;font-size:.98rem;color:var(--gs-text);background:rgba(255,255,255,.03);border:1px solid var(--gs-border-soft);border-radius:10px;padding:.8em .9em;transition:border-color .2s var(--gs-ease,ease),box-shadow .2s var(--gs-ease,ease)}
.b-abs-gate .fld:focus{outline:none;border-color:var(--gs-accent-mid,rgba(200,255,0,.4));box-shadow:0 0 0 3px var(--gs-accent-dim,rgba(200,255,0,.12))}
.b-abs-reveal{width:100%;justify-content:center;margin-top:.4rem}
.b-abs-err{background:rgba(255,107,107,.12);border:1px solid rgba(255,107,107,.4);color:#ffb3b3;padding:.7em 1em;border-radius:10px;font-size:.84rem;margin-bottom:12px}
.b-abs-notice,.b-abs-send-state{font-size:.82rem;line-height:1.6;color:var(--gs-text-muted)}
.b-abs-notice a{color:var(--gs-text);text-underline-offset:3px}
.b-abs-gate-back{display:block;width:100%;text-align:center;margin-top:12px}

/* results */
.b-abs-verdict{text-align:center;padding-bottom:8px}
.b-abs-badge{display:inline-block;padding:.35em 1em;border-radius:100px;font-size:.74rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#1f1f1f;background:var(--gs-accent)}
.b-abs-verdict-h{font-size:clamp(1.4rem,3vw,2rem);font-weight:900;letter-spacing:-.02em;line-height:1.1;margin:.6rem 0 .5rem;outline:none}
.b-abs-verdict-read{color:var(--gs-text-muted);line-height:1.65;max-width:52ch;margin:0 auto}
.b-abs-score{margin-top:16px}
.b-abs-score b{font-size:2.4rem;font-weight:900;color:var(--gs-accent);font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.b-abs-score span{margin-left:6px;font-size:.9rem;font-weight:700;color:var(--gs-text-faint)}
.b-abs-chart{margin:26px 0 4px;display:flex;flex-direction:column;gap:14px}
.b-abs-row-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}
.b-abs-row-name{font-size:.9rem;font-weight:700}
.b-abs-row-lvl{font-size:.74rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--gs-text-faint)}
.b-abs-track{position:relative;height:12px;border-radius:100px;background:rgba(255,255,255,.06);overflow:visible}
.b-abs-fill{position:absolute;left:0;top:0;height:100%;border-radius:100px;background:linear-gradient(90deg,var(--gs-accent-mid,rgba(200,255,0,.5)),var(--gs-accent));transition:width .5s var(--gs-ease,ease)}
.b-abs-bench{position:absolute;top:-3px;width:2px;height:18px;background:var(--gs-teal,#4ecdc4);transform:translateX(-1px);border-radius:2px}
.b-abs-legend{display:flex;gap:20px;margin-top:8px;font-size:.72rem;color:var(--gs-text-faint)}
.b-abs-lg-fill::before{content:"";display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--gs-accent);margin-right:6px;vertical-align:middle}
.b-abs-lg-bench::before{content:"";display:inline-block;width:2px;height:12px;background:var(--gs-teal,#4ecdc4);margin-right:8px;vertical-align:middle}
.b-abs-reads{margin:22px 0;display:flex;flex-direction:column;gap:8px}
.b-abs-reads p{color:var(--gs-text-muted);line-height:1.6;font-size:.95rem}
.b-abs-reads b{color:var(--gs-text)}
.b-abs-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.b-abs-dl2{background:none;border:1px solid var(--gs-border-strong,rgba(200,255,0,.18));color:var(--gs-text);font:inherit;font-size:.9rem;font-weight:700;cursor:pointer;border-radius:100px;padding:.7em 1.2em;transition:border-color .2s var(--gs-ease,ease)}
.b-abs-dl2:hover{border-color:var(--gs-accent)}
.b-abs-cta{margin-top:22px}
.b-abs-retake{display:block;margin-top:16px;background:none;border:none;color:var(--gs-text-faint);font:inherit;font-size:.82rem;cursor:pointer;padding:4px 0;text-decoration:underline}
.b-abs-retake:hover{color:var(--gs-text-muted)}
@media(pointer:coarse){.b-abs-opt{min-height:54px}}
@media(prefers-reduced-motion:reduce){.b-abs-opt:hover{transform:none}.b-abs-prog-bar span,.b-abs-fill{transition:none}}
`;

export const puck = {
  label: 'AI Baseline Survey (lead magnet)',
  fields: {
    anchorId: { type: 'text', label: 'Section anchor' },
    kicker: { type: 'text', label: 'Kicker', contentEditable: true },
    heading: { type: 'text', label: 'Heading', contentEditable: true },
    headingLevel: { type: 'select', label: 'Heading level', options: [{ label: 'Page heading', value: 'h1' }, { label: 'Section heading', value: 'h2' }] },
    intro: { type: 'textarea', label: 'Intro', contentEditable: true },
    point1: { type: 'text', label: 'First point' },
    point2: { type: 'text', label: 'Second point' },
    point3: { type: 'text', label: 'Third point' },
    startLabel: { type: 'text', label: 'Start button' },
    surveyDownloadNote: { type: 'textarea', label: 'Blank survey note' },
    gateHeading: { type: 'text', label: 'Gate heading' },
    gateBody: { type: 'textarea', label: 'Gate body' },
    nameLabel: { type: 'text', label: 'Name label' },
    companyLabel: { type: 'text', label: 'Company label' },
    emailLabel: { type: 'text', label: 'Email label' },
    dataNotice: { type: 'textarea', label: 'Data notice' },
    submitLabel: { type: 'text', label: 'Submit label' },
    backLabel: { type: 'text', label: 'Back label' },
    benchmarkLabel: { type: 'text', label: 'Reference point label' },
    benchmarkNote: { type: 'textarea', label: 'Reference point note' },
    chartAriaLabel: { type: 'textarea', label: 'Chart screen-reader text' },
    csvBenchmarkHeader: { type: 'text', label: 'CSV reference point header' },
    sentNote: { type: 'textarea', label: 'Sent note' },
    failNote: { type: 'textarea', label: 'Failed send note' },
    ctaLabel: { type: 'text', label: 'Results CTA label' },
    ctaHref: { type: 'text', label: 'Results CTA link' },
  },
  defaultProps: {
    anchorId: '',
    kicker: 'Free AI readiness check',
    heading: 'Where does your business stand on AI?',
    headingLevel: 'h2',
    intro: 'Eight questions, one for each part of our method. See where you stand from Laggard to Pioneer, then take the survey away to run with your team.',
    point1: '8 questions, one for each part of our method.',
    point2: 'See where you stand, from Laggard to Pioneer, next to a Greatstone reference point.',
    point3: 'Download your result and the blank survey.',
    startLabel: 'Start the survey',
    surveyDownloadNote: 'The blank survey downloads as a CSV. You can load it into Google Forms, Typeform or Formstack and send it to your leadership team. It holds the eight questions, each with four answers in order from lowest to highest. It does not score the answers or give a stage.',
    gateHeading: 'Your result is ready.',
    gateBody: 'Add your name and work email to see it here and download it.',
    nameLabel: 'Your name', companyLabel: 'Company (optional)', emailLabel: 'Work email',
    dataNotice: 'When you press See my result, we send Greatstone your name, work email, company if you give it, and a short summary of your result: your overall stage, your strongest area and the area to move first. Your individual answers stay in your browser. We may reply once about your result. We will not add you to marketing emails.',
    submitLabel: 'See my result', backLabel: 'Back to the survey',
    benchmarkLabel: 'Greatstone reference point',
    benchmarkNote: 'The reference point is a Greatstone guide to help you read the chart. It is not measured data about your sector.',
    chartAriaLabel: 'Your AI readiness by pillar, scored 1 to 4, next to a Greatstone reference point. Overall {avg} of 4, {phase}. {pillar}',
    csvBenchmarkHeader: 'Greatstone reference point (1-4)',
    sentNote: 'Thank you. We have a summary of your result and may reply once about it.',
    failNote: 'Your result is below. We could not pass it to our team just now; email {contact} if you want to talk it through.',
    ctaLabel: 'Begin the Conversation', ctaHref: '#enquire/a-free-executive-discovery',
  },
  render: (props) => <AiBaselineSurvey {...props} />,
};

export default AiBaselineSurvey;
