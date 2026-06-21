// AI Intelligence Hub — the full-screen intelligence surface opened from Insights (#intel).
// Agent-curated AI-landscape intel, on-brand, with a per-visitor interest engine driving a "For you"
// feed. A full-screen route takeover (Escape / close returns to Insights).
import React, { useState, useEffect, useRef, useMemo } from 'react';
import buildIntel, { TOPIC_LABEL, TOPIC_HUE, TOPICS, WEIGHTS, BOARD_META } from '../data/ai-intel.mjs';
import { recordOpen, recordTab, recordTopicFocus, recordCompare, rankForYou, topInterests, getProfile, hasInterestSignal } from './interest.js';
import Logo from './Logo.jsx';
import BriefingArt from './BriefingArt.jsx';
import { readTime, briefHref, kickerStyle } from './articleMeta.js';
import './intel.css';

const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); } catch { return s; } };
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'briefing', label: 'Briefing' },
  { id: 'leaderboards', label: 'Leaderboards' },
  { id: 'compare', label: 'Compare' },
  { id: 'sourcing', label: 'How it is sourced' },
];

// short radar-axis labels (the full topic labels are too long / "AI security" would read as just "AI")
const SHORT = { 'frontier-models': 'Frontier', 'ai-security': 'Security', infrastructure: 'Infra', 'open-source': 'Open', multimodal: 'Multimodal' };
// camelCase pillar keys → readable labels (codeQuality → "Code quality")
const humanize = (k) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const Spark = (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M12 2l2.2 6.3L21 10l-5 4.2L17.5 21 12 17.3 6.5 21 8 14.2 3 10l6.8-1.7L12 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>);
const X = (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>);

