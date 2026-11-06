/**
 * The discovery read-out, client view: the synthesis Greatstone has released to the client, read only.
 *
 * Port: source app/(portal)/deliverable/[engagementId]/page.tsx (+ deliverable.css, now in interview.css),
 * the client_admin branch only. Not ported, because they are Greatstone-staff surfaces that GSAM now runs
 * through the bridge: the gs_admin working view (latest synthesis), its banner and thinness warning,
 * ReleaseControl, and BriefExport (in the source it renders for gs_admin only; a client never sees it).
 *
 * The page's loader is the 'results' op, args { engagementId } (null: the caller's own engagement). Data:
 *   { screen: 'denied' }                                     not an administrator of this engagement
 *   { screen: 'holding', clientName, total, completed, started, invited, pct, hasSynthesis, statusLine, targetDate }
 *                                                            nothing released yet: honest progress, never cost
 *   { screen: 'released', clientName, releasedAt, synthesis, failedQuotes: [{ key, reason }] }
 * failedQuotes is verifyForRender's failed set (theme_id / rec_id keys), computed on the server as before;
 * anything in it is refused here. Any other reply shows the source's "No working view yet" screen.
 */

import { GsLogo } from './GsLogo.jsx';
import { WaveDecoration } from './WaveDecoration.jsx';
import { InterviewFooter } from './Footer.jsx';
import { pageFallback } from './PageStatus.jsx';
import { InterviewSignIn } from './InterviewSignIn.jsx';
import { usePageOp } from './usePageOp.mjs';
import { BOARD_GROUPS, bandFor, holdingProgress, hoursLabel, visibleSynthesis } from './model.mjs';

// ─── Small presentational helpers ────────────────────────────────────────────

function ConfidenceTag({ confidence }) {
  const band = bandFor(confidence);
  return (
    <span className={`conf-tag band-${band.replace(' ', '-')}`}>
      <span className="conf-band">{band}</span>
      <span className="conf-number">{confidence.toFixed(2)}</span>
    </span>
  );
}

function QuoteBlock({ quote }) {
  return (
    <blockquote className="dx-quote">
      <p>&ldquo;{quote.quote}&rdquo;</p>
      <footer>
        {quote.attribution}
        {quote.second_hand ? <span className="second-hand-mark">Second-hand account</span> : null}
      </footer>
    </blockquote>
  );
}

function ThemeCard({ theme }) {
  return (
    <article className="theme-card card">
      <div className="theme-head">
        <h3>{theme.title}</h3>
        <ConfidenceTag confidence={theme.confidence} />
      </div>
      <p className="theme-statement">{theme.statement}</p>
      <div className="theme-tags">
        <span className="dx-chip">{theme.distinct_voices} voices</span>
        <span className="dx-chip">{theme.scope === 'cross_team' ? 'Cross team' : 'Within one team'}</span>
        {theme.includes_second_hand ? (
          <span className="dx-chip is-secondhand">Includes second-hand evidence</span>
        ) : null}
      </div>
      {theme.evidence_quotes.map((q, i) => (
        <QuoteBlock key={`${theme.theme_id}-q${i}`} quote={q} />
      ))}
    </article>
  );
}

