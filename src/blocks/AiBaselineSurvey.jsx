import { useState, useId, useMemo, useRef, useEffect, useCallback } from 'react';
import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { resolveLink } from '../lib/link-resolver.mjs';
import { track } from '../lib/analytics.js';
import { PILLARS } from '../data/maturity-seed.mjs';
import { SURVEY } from '../data/ai-baseline-survey.mjs';

// The AI Readiness Baseline: a free, gated lead magnet (Ben + John, 1 Jul marketing session). A visitor
// answers eight questions, one per Greatstone pillar, then gives name/company/email to see their result:
// a Laggard→Pioneer benchmark with a per-pillar bar chart against an illustrative industry average, plus
// two downloads — their own scored result, and the blank survey as a CSV they can adapt into Google Forms /
// Typeform / Formstack and run internally. Pure frontend: the maths and the CSVs are built client-side, the
// only side effect is a generate_lead analytics event (dormant until GTM is set). No backend, no storage.

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

export function AiBaselineSurvey({ id, puck, kicker, heading, intro, ctaLabel, ctaHref = '#book' }) {
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

  const submitGate = (e) => {
    e.preventDefault();
    const name = lead.name.trim(), company = lead.company.trim(), email = lead.email.trim();
    if (!name || !company || !/.+@.+\..+/.test(email)) { setErr('Please add your name, company and a valid email.'); return; }
    setErr('');
    track('generate_lead', { form: 'ai_baseline_survey' });
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
    const head = [['Greatstone AI Readiness Baseline'], ['Name', lead.name], ['Company', lead.company], [], ['Pillar', 'Your score (1-4)', 'Your level', 'Industry benchmark (1-4)']];
    const body = result.rows.map((r) => [r.name, r.score || '-', r.phase ? r.phase.label : '-', r.bench || '-']);
    const foot = [[], ['Overall', result.avg, result.phase.label, '']];
    downloadText('greatstone-ai-readiness-result.csv', csvRows([...head, ...body, ...foot]));
  };
  const downloadSurvey = () => {
    const header = ['Pillar', 'Question', 'Option 1 (lowest)', 'Option 2', 'Option 3', 'Option 4 (highest)'];
    const body = questions.map((qq) => [pillarName(qq.pillarKey), qq.question, ...qq.options.map((o) => o.label)]);
    downloadText('greatstone-ai-readiness-survey.csv', csvRows([header, ...body]));
  };

  const pct = (v) => Math.max(0, Math.min(100, (v / SCALE) * 100));

  return (
    <section ref={ref} className="b-abs">
      <div className="wrap b-abs-wrap">
        <div className="b-abs-head" data-reveal>
          {kicker ? <span className="kicker">{kicker}</span> : null}
          {heading ? <h2 className="h2 b-abs-h">{heading}</h2> : null}
          {intro ? <p className="b-abs-intro muted">{intro}</p> : null}
        </div>

        <div className="b-abs-panel" data-reveal>
          {step === 'intro' && (
            <div className="b-abs-intro-card">
              <ol className="b-abs-points">
                <li><b>{total} questions</b>, about two minutes. One per pillar of our method.</li>
                <li>See where you sit, from <b>Laggard to Pioneer</b>, against an industry benchmark.</li>
                <li>Download your result and the blank survey to run across your team.</li>
              </ol>
              <button type="button" className="b-cta b-abs-start" onClick={() => { setStep('quiz'); setQi(0); }}>
                Start the survey<Arrow />
              </button>
              <p className="b-abs-fine">{SURVEY.surveyDownloadNote}</p>
            </div>
          )}

          {step === 'quiz' && q && (
            <div className="b-abs-quiz">
              <div className="b-abs-prog">
                <div className="b-abs-prog-bar"><span style={{ width: ((qi) / total) * 100 + '%' }} /></div>
                <span className="b-abs-prog-lbl" ref={headRef} tabIndex={-1}>Question {qi + 1} of {total} · {pillarName(q.pillarKey)}</span>
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
                <button type="button" className="b-abs-back" onClick={() => setQi((i) => Math.max(0, i - 1))} disabled={qi === 0}>← Back</button>
                <span className="b-abs-quiz-hint">Pick the closest match</span>
              </div>
            </div>
          )}

          {step === 'gate' && (
            <form className="b-abs-gate" onSubmit={submitGate} noValidate>
              <h3 className="b-abs-gate-h" ref={headRef} tabIndex={-1}>Your result is ready.</h3>
              <p className="muted b-abs-gate-p">Tell us where to send it and see your benchmark. No spam, no obligation.</p>
              <div className="b-abs-field"><label htmlFor={uid + 'n'}>Your name</label><input id={uid + 'n'} className="fld" value={lead.name} onChange={(e) => setLead((l) => ({ ...l, name: e.target.value }))} autoComplete="name" /></div>
              <div className="b-abs-field"><label htmlFor={uid + 'c'}>Company</label><input id={uid + 'c'} className="fld" value={lead.company} onChange={(e) => setLead((l) => ({ ...l, company: e.target.value }))} autoComplete="organization" /></div>
              <div className="b-abs-field"><label htmlFor={uid + 'e'}>Work email</label><input id={uid + 'e'} className="fld" type="email" value={lead.email} onChange={(e) => setLead((l) => ({ ...l, email: e.target.value }))} autoComplete="email" /></div>
              {err ? <div className="b-abs-err" role="alert">{err}</div> : null}
              <button type="submit" className="b-cta b-abs-reveal">See my result<Arrow /></button>
              <button type="button" className="b-abs-back b-abs-gate-back" onClick={() => { setStep('quiz'); setQi(total - 1); }}>← Back to the survey</button>
            </form>
          )}

          {step === 'results' && (
            <div className="b-abs-results">
              <div className="b-abs-verdict">
                <span className="b-abs-badge">{result.phase.label}</span>
                <h3 className="b-abs-verdict-h" ref={headRef} tabIndex={-1}>{result.phase.headline}</h3>
                <p className="b-abs-verdict-read">{result.phase.read}</p>
                <div className="b-abs-score" aria-hidden="true"><b>{result.avg}</b><span>/ {SCALE} overall</span></div>
              </div>

              <div className="b-abs-chart" role="img" aria-label={'Your AI readiness by pillar, scored 1 to 4, against an industry benchmark. Overall ' + result.avg + ' of 4, ' + result.phase.label + '. ' + result.rows.map((r) => r.name + ': ' + (r.phase ? r.phase.label : 'not scored') + ', ' + r.score + ' of 4, industry benchmark ' + r.bench + '.').join(' ')}>
                {result.rows.map((r) => (
                  <div className="b-abs-row" key={r.key}>
                    <div className="b-abs-row-top"><span className="b-abs-row-name">{r.name}</span><span className="b-abs-row-lvl">{r.phase ? r.phase.label : '—'}</span></div>
                    <div className="b-abs-track">
                      <span className="b-abs-fill" style={{ width: pct(r.score) + '%' }} />
                      {r.bench ? <span className="b-abs-bench" style={{ left: pct(r.bench) + '%' }} title={'Industry benchmark ' + r.bench} /> : null}
                    </div>
                  </div>
                ))}
                <div className="b-abs-legend"><span className="b-abs-lg-fill">Your score</span><span className="b-abs-lg-bench">Industry benchmark</span></div>
              </div>

              <div className="b-abs-reads">
                {result.strongest ? <p><b>Strongest:</b> {SURVEY.strongestLead.replace('{pillar}', result.strongest.name)}</p> : null}
                {result.weakest ? <p><b>First to move:</b> {SURVEY.weakestLead.replace('{pillar}', result.weakest.name)}</p> : null}
              </div>

              <div className="b-abs-actions">
                <button type="button" className="b-cta b-abs-dl" onClick={downloadResult}>Download your result</button>
                <button type="button" className="b-abs-dl2" onClick={downloadSurvey}>Download the blank survey (CSV)</button>
              </div>
              <p className="b-abs-fine">{SURVEY.surveyDownloadNote}</p>

              {ctaLabel ? <a className="b-cta b-abs-cta" {...resolveLink(ctaHref)}>{ctaLabel}<Arrow /></a> : null}
              <button type="button" className="b-abs-retake" onClick={restart}>Retake the survey</button>
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
    kicker: { type: 'text', label: 'Kicker', contentEditable: true },
    heading: { type: 'text', label: 'Heading', contentEditable: true },
    intro: { type: 'textarea', label: 'Intro', contentEditable: true },
    ctaLabel: { type: 'text', label: 'Results CTA label' },
    ctaHref: { type: 'text', label: 'Results CTA link' },
  },
  defaultProps: {
    kicker: 'Free AI-readiness benchmark',
    heading: 'Where does your business stand on AI?',
    intro: 'Eight questions, one per pillar of our method. See where you sit against the field, from Laggard to Pioneer, and take the survey away to run across your team.',
    ctaLabel: 'Book a diagnostic',
    ctaHref: '#book',
  },
  render: (props) => <AiBaselineSurvey {...props} />,
};

export default AiBaselineSurvey;