// The interest radar: a canvas that plots the visitor's own topic interests, with a slow sweep. It
// literally visualises "what you care about". Canvas is sized once per run (not per frame); reduced
// motion draws a static frame and labels are rendered as positioned HTML so they never clip.
function IntelRadar({ profile, onTopic }) {
  const ref = useRef(null);
  const axes = useMemo(() => TOPICS.slice(0, 8), []);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, ang = 0, w = 0, h = 0, R = 0;
    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = cv.clientWidth; h = cv.clientHeight; R = Math.min(w, h) / 2 - 26;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const maxW = Math.max(1, ...axes.map((t) => profile.topics[t.id] || 0));
    const draw = () => {
      const cx = w / 2, cy = h / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
      for (let r = 1; r <= 4; r++) { ctx.beginPath(); ctx.arc(cx, cy, (R * r) / 4, 0, Math.PI * 2); ctx.stroke(); }
      axes.forEach((t, i) => {
        const a = (i / axes.length) * Math.PI * 2 - Math.PI / 2;
        ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
      });
      ctx.beginPath();
      axes.forEach((t, i) => {
        const a = (i / axes.length) * Math.PI * 2 - Math.PI / 2;
        const v = 0.18 + 0.82 * ((profile.topics[t.id] || 0) / maxW);
        const x = cx + Math.cos(a) * R * v, y = cy + Math.sin(a) * R * v;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      grad.addColorStop(0, 'rgba(200,255,0,.30)'); grad.addColorStop(1, 'rgba(200,255,0,.06)');
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = '#c8ff00'; ctx.lineWidth = 1.6; ctx.stroke();
      if (!reduce) {
        ang += 0.012; ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
        const lg = ctx.createLinearGradient(0, 0, R, 0); lg.addColorStop(0, 'rgba(200,255,0,.35)'); lg.addColorStop(1, 'rgba(200,255,0,0)');
        ctx.strokeStyle = lg; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R, 0); ctx.stroke(); ctx.restore();
        raf = requestAnimationFrame(draw);
      }
    };
    size(); draw();
    const onResize = () => { size(); if (reduce) draw(); };
    window.addEventListener('resize', onResize);
    return () => { if (raf) cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [profile, axes]);
  return (
    <div className="ih-radar">
      <canvas ref={ref} aria-hidden="true" />
      {axes.map((t, i) => {
        const a = (i / axes.length) * Math.PI * 2 - Math.PI / 2;
        const x = 50 + Math.cos(a) * 44, y = 50 + Math.sin(a) * 44;
        const align = Math.cos(a) > 0.3 ? 'left' : Math.cos(a) < -0.3 ? 'right' : 'center';
        return <button key={t.id} type="button" className="ih-radar-lbl" aria-label={'See ' + (TOPIC_LABEL[t.id] || t.label) + ' briefings'}
          style={{ left: x + '%', top: y + '%', textAlign: align, transform: `translate(${align === 'left' ? '0' : align === 'right' ? '-100%' : '-50%'}, -50%)` }}
          onClick={() => onTopic && onTopic(t.id)}>{SHORT[t.id] || t.label}</button>;
      })}
      <span className="ih-radar-cap">Your radar · tap a theme</span>
    </div>
  );
}

// A restrained three.js accent behind the hero: a slowly drifting lime particle shell around a faint
// wireframe core. Dynamic-imported so the hub's first paint (the radar) is never blocked, guarded so a
// missing WebGL context or a load failure degrades to nothing, and frozen to a single frame under
// reduced motion. Fully disposed on unmount (no leaked GL context).
function IntelConstellation() {
  const hostRef = useRef(null);
  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = matchMedia('(hover:none),(pointer:coarse)').matches;
    const state = { dead: false, raf: 0, cleanup: null };
    (async () => {
      let THREE;
      try { THREE = await import('three'); } catch { return; }
      if (state.dead || !hostRef.current) return;
      const cv = document.createElement('canvas');
      cv.setAttribute('aria-hidden', 'true');
      cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
      let renderer;
      try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'low-power' }); }
      catch { return; }
      renderer.debug.checkShaderErrors = false; // some backends return null from getProgramInfoLog(); three .trim()s it
      host.appendChild(cv);
      const W = () => host.clientWidth || 1, H = () => host.clientHeight || 1;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
      renderer.setSize(W(), H()); renderer.setClearColor(0x000000, 0);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, W() / H(), 0.1, 100); camera.position.z = 15;
      const N = coarse ? 90 : 150, pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const r = 6 + Math.random() * 3.4, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th); pos[i * 3 + 2] = r * Math.cos(ph);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.PointsMaterial({ color: 0xc8ff00, size: 0.1, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
      const pts = new THREE.Points(g, m); scene.add(pts);
      const ig = new THREE.IcosahedronGeometry(3.5, 1);
      const im = new THREE.MeshBasicMaterial({ color: 0xc8ff00, wireframe: true, transparent: true, opacity: 0.12 });
      const core = new THREE.Mesh(ig, im); scene.add(core);
      const render = () => renderer.render(scene, camera);
      const tick = () => { pts.rotation.y += 0.0009; pts.rotation.x += 0.0004; core.rotation.y -= 0.0014; core.rotation.x += 0.0006; render(); state.raf = requestAnimationFrame(tick); };
      const onResize = () => { camera.aspect = W() / H(); camera.updateProjectionMatrix(); renderer.setSize(W(), H()); render(); };
      window.addEventListener('resize', onResize);
      if (reduce) { pts.rotation.set(0.3, 0.5, 0); core.rotation.set(0.4, 0.2, 0); render(); } else tick();
      state.cleanup = () => {
        if (state.raf) cancelAnimationFrame(state.raf);
        window.removeEventListener('resize', onResize);
        g.dispose(); m.dispose(); ig.dispose(); im.dispose(); renderer.dispose();
        if (cv.parentNode) cv.parentNode.removeChild(cv);
      };
    })();
    return () => { state.dead = true; if (state.cleanup) state.cleanup(); };
  }, []);
  return <div className="ih-constellation" ref={hostRef} aria-hidden="true" />;
}