function ScoreDots({ label, value }) {
  return (
    <span className="score-dots" aria-label={`${label} ${value} of 5`}>
      <span className="score-label">{label}</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? 'dot on' : 'dot'} />
      ))}
      <span className="score-num">{value}/5</span>
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function InterviewResults({ route }) {
  const page = usePageOp('results', { engagementId: route?.engagementId ?? null });
  const fallback = pageFallback(page, InterviewSignIn);
  if (fallback) return fallback;
  const d = page.data ?? {};

  if (d.screen === 'denied') {
    return (
      <main className="screen dx-screen" aria-label="Deliverable not available">
        <div className="dx-wrap dx-denied">
          <GsLogo />
          <h1>This working view is not available to this login</h1>
          <p>
            The synthesis working view is visible to engagement administrators
            only. If you were expecting access, email{' '}
            <a href="mailto:DX@greatstoneinternational.co.uk">DX@greatstoneinternational.co.uk</a>{' '}
            and we will sort it.
          </p>
        </div>
      </main>
    );
  }

  if (d.screen === 'holding') return <HoldingScreen data={d} />;

  if (d.screen !== 'released' || !d.synthesis) {
    return (
      <main className="screen dx-screen" aria-label="No synthesis yet">
        <div className="dx-wrap dx-denied">
          <GsLogo />
          <h1>No working view yet</h1>
          <p>
            {d.engagementExists
              ? 'This engagement has not had a synthesis generated yet. The working view appears here as soon as the first run completes; from the admin dashboard you can generate the synthesis brief at any time.'
              : 'That engagement does not exist.'}
          </p>
        </div>
      </main>
    );
  }

  const failed = (d.failedQuotes ?? []).map((f) => f.key);
  return <ReleasedReadout clientName={d.clientName} synthesis={d.synthesis} failed={failed} />;
}