// editorial tiering: sort by importance (high first) then date desc then id, and split a list into the
// lead story (1), two sub-leads, and the river (the rest). The whole feed reads like a front page.
const sortTiers = (list) => {
  const sorted = [...(list || [])].sort((a, b) => {
    const ia = a.importance === 'high' ? 0 : 1, ib = b.importance === 'high' ? 0 : 1;
    if (ia !== ib) return ia - ib;
    const da = +new Date(a.date) || 0, db = +new Date(b.date) || 0;
    if (db !== da) return db - da;
    return a.id < b.id ? -1 : 1;
  });
  return { lead: sorted[0] || null, subs: sorted.slice(1, 3), river: sorted.slice(3) };
};
// the lead topic, as a coloured caps kicker (topic hue as "section ink", never a fill)
const topicKicker = (b) => { const t = (b.topics || [])[0]; return t ? { label: TOPIC_LABEL[t] || t, hue: TOPIC_HUE[t] || 84 } : null; };

// The lead story: a front-page splash. A wide generative cover, then the byline, an oversized headline
// and the standfirst. The whole card is a link to the briefing's own article (the heading link is
// stretched over the card via ::after, so the accessible name stays the headline).
function LeadCard({ b, forYou }) {
  const k = topicKicker(b);
  return (
    <article className={'ih-lead' + (forYou ? ' foryou' : '')}>
      <div className="ih-lead-media">
        <BriefingArt brief={b} className="lead" />
        {k && <span className="ih-art-kicker" style={kickerStyle(k.hue)}>{k.label}</span>}
      </div>
      <div className="ih-lead-body">
        <div className="ih-brief-top">
          <Logo domain={b.vendorDomain} name={b.vendor} className="ih-lead-logo" />
          <span className="ih-brief-vendor">{b.vendor}</span>
          {b.importance === 'high' && <i className="ih-hi" aria-hidden="true" title="High importance" />}
          <span className="ih-brief-date">{fmtDate(b.date)} · {readTime(b)} min read</span>
        </div>
        <h3 className="ih-lead-h"><a className="ih-brief-link" href={briefHref(b.id)}>{b.headline}</a></h3>
        <p className="ih-lead-stand">{b.summary}</p>
        <span className="ih-readmore" aria-hidden="true">Read the briefing<span className="ih-arrow">→</span></span>
      </div>
    </article>
  );
}

// A briefing card: generative cover on top, byline, headline and a short dek. The whole card links to
// the briefing's own article page (heading link stretched via ::after). No inline expand — opening a
// story no longer shoves the rest of the grid around.
function BriefingCard({ b, forYou, variant }) {
  const k = topicKicker(b);
  const high = b.importance === 'high';
  return (
    <article className={'ih-brief' + (variant ? ' ' + variant : '') + (forYou ? ' foryou' : '')}>
      <div className="ih-brief-media">
        <BriefingArt brief={b} className="card" />
        {k && <span className="ih-art-kicker" style={kickerStyle(k.hue)}>{k.label}</span>}
      </div>
      <div className="ih-brief-body">
        <div className="ih-brief-top">
          <Logo domain={b.vendorDomain} name={b.vendor} />
          <span className="ih-brief-vendor">{b.vendor}</span>
          {high && <i className="ih-hi" aria-hidden="true" title="High importance" />}
          <span className="ih-brief-date">{fmtDate(b.date)}</span>
        </div>
        <h4 className="ih-brief-h"><a className="ih-brief-link" href={briefHref(b.id)}>{b.headline}</a></h4>
        <p>{b.summary}</p>
        <span className="ih-readmore" aria-hidden="true">{readTime(b)} min read<span className="ih-arrow">→</span></span>
      </div>
    </article>
  );
}

function ScoreBar({ score }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(score), 60); return () => clearTimeout(t); }, [score]);
  return <div className="ih-scorebar" aria-hidden="true"><i style={{ width: w + '%' }} /></div>;
}

const deltaClass = (d) => (/^\+|up/i.test(d) ? 'up' : /new/i.test(d) ? 'new' : 'flat');