// client_admin with nothing released: the holding screen. The client must
// never see the working view before the Greatstone team has approved a
// version for release — but they DO get honest progress (coverage + review
// status + a target date if set), and NEVER any cost.
function HoldingScreen({ data }) {
  // The server sends the figures ready-made; holdingProgress derives them when given the raw rows instead.
  const { total, completed, started, invited, pct, hasSynthesis, targetDate, statusLine } =
    typeof data.total === 'number' ? data : holdingProgress(data);

  return (
    <main className="screen dx-screen" aria-label="Read-out being prepared">
      <div className="dx-wrap dx-denied" style={{ maxWidth: 620 }}>
        <GsLogo />
        <h1>Your read-out is being prepared</h1>
        <p>{statusLine}</p>

        {total > 0 ? (
          <div className="glass-card" style={{ marginTop: 20, padding: '20px 22px', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--gs-text-muted, #b0b0b0)' }}>Conversations completed</span>
              <span style={{ fontWeight: 800, fontSize: 18 }}>
                {completed}{' '}
                <span style={{ color: 'var(--gs-text-faint, #707070)', fontWeight: 400, fontSize: 14 }}>of {total}</span>
              </span>
            </div>
            <div
              aria-hidden="true"
              style={{ height: 8, borderRadius: 999, background: 'var(--gs-bg-darker, #252525)', overflow: 'hidden' }}
            >
              <div
                style={{
                  width: `${Math.max(2, pct)}%`,
                  height: '100%',
                  background: 'var(--gs-accent, #c8ff00)',
                  borderRadius: 999,
                }}
              />
            </div>
            <div
              style={{
                marginTop: 12,
                fontSize: 12.5,
                color: 'var(--gs-text-faint, #707070)',
                display: 'flex',
                gap: 14,
                flexWrap: 'wrap',
              }}
            >
              <span>{invited} invited</span>
              <span>{started} in progress</span>
              <span>{completed} completed</span>
              <span>{hasSynthesis ? 'Synthesis: with Greatstone for review' : 'Synthesis: not started yet'}</span>
            </div>
            {targetDate ? (
              <p style={{ marginTop: 14, fontSize: 13, color: 'var(--gs-text-muted, #b0b0b0)' }}>
                Target read-out date: <strong style={{ color: 'var(--gs-text, #f5f5f5)' }}>{targetDate}</strong>.
              </p>
            ) : null}
          </div>
        ) : null}

        <p style={{ marginTop: 16, fontSize: 13, color: 'var(--gs-text-faint, #707070)' }}>
          We will let you know the moment it is released. Questions in the meantime? Email{' '}
          <a href="mailto:DX@greatstoneinternational.co.uk">DX@greatstoneinternational.co.uk</a>.
        </p>
      </div>
    </main>
  );
}

function ReleasedReadout({ clientName, synthesis, failed }) {
  // Renderer invariants: the server re-derived voices and re-verified quotes;
  // refuse anything that failed, never render it.
  const {
    themes, crossThemes, hotSpots, recommendations, followUps, openQuestions, suppressed, methodology,
    maxHours, generated, interviewsIncluded, sparse, failedCount,
  } = visibleSynthesis(synthesis, failed);

  return (
    <>
      <WaveDecoration position="top-right" />
      <main className="screen dx-screen" aria-label="Discovery read-out">
        <div className="dx-wrap">
          <header className="dx-top">
            <GsLogo />
            <div className="dx-top-meta">
              <span className="dx-chip">Synthesis v{synthesis.version}</span>
              <span className="dx-chip">Generated {generated}</span>
            </div>
          </header>

          <div className="dx-title">
            <div className="kicker">Parallel Discovery Agent · Discovery read-out</div>
            <h1>{clientName}</h1>
            <p className="dx-lead">
              What {interviewsIncluded === 1 ? 'one conversation' : `${interviewsIncluded} conversations`}{' '}
              across the organisation surfaced about where the time goes, what it
              costs, and what to automate first. Every claim below traces to a
              verbatim quote; anything that could not be verified was left out.
            </p>
          </div>

          {/* ── 01 Headline read ─────────────────────────────────────── */}
          <section className="dx-section" aria-label="Headline read">
            <div className="section-label">01 · Headline read</div>
            {synthesis.headline_read ? (
              <div className="headline-card glass-card">
                <p className="headline-text">{synthesis.headline_read.text}</p>
                <p className="headline-basis">
                  Grounded in {synthesis.headline_read.supporting_insight_ids.length} evidenced
                  findings across the interviews below.
                </p>
              </div>
            ) : (
              <div className="sparse-card glass-card">
                <h3>Not enough voices yet for a headline</h3>
                <p>
                  A headline claim needs at least three independently evidenced
                  findings, and this engagement does not have them yet. That is
                  the honest position, not a failure: the patterns below show
                  where the next conversations should go.
                </p>
              </div>
            )}
          </section>

          {/* ── 02 Hot spots ─────────────────────────────────────────── */}
          <section className="dx-section" aria-label="Hot spots">
            <div className="section-label">02 · Hot spots</div>
            <h2>Where the hours go</h2>
            <p className="dx-section-sub">
              Units ranked by first-hand hours lost per week to friction, as
              reported by the people doing the work. Team-leader estimates,
              where they exist, are shown separately and are never added to
              the first-hand figure.
            </p>
            {hotSpots.length === 0 ? (
              <div className="sparse-card glass-card">
                <h3>No quantified hot spots yet</h3>
                <p>
                  Nobody interviewed so far put a number on their lost time, so
                  there is no ranking to show. The follow-up questions below are
                  designed to change that.
                </p>
              </div>
            ) : (
              <div className="hotspot-list">
                {hotSpots.map((spot) => {
                  const heat = spot.first_hand_hours_per_week / maxHours;
                  return (
                    <div className="hotspot card" key={spot.unit_id}>
                      <div className="hotspot-head">
                        <h3>{spot.team}</h3>
                        <span className="hotspot-coverage">{spot.team_size_interviewed}</span>
                      </div>
                      <div className="hotspot-bar-row">
                        <div className="hotspot-bar">
                          <div
                            className="hotspot-fill"
                            style={{
                              width: `${Math.max(4, Math.round(heat * 100))}%`,
                              opacity: 0.35 + 0.65 * heat,
                            }}
                          />
                        </div>
                        <span className="hotspot-hours">
                          {hoursLabel(spot.first_hand_hours_per_week)}
                          <span className="hotspot-hours-sub">first-hand</span>
                        </span>
                      </div>
                      {spot.on_behalf_hours_per_week !== null ? (
                        <p className="hotspot-onbehalf">
                          Team leader estimates ~{hoursLabel(spot.on_behalf_hours_per_week)} across
                          the team (second-hand, shown for comparison only).
                        </p>
                      ) : null}
                      {spot.first_hand_hours_per_week === 0 ? (
                        <p className="hotspot-onbehalf">No quantified first-hand time costs yet from this unit.</p>
                      ) : null}
                      {spot.top_drivers.length > 0 ? (
                        <ul className="driver-list">
                          {spot.top_drivers.map((d) => (
                            <li key={d.insight_id}>
                              <span className="driver-hours">{hoursLabel(d.hours_per_week)}</span>
                              {d.label}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {spot.local_themes.length > 0 ? (
                        <div className="local-themes">
                          <div className="local-themes-label">Patterns within {spot.team}</div>
                          {spot.local_themes.map((t) => (
                            <ThemeCard key={t.theme_id} theme={t} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── 03 Automation candidates ─────────────────────────────── */}
          <section className="dx-section" aria-label="Automation candidates">
            <div className="section-label">03 · Automation candidates</div>
            <h2>What to automate, scored on the evidence</h2>
            <p className="dx-section-sub">
              Impact and feasibility are scored 1 to 5 from interview evidence
              alone. They are a consultant&rsquo;s starting position, not a
              technical audit, and the methodology notes say exactly how the
              scores work.
            </p>
            {recommendations.length === 0 ? (
              <div className="sparse-card glass-card">
                <h3>No automation candidates promoted yet</h3>
                <p>
                  Candidates need verifiable evidence behind them before they
                  appear here. As more interviews complete, this board fills in.
                </p>
              </div>
            ) : (
              BOARD_GROUPS.map((group) => {
                const items = recommendations.filter(group.match);
                if (items.length === 0) return null;
                return (
                  <div className="board-group" key={group.label}>
                    <h3 className="board-group-title">{group.label}</h3>
                    <p className="board-group-blurb">{group.blurb}</p>
                    <div className="board-grid">
                      {items.map((rec) => (
                        <article className="rec-card card" key={rec.rec_id}>
                          <div className="rec-head">
                            <h4>{rec.title}</h4>
                            <ConfidenceTag confidence={rec.confidence} />
                          </div>
                          <p className="rec-summary">{rec.summary}</p>
                          <div className="rec-scores">
                            <ScoreDots label="Impact" value={rec.impact} />
                            <ScoreDots label="Feasibility" value={rec.feasibility} />
                          </div>
                          <div className="theme-tags">
                            {rec.estimated_hours_per_week !== null ? (
                              <span className="dx-chip">~{hoursLabel(rec.estimated_hours_per_week)} evidenced</span>
                            ) : null}
                            {rec.affected_teams.map((t) => (
                              <span className="dx-chip" key={t}>
                                {t}
                              </span>
                            ))}
                          </div>
                          {rec.evidence_quotes.map((q, i) => (
                            <QuoteBlock key={`${rec.rec_id}-q${i}`} quote={q} />
                          ))}
                        </article>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </section>

          {/* ── 04 Cross-cutting themes ──────────────────────────────── */}
          <section className="dx-section" aria-label="Cross-cutting themes">
            <div className="section-label">04 · Cross-cutting themes</div>
            <h2>Patterns across teams</h2>
            <p className="dx-section-sub">
              A theme appears here only when at least two distinct people said
              it independently, at least one of them first-hand, and every
              quote checks out verbatim against the transcript.
            </p>
            {crossThemes.length === 0 ? (
              <div className="sparse-card glass-card">
                <h3>Not enough voices yet</h3>
                <p>
                  {themes.length > 0
                    ? 'Patterns have surfaced within single teams (shown under their hot spots above), but nothing crosses team boundaries with two independent voices behind it yet.'
                    : 'No theme has two independent voices behind it yet, so nothing is presented as a finding.'}{' '}
                  {suppressed.length > 0
                    ? `${suppressed.length} candidate pattern${suppressed.length === 1 ? ' was' : 's were'} suppressed by that rule rather than presented with false confidence.`
                    : ''}{' '}
                  The open questions below say where more conversations would
                  firm this up.
                </p>
              </div>
            ) : (
              <div className="theme-list">
                {crossThemes.map((t) => (
                  <ThemeCard key={t.theme_id} theme={t} />
                ))}
              </div>
            )}
          </section>

          {/* ── 05 Where to dig deeper ───────────────────────────────── */}
          <section className="dx-section" aria-label="Where to dig deeper">
            <div className="section-label">05 · Where to dig deeper</div>
            <h2>Who to talk to next, and what to ask</h2>
            {followUps.length === 0 && openQuestions.length === 0 ? (
              <p className="dx-section-sub">No named follow-ups from this run.</p>
            ) : (
              <>
                {followUps.length > 0 ? (
                  <div className="followup-grid">
                    {followUps.map((f, i) => (
                      <article className="followup-card card" key={`${f.employee_id}-${i}`}>
                        <h4>{f.display_name}</h4>
                        <p className="followup-question">&ldquo;{f.question}&rdquo;</p>
                        {f.reason ? <p className="followup-reason">{f.reason}</p> : null}
                      </article>
                    ))}
                  </div>
                ) : null}
                {openQuestions.length > 0 ? (
                  <div className="open-questions">
                    <h3>Open questions this run could not settle</h3>
                    <ul>
                      {openQuestions.map((q, i) => (
                        <li key={i}>{q.reason}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )}
          </section>

          {/* ── 06 Methodology ───────────────────────────────────────── */}
          <section className="dx-section dx-method" aria-label="Methodology">
            <div className="section-label">06 · Methodology</div>
            <h2>How this working view was built</h2>
            <div className="method-grid">
              <div className="method-item">
                <span className="method-label">Conversations</span>
                <span className="method-value">
                  {methodology?.sessions_complete ?? 0} complete ·{' '}
                  {methodology?.sessions_partial ?? 0} partial ·{' '}
                  {methodology?.on_behalf_sessions ?? 0} on behalf of a team
                </span>
              </div>
              <div className="method-item">
                <span className="method-label">Evidence base</span>
                <span className="method-value">
                  {methodology?.insights_used ?? 0} evidenced findings, window{' '}
                  {methodology?.interview_window ?? 'n/a'}
                </span>
              </div>
              <div className="method-item">
                <span className="method-label">Models</span>
                <span className="method-value">
                  Interviews {methodology?.interview_model ?? 'n/a'} · synthesis{' '}
                  {methodology?.synthesis_model ?? 'n/a'}
                </span>
              </div>
              <div className="method-item">
                <span className="method-label">Rules</span>
                <span className="method-value">{methodology?.rules_version ?? 'n/a'}</span>
              </div>
            </div>
            <div className="method-notes">
              <p>
                A partial conversation completed pain mapping but ended before
                its findings were read back to the participant; everything it
                contributed is capped at 0.7 confidence and never carries a
                headline claim.
                {methodology?.eligibility_note ? ` ${methodology.eligibility_note}` : ''}
              </p>
              <p>
                Impact and feasibility are 1 to 5 scores taken from interview
                evidence alone against fixed scales; feasibility is a prior,
                not a technical audit. Confidence is computed, not judged: the
                mean of the supporting findings, a small bonus for each extra
                independent voice, never above the strongest single finding,
                and capped at 0.75 wherever second-hand evidence is involved
                with fewer than two first-hand voices.
              </p>
              <p>
                First-hand and on-behalf hours are never added together
                anywhere in this report. Quotes are verbatim, checked
                mechanically against the transcript; where a participant asked
                not to be named, their words appear under a role description
                instead.
                {sparse
                  ? ' This is an early read on a small number of conversations; treat it as direction, not a verdict.'
                  : ''}
                {failedCount > 0
                  ? ` ${failedCount} item(s) failed re-verification at render time and are not shown.`
                  : ''}
              </p>
            </div>
          </section>

          <InterviewFooter />
        </div>
      </main>
    </>
  );
}