export default function IntelHub() {
  const intel = useMemo(() => buildIntel(), []);
  const briefings = intel.briefings || [];
  const boardsData = intel.boards || { models: [], products: [], tools: [] };
  const [tab, setTab] = useState('overview');
  const [topic, setTopic] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [board, setBoard] = useState('models');
  const [compare, setCompare] = useState([]);
  const [profile, setProfile] = useState(() => getProfile());
  const tablistRef = useRef(null);

  useEffect(() => { recordOpen(); }, []);

  // The hub is a normal in-page surface inside the site chrome (the Header nav sits above it), not a
  // modal — so no focus trap, no body-scroll lock, no Escape-to-close. Briefings now open as their own
  // article page (the read/dwell is recorded there), so there is no inline expand to track here.
  const switchTab = (id) => { setTab(id); recordTab(id); setOpenId(null); };
  const onTabKey = (e, i) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const last = TABS.length - 1;
    const n = e.key === 'ArrowRight' ? (i === last ? 0 : i + 1) : e.key === 'ArrowLeft' ? (i === 0 ? last : i - 1) : e.key === 'Home' ? 0 : last;
    switchTab(TABS[n].id);
    requestAnimationFrame(() => { const t = tablistRef.current && tablistRef.current.querySelector('#ih-tab-' + TABS[n].id); if (t) t.focus(); });
  };

  const forYou = useMemo(() => rankForYou(briefings, profile), [briefings, profile]);
  const filtered = useMemo(() => (topic ? briefings.filter((b) => (b.topics || []).includes(topic)) : forYou), [briefings, forYou, topic]);
  const briefingTiers = useMemo(() => sortTiers(filtered), [filtered]);
  const forYouTiers = useMemo(() => sortTiers(forYou), [forYou]);
  const interests = useMemo(() => topInterests(profile), [profile]);
  const signal = hasInterestSignal(profile);
  const tuningTo = interests.topics.map((t) => TOPIC_LABEL[t.id] || t.id).slice(0, 3).join(', ');

  const podium = (boardsData.models || []).slice(0, 3);
  // "What's moving": new entrants + risers across every board, from the published delta field (vetted data,
  // no new claims). Risers first (by amount), then new entrants.
  const movement = useMemo(() => {
    const out = [];
    ['models', 'products', 'tools'].forEach((b) => (boardsData[b] || []).forEach((r) => {
      const d = (r.delta || '').trim();
      if (/^\+/.test(d)) out.push({ name: r.name, company: r.company, board: b, kind: 'up', amt: parseInt(d.slice(1), 10) || 0 });
      else if (/new/i.test(d)) out.push({ name: r.name, company: r.company, board: b, kind: 'new', amt: 0 });
    }));
    return out.sort((a, b) => (a.kind === b.kind ? b.amt - a.amt : a.kind === 'up' ? -1 : 1));
  }, [boardsData]);
  const rows = boardsData[board] || [];
  const weightStr = Object.entries(WEIGHTS[board] || {}).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(' · ');

  // compute the next set from the closed-over state and keep the analytics side-effect OUT of the
  // setState updater (updaters must be pure; StrictMode double-invokes them) — mirrors switchTab/toggleBrief
  const toggleCompare = (name) => {
    const exists = compare.find((x) => x.board === board && x.name === name);
    if (exists) { setCompare(compare.filter((x) => !(x.board === board && x.name === name))); return; }
    if (compare.length >= 3) return;
    const next = [...compare, { board, name }];
    recordCompare(next.map((x) => x.name));
    setCompare(next);
  };
  // keep the board on each row: a name can legitimately exist on two boards, so identity is board+name
  const cmpRows = compare.map((c) => { const r = (boardsData[c.board] || []).find((x) => x.name === c.name); return r ? { ...r, _board: c.board } : null; }).filter(Boolean);
  const cmpPillars = [...new Set(cmpRows.flatMap((r) => Object.keys(r.pillars || {})))];
  const cmpMaxScore = cmpRows.length ? Math.max(...cmpRows.map((r) => r.score)) : 0;
  const cmpMultiBoard = new Set(compare.map((c) => c.board)).size > 1;

  return (
    <div className="ih-root">
      <div className="ih-grain" aria-hidden="true" />
      <div className="ih-masthead">
        <div className="ih-brand">
          <span className="ih-mark"><Spark style={{ color: 'var(--gs-accent)' }} /></span>
          <span className="ih-title"><span>Greatstone Intelligence</span><b>{intel.meta.edition}</b></span>
        </div>
        <div className="ih-updated"><span className="ih-live" aria-hidden="true" />Updated {fmtDate(intel.meta.updatedAt)} · {intel.meta.updatesToday} today</div>
      </div>

      <div className="ih-tabs">
        <div className="ih-tabs-inner" role="tablist" aria-label="Intelligence sections" ref={tablistRef}>
          {TABS.map((t, i) => (
            // no aria-controls: only the active tabpanel is mounted, so an IDREF to the others would dangle
            <button key={t.id} id={'ih-tab-' + t.id} role="tab" aria-selected={tab === t.id}
              tabIndex={tab === t.id ? 0 : -1} className="ih-tab" onClick={() => switchTab(t.id)} onKeyDown={(e) => onTabKey(e, i)}>
              {t.label}
              {t.id === 'overview' && signal && <span className="ih-tabdot" aria-hidden="true" />}
              {t.id === 'compare' && compare.length > 0 && <span className="ih-tabcount">{compare.length}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="ih-body" id="ih-scroll">
        <div className="ih-wrap">

          {tab === 'overview' && (
            <div className="ih-panel" role="tabpanel" id="ih-panel-overview" aria-labelledby="ih-tab-overview" tabIndex={0}>
              <div className="ih-hero">
                <IntelConstellation />
                <div>
                  <span className="ih-eyebrow">The briefing room</span>
                  <h1 className="ih-hero-line">The AI landscape, <span className="accent">read for you.</span></h1>
                  <p className="ih-sub">{intel.meta.cadence} We track {briefings.length} live developments across {intel.topics.length} themes, each with our own read on what it means for a business modernising with AI.</p>
                  <div className="ih-hero-meta">
                    <div className="ih-stat"><b>{briefings.length}</b><span>Live items</span></div>
                    <div className="ih-stat"><b>{intel.meta.updatesToday}</b><span>New today</span></div>
                    <div className="ih-stat"><b>{(boardsData.models || []).length}</b><span>Models ranked</span></div>
                  </div>
                </div>
                <IntelRadar profile={profile} onTopic={(id) => { setTopic(id); recordTopicFocus(id); setProfile(getProfile()); switchTab('briefing'); }} />
              </div>

              <h2 className="gs-sr-only">Today&rsquo;s intelligence, in brief</h2>
              <div className="ih-section">
                <div className="ih-section-head"><h3>{signal ? 'For you' : 'Most important now'}</h3>
                  <span className="ih-count">{signal ? (tuningTo ? 'Tuned to ' + tuningTo : 'Tuned to what you read') : 'Read a few to personalise'}</span></div>
                {forYouTiers.lead && <LeadCard b={forYouTiers.lead} forYou={signal} />}
                {(forYouTiers.subs.length > 0 || forYouTiers.river.length > 0) && (
                  // include the sub-leads (ranks 2-3) then the river — they were dropped before, so the
                  // overview jumped from the lead straight to the 4th item
                  <div className="ih-grid" style={{ marginTop: 16 }}>
                    {[...forYouTiers.subs, ...forYouTiers.river].slice(0, 4).map((b) => <BriefingCard key={b.id} b={b} forYou={signal} />)}
                  </div>
                )}
              </div>

              <div className="ih-section">
                <div className="ih-section-head"><h3>Frontier podium</h3><span className="ih-count">Top of the model board</span></div>
                <div className="ih-podium">
                  {podium.map((m) => (
                    <div className="ih-pod" data-rank={m.rank} key={m.name}>
                      <div className="ih-pod-rank">#{m.rank}</div>
                      <div className="ih-pod-name">{m.name}</div>
                      <div className="ih-pod-co">{m.company}</div>
                      <div className="ih-pod-score"><b>{m.score}</b><span>/ 100</span></div>
                    </div>
                  ))}
                </div>
              </div>

              {movement.length > 0 && (
                <div className="ih-section">
                  <div className="ih-section-head"><h3>What&rsquo;s moving</h3><span className="ih-count">New entrants and risers across the boards</span></div>
                  <div className="ih-move">
                    {movement.slice(0, 6).map((m) => (
                      <button className="ih-move-card" key={m.board + ':' + m.name}
                        aria-label={m.name + (m.kind === 'new' ? ' is new on the ' : ' has risen ' + m.amt + ' on the ') + BOARD_META[m.board].label + ' board'}
                        onClick={() => { setBoard(m.board); switchTab('leaderboards'); }}>
                        <span className={'ih-move-tag ' + m.kind} aria-hidden="true">{m.kind === 'new' ? 'New' : '▲ ' + m.amt}</span>
                        <span className="ih-move-name">{m.name}</span>
                        <span className="ih-move-meta">{m.company} · {BOARD_META[m.board].label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="ih-section">
                <div className="ih-section-head"><h3>Themes in play</h3></div>
                <div className="ih-chips">
                  {intel.topics.map((t) => (
                    <button key={t.id} className="ih-chip" onClick={() => { setTopic(t.id); recordTopicFocus(t.id); setProfile(getProfile()); switchTab('briefing'); }}>
                      <span className="ih-dot" style={{ background: `hsl(${t.hue} 80% 60%)` }} />{t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'briefing' && (
            <div className="ih-panel" role="tabpanel" id="ih-panel-briefing" aria-labelledby="ih-tab-briefing" tabIndex={0}>
              <span className="ih-eyebrow">The feed</span>
              <h1 className="ih-h2">Today's briefing</h1>
              <p className="ih-sub">{topic ? `Filtered to ${TOPIC_LABEL[topic]}.` : signal ? 'Ordered by what you have been reading.' : 'Ordered by what matters most right now.'} Open any story for the full read.</p>
              <div className="ih-chips" style={{ margin: '20px 0 8px' }}>
                <button className={'ih-chip' + (!topic ? ' on' : '')} aria-pressed={!topic} onClick={() => setTopic(null)}>All</button>
                {intel.topics.map((t) => (
                  <button key={t.id} className={'ih-chip' + (topic === t.id ? ' on' : '')} aria-pressed={topic === t.id} onClick={() => { setTopic(t.id); recordTopicFocus(t.id); setProfile(getProfile()); }}>
                    <span className="ih-dot" style={{ background: `hsl(${t.hue} 80% 60%)` }} />{t.label}
                  </button>
                ))}
              </div>
              <div className="gs-sr-only" aria-live="polite">{filtered.length} item{filtered.length === 1 ? '' : 's'}{topic ? ' in ' + TOPIC_LABEL[topic] : ''}</div>
              {filtered.length ? (
                <div style={{ marginTop: 18 }}>
                  {briefingTiers.lead && <LeadCard b={briefingTiers.lead} forYou={signal && !topic} />}
                  {(briefingTiers.subs.length > 0 || briefingTiers.river.length > 0) && (
                    <>
                      <div className="ih-tier-div" aria-hidden="true"><span>More from the desk</span></div>
                      <div className="ih-grid">
                        {[...briefingTiers.subs, ...briefingTiers.river].map((b) => <BriefingCard key={b.id} b={b} forYou={signal && !topic} />)}
                      </div>
                    </>
                  )}
                </div>
              ) : <div className="ih-grid" style={{ marginTop: 16 }}><div className="ih-empty"><b>Nothing here yet</b>No items under this theme in the current briefing.</div></div>}
            </div>
          )}

          {tab === 'leaderboards' && (
            <div className="ih-panel" role="tabpanel" id="ih-panel-leaderboards" aria-labelledby="ih-tab-leaderboards" tabIndex={0}>
              <span className="ih-eyebrow">The boards</span>
              <h1 className="ih-h2">{BOARD_META[board].label}</h1>
              <p className="ih-sub">Composite scores, our emphasis: {weightStr}. Open a row for the full breakdown, or hit <b>Compare</b> on any row to line entries up side by side.</p>
              <div className="ih-boardbar">
                <div className="ih-boardswitch" role="group" aria-label="Choose a leaderboard">
                  {Object.keys(boardsData).map((k) => (
                    <button key={k} className={board === k ? 'on' : ''} aria-pressed={board === k} onClick={() => { setBoard(k); setOpenId(null); }}>{BOARD_META[k].label}</button>
                  ))}
                </div>
                {compare.length > 0 ? (
                  <button className="ih-cmp-jump" onClick={() => switchTab('compare')}>
                    {compare.length < 2 ? 'Add 1 more to compare' : 'Compare'}<span className="ih-tabcount">{compare.length}</span><span aria-hidden="true">→</span>
                  </button>
                ) : (
                  // persistent affordance so Compare is discoverable before anything is selected
                  <span className="ih-cmp-hint"><span className="ih-cmp-hint-i" aria-hidden="true">+</span>Hit <b>Compare</b> on any row to line entries up side by side</span>
                )}
              </div>
              <div className="ih-board">
                {rows.map((r) => {
                  const open = openId === board + ':' + r.name;
                  const inCmp = !!compare.find((x) => x.board === board && x.name === r.name);
                  const cmpFull = compare.length >= 3 && !inCmp;
                  return (
                    <div className="ih-row" data-rank={r.rank} key={r.name}>
                      <div className="ih-row-top">
                        <button className="ih-row-head" aria-expanded={open} onClick={() => setOpenId(open ? null : board + ':' + r.name)}>
                          <span className="ih-rank">{r.rank}</span>
                          <Logo domain={r.domain} name={r.company} className="ih-row-logo" />
                          <span className="ih-row-name"><b>{r.name}</b><span>{r.company}</span></span>
                          <span className={'ih-row-delta ' + deltaClass(r.delta)}>{r.delta}</span>
                          <span className="ih-scorewrap"><ScoreBar score={r.score} /><span className="ih-score">{r.score}</span></span>
                        </button>
                        <button className={'ih-row-cmp' + (inCmp ? ' on' : '')} aria-pressed={inCmp} disabled={cmpFull}
                          aria-label={(inCmp ? 'Remove ' : 'Add ') + r.name + (inCmp ? ' from compare' : ' to compare')}
                          title={cmpFull ? 'Compare holds three' : inCmp ? 'In compare' : 'Add to compare'} onClick={() => toggleCompare(r.name)}>
                          <span className="ih-row-cmp-i" aria-hidden="true">{inCmp ? '✓' : '+'}</span><span className="ih-row-cmp-t">Compare</span>
                        </button>
                      </div>
                      {open && (
                        <div className="ih-row-detail">
                          <p>{r.blurb}</p>
                          <div className="ih-pillars">
                            {Object.entries(r.pillars || {}).map(([k, v]) => (
                              <div className="ih-pillar" key={k}><span className="pn">{k}</span><span className="pb" aria-hidden="true"><i style={{ width: v + '%' }} /></span><span className="pv">{v}</span></div>
                            ))}
                          </div>
                          <div style={{ marginTop: 14 }}>
                            <button className={'ih-cmp-btn' + (inCmp ? ' on' : '')} disabled={cmpFull} onClick={() => toggleCompare(r.name)}>
                              {inCmp ? 'In compare ✓' : cmpFull ? 'Compare is full (3)' : 'Add to compare'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'compare' && (
            <div className="ih-panel" role="tabpanel" id="ih-panel-compare" aria-labelledby="ih-tab-compare" tabIndex={0}>
              <span className="ih-eyebrow">Side by side</span>
              <h1 className="ih-h2">Compare</h1>
              <p className="ih-sub">Add up to three entries from any leaderboard (hit "Compare" on a row), then read them head to head. The leader in each pillar is highlighted.</p>
              {cmpRows.length ? (
                <div className="ih-cmp-wrap" style={{ marginTop: 22 }}>
                  <table className="ih-cmp-table">
                    <caption className="gs-sr-only">Comparison of {cmpRows.map((r) => r.name).join(', ')}. The leader in each row is marked.</caption>
                    <thead>
                      <tr>
                        <td className="ih-cmp-corner" />
                        {cmpRows.map((r) => (
                          <th scope="col" key={r._board + '|' + r.name}>
                            <div className="ih-cmp-name">{r.name}</div>
                            <div className="ih-cmp-co">{r.company}</div>
                            <button className="ih-cmp-x" aria-label={'Remove ' + r.name + ' from compare'} onClick={() => setCompare((c) => c.filter((x) => !(x.board === r._board && x.name === r.name)))}><X /></button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="ih-cmp-scorerow">
                        <th scope="row">Score</th>
                        {cmpRows.map((r) => (
                          <td key={r._board + '|' + r.name} className={r.score === cmpMaxScore ? 'lead' : ''}>
                            <b>{r.score}</b><span className="u">/100</span>
                            {r.score === cmpMaxScore && cmpRows.length > 1 && <span className="ih-cmp-lead" aria-label="leads">★</span>}
                          </td>
                        ))}
                      </tr>
                      {cmpPillars.map((k) => {
                        const vals = cmpRows.map((r) => (r.pillars && r.pillars[k] != null ? r.pillars[k] : -1));
                        const lead = Math.max(...vals);
                        return (
                          <tr key={k}>
                            <th scope="row">{humanize(k)}</th>
                            {cmpRows.map((r) => {
                              const v = r.pillars && r.pillars[k];
                              if (v == null) return <td key={r._board + '|' + r.name} className="na" aria-label="not rated">·</td>;
                              return (
                                <td key={r._board + '|' + r.name} className={v === lead && cmpRows.length > 1 ? 'lead' : ''}>
                                  <span className="ih-cmp-bar" aria-hidden="true"><i style={{ width: v + '%' }} /></span>
                                  <span className="ih-cmp-val">{v}{v === lead && cmpRows.length > 1 && <span className="ih-cmp-lead" aria-label="leads">★</span>}</span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {cmpMultiBoard && <p className="ih-cmp-note">You are comparing across different boards, so only the composite score lines up directly; the pillars differ by category.</p>}
                </div>
              ) : (
                <div className="ih-cmp-empty" style={{ marginTop: 22 }}>
                  <b style={{ display: 'block', color: 'var(--gs-text)', fontSize: '1rem', marginBottom: 6 }}>Nothing to compare yet</b>
                  Pick up to three models, products or tools and read them head to head.
                  <div style={{ marginTop: 16 }}><button className="ih-cmp-btn" onClick={() => switchTab('leaderboards')}>Browse the leaderboards →</button></div>
                </div>
              )}
            </div>
          )}

          {tab === 'sourcing' && (
            <div className="ih-panel" role="tabpanel" id="ih-panel-sourcing" aria-labelledby="ih-tab-sourcing" tabIndex={0}>
              <span className="ih-eyebrow">Transparency</span>
              <h1 className="ih-h2">How this is sourced</h1>
              <p className="ih-sub">{intel.meta.cadence} {intel.meta.note} The "Greatstone read" on each item is our own analysis, framed as the questions worth exploring rather than advice.</p>
              <div className="ih-section">
                <div className="ih-section-head"><h3>The roster</h3><span className="ih-count">{intel.sources.length} sources</span></div>
                <div className="ih-srcgrid">
                  {intel.sources.map((s) => (
                    <a className="ih-srccard" href={s.url} target="_blank" rel="noopener noreferrer" key={s.name}>
                      <span className={'ih-srckind ' + s.kind}>{s.kind}</span><span style={{ fontWeight: 700, fontSize: '.86rem' }}>{s.name}</span>
                    </a>
                  ))}
                </div>
              </div>
              <div className="ih-section">
                <div className="ih-section-head"><h3>How the boards are scored</h3></div>
                <div className="ih-feed">
                  {Object.entries(WEIGHTS).map(([k, w]) => (
                    <div className="ih-srccard" key={k} style={{ display: 'block' }}>
                      <b style={{ fontWeight: 800 }}>{BOARD_META[k].label}</b>
                      <p className="ih-sub" style={{ marginTop: 6 }}>{Object.entries(w).map(([p, v]) => `${p} ${Math.round(v * 100)}%`).join('  ·  ')}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
