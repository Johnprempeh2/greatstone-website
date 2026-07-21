// The working screens inside the Websites & Web Apps device frame.
//
// Each one does the job its service exists to do, for real, in the browser: the directory genuinely
// filters, the board genuinely refuses a double-booking, the form genuinely validates, the booking
// genuinely takes the slot out of availability. Nothing here calls a network.
//
// A11y notes that apply to all of them: every control is a real button or labelled input, results and
// refusals are announced through aria-live regions, nothing depends on drag or on colour alone, and the
// two-tap select-then-place pattern on the board is deliberate (drag-and-drop is unusable by keyboard).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const prefersReduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/* ── marketing page: edit it yourself, or test two versions of it ─────────────────────────────────── */
function PageScreen({ data }) {
  const variants = data.variants;
  const [vi, setVi] = useState(0);
  const [editing, setEditing] = useState(false);
  const [copy, setCopy] = useState({ headline: data.headline, cta: data.cta });
  const [past, setPast] = useState([]);
  const snapshot = useRef(copy);
  const headRef = useRef(null);

  const live = variants ? { headline: variants[vi].headline, cta: variants[vi].cta } : copy;

  const startEdit = () => { snapshot.current = copy; setEditing(true); };
  const finishEdit = () => {
    setEditing(false);
    const was = snapshot.current;
    if (was.headline !== copy.headline || was.cta !== copy.cta) setPast((p) => [...p, was]);
  };
  const rollBack = () => {
    if (!past.length) return;
    setCopy(past[past.length - 1]);
    setPast(past.slice(0, -1));
  };

  useEffect(() => { if (editing && headRef.current) headRef.current.focus(); }, [editing]);

  return (
    <div className="swd-page">
      <div className="swd-toolbar">
        {variants ? (
          <>
            <span className="swd-tool-l" id="swd-var-l">Version</span>
            <div className="swd-seg" role="group" aria-labelledby="swd-var-l">
              {variants.map((v, i) => (
                <button
                  key={v.label} type="button" className={'swd-seg-b' + (i === vi ? ' is-on' : '')}
                  aria-pressed={i === vi} onClick={() => setVi(i)}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <span className="swd-tool-note" aria-live="polite">
              Version {variants[vi].label}: {variants[vi].rate}% of visitors enquire
              {vi > 0 && variants[vi].rate > variants[0].rate
                ? ' (' + (variants[vi].rate - variants[0].rate).toFixed(1) + ' points above A)'
                : ''}
            </span>
          </>
        ) : (
          <>
            <button type="button" className={'swd-tool-b' + (editing ? ' is-on' : '')} onClick={editing ? finishEdit : startEdit}>
              {editing ? 'Done' : 'Edit this page'}
            </button>
            {data.history ? (
              <>
                <button type="button" className="swd-tool-b" onClick={rollBack} disabled={!past.length}>
                  Roll back
                </button>
                <span className="swd-tool-note" aria-live="polite">
                  {past.length ? past.length + (past.length === 1 ? ' version saved' : ' versions saved') : 'No edits yet'}
                </span>
              </>
            ) : (
              <span className="swd-tool-note">{editing ? 'Change the words on the page itself.' : 'Nothing is locked. Try it.'}</span>
            )}
          </>
        )}
      </div>

      <div className="swd-site">
        <div className="swd-sitebar">
          <span className="swd-brandmark" aria-hidden="true" />
          <span className="swd-brandname">Northgate</span>
          <nav className="swd-nav" aria-label="Sample site">
            {(data.nav || []).map((n) => <span key={n}>{n}</span>)}
          </nav>
        </div>

        <div className="swd-hero">
          <p className="swd-eyebrow">{data.eyebrow}</p>
          {editing ? (
            <input
              ref={headRef} className="swd-h1 swd-input" value={copy.headline} aria-label="Page headline"
              onChange={(e) => setCopy((c) => ({ ...c, headline: e.target.value }))}
            />
          ) : (
            <p className="swd-h1">{live.headline}</p>
          )}
          <p className="swd-sub">{data.sub}</p>
          {editing ? (
            <input
              className="swd-cta swd-input is-cta" value={copy.cta} aria-label="Button label"
              onChange={(e) => setCopy((c) => ({ ...c, cta: e.target.value }))}
            />
          ) : (
            <span className="swd-cta">{live.cta}</span>
          )}
        </div>

        <div className="swd-cards">
          {(data.cards || []).map((c) => (
            <div key={c.t} className="swd-card">
              <p className="swd-card-t">{c.t}</p>
              <p className="swd-card-d">{c.d}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── portal dashboard: the answer is on screen, so nobody rings to ask ────────────────────────────── */
function DashScreen({ data }) {
  const [rows, setRows] = useState(data.rows);
  const [said, setSaid] = useState('');

  const act = () => {
    setRows((r) => [{ ...data.action.row, fresh: true }, ...r]);
    setSaid(data.action.said);
  };
  const reset = () => { setRows(data.rows); setSaid(''); };

  return (
    <div className="swd-dash">
      <div className="swd-dashtop">
        <span className="swd-av" aria-hidden="true">{data.who.slice(0, 1)}</span>
        <div>
          <p className="swd-who">{data.who}</p>
          <p className="swd-role">{data.role}</p>
        </div>
      </div>

      <div className="swd-tiles">
        {data.tiles.map((t) => (
          <div key={t.l} className="swd-tile"><b>{t.v}</b><i>{t.l}</i></div>
        ))}
      </div>

      <ul className="swd-rows">
        {rows.map((r, i) => (
          <li key={r.t + i} className={'swd-row' + (r.fresh ? ' is-fresh' : '')}>
            <span className={'swd-rowdot' + (r.ok ? ' is-ok' : '')} aria-hidden="true" />
            <span className="swd-rowbody">
              <span className="swd-row-t">{r.t}</span>
              <span className="swd-row-s">{r.s}</span>
            </span>
            <span className="swd-row-w">{r.when}</span>
          </li>
        ))}
      </ul>

      <div className="swd-dashfoot">
        <button type="button" className="swd-btn" onClick={act} disabled={!!said}>{data.action.label}</button>
        {said ? <button type="button" className="swd-link" onClick={reset}>Reset</button> : null}
        <p className="swd-said" aria-live="polite">{said}</p>
      </div>
    </div>
  );
}

/* ── booking: pick, pay a deposit, and the slot leaves availability ───────────────────────────────── */
function BookScreen({ data }) {
  const [si, setSi] = useState(null);
  const [day, setDay] = useState(null);
  const [slot, setSlot] = useState(null);
  const [taken, setTaken] = useState([]);
  const [booked, setBooked] = useState(null);

  const svc = si === null ? null : data.services[si];
  const dayObj = data.days.find((d) => d.d === day) || null;
  const isTaken = (d, s) => taken.indexOf(d + '|' + s) > -1;

  const confirm = () => {
    setTaken((t) => [...t, day + '|' + slot]);
    setBooked({ svc, day, slot, ref: 'BK-' + (4471 + taken.length) });
  };
  const again = () => { setBooked(null); setSi(null); setDay(null); setSlot(null); };

  if (booked) {
    return (
      <div className="swd-book">
        <div className="swd-confirm" role="status">
          <span className="swd-confirm-i" aria-hidden="true"><Check /></span>
          <p className="swd-confirm-t">Booked, and confirmed</p>
          <p className="swd-confirm-d">
            {booked.svc.n}, {booked.day} at {booked.slot}. {booked.svc.dep ? 'Deposit of £' + booked.svc.dep + ' taken.' : 'No deposit needed.'}
          </p>
          <p className="swd-confirm-ref">Reference {booked.ref}</p>
          <p className="swd-confirm-x">A confirmation and a reminder go out on their own. That slot has left availability.</p>
          <button type="button" className="swd-btn" onClick={again}>Book another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="swd-book">
      <fieldset className="swd-fs">
        <legend className="swd-fs-l">1. What for</legend>
        <div className="swd-opts">
          {data.services.map((s, i) => (
            <button
              key={s.n} type="button" className={'swd-opt' + (i === si ? ' is-on' : '')} aria-pressed={i === si}
              onClick={() => setSi(i)}
            >
              {s.n}<span className="swd-opt-m">{s.mins} min{s.dep ? ' · £' + s.dep + ' deposit' : ''}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="swd-fs" disabled={si === null}>
        <legend className="swd-fs-l">2. When</legend>
        <div className="swd-opts">
          {data.days.map((d) => (
            <button
              key={d.d} type="button" className={'swd-opt is-day' + (d.d === day ? ' is-on' : '')} aria-pressed={d.d === day}
              onClick={() => { setDay(d.d); setSlot(null); }}
            >
              {d.d}
            </button>
          ))}
        </div>
        {dayObj ? (
          <div className="swd-opts swd-slots">
            {dayObj.slots.map((s) => {
              const gone = isTaken(dayObj.d, s);
              return (
                <button
                  key={s} type="button" className={'swd-opt is-slot' + (s === slot ? ' is-on' : '')}
                  aria-pressed={s === slot} disabled={gone} onClick={() => setSlot(s)}
                >
                  {s}{gone ? <span className="gs-sr-only"> (taken)</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </fieldset>

      <div className="swd-bookfoot">
        <p className="swd-summary" aria-live="polite">
          {svc && day && slot
            ? svc.n + ', ' + day + ' at ' + slot + (svc.dep ? '. £' + svc.dep + ' deposit now.' : '. No deposit.')
            : 'Pick a service, a day and a time.'}
        </p>
        <button type="button" className="swd-btn" onClick={confirm} disabled={!(svc && day && slot)}>
          Confirm booking
        </button>
      </div>
    </div>
  );
}

/* ── intake form: conditional questions, validation on the spot, a receipt at the end ─────────────── */
function FormScreen({ data }) {
  const [site, setSite] = useState('');
  const [reg, setReg] = useState('');
  const [visit, setVisit] = useState('');
  const [photos, setPhotos] = useState(0);
  const [tried, setTried] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const refs = { site: useRef(null), reg: useRef(null), visit: useRef(null), photos: useRef(null) };

  const needsPhotos = visit === data.visit.photosFor;
  const regOk = new RegExp(data.reg.pattern).test(reg.toUpperCase().trim());
  const errors = {
    site: !site ? 'Choose a site.' : '',
    reg: !reg ? 'Enter the registration.' : !regOk ? 'That is not a valid registration. ' + data.reg.hint : '',
    visit: !visit ? 'Choose a visit type.' : '',
    photos: needsPhotos && photos < 1 ? data.photosHint : '',
  };
  const bad = Object.keys(errors).filter((k) => errors[k]);

  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (bad.length) {
      const first = refs[bad[0]];
      if (first && first.current) first.current.focus();
      return;
    }
    const now = new Date();
    setReceipt({
      ref: 'JS-2026-0' + (884 + photos),
      at: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      site, reg: reg.toUpperCase().trim(), visit, photos,
    });
  };

  if (receipt) {
    return (
      <div className="swd-form">
        <div className="swd-confirm" role="status">
          <span className="swd-confirm-i" aria-hidden="true"><Check /></span>
          <p className="swd-confirm-t">Filed, and complete</p>
          <p className="swd-confirm-d">{receipt.visit}, {receipt.reg}, {receipt.site}.{receipt.photos ? ' ' + receipt.photos + ' photo' + (receipt.photos === 1 ? '' : 's') + ' attached.' : ''}</p>
          <p className="swd-confirm-ref">Receipt {receipt.ref}, timed at {receipt.at}</p>
          <p className="swd-confirm-x">It landed in the register complete. Nobody re-keys it, and the timestamp settles the dispute.</p>
          <button type="button" className="swd-btn" onClick={() => { setReceipt(null); setTried(false); setSite(''); setReg(''); setVisit(''); setPhotos(0); }}>
            Fill another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="swd-form" onSubmit={submit} noValidate>
      <p className="swd-form-t">{data.title}</p>

      <div className="swd-field">
        <label className="swd-lab" htmlFor="swd-site">{data.site.label}</label>
        <select
          id="swd-site" ref={refs.site} className="swd-ctl" value={site} onChange={(e) => setSite(e.target.value)}
          aria-invalid={tried && !!errors.site} aria-describedby={tried && errors.site ? 'swd-site-e' : undefined}
        >
          <option value="">Choose…</option>
          {data.site.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {tried && errors.site ? <p className="swd-err" id="swd-site-e">{errors.site}</p> : null}
      </div>

      <div className="swd-field">
        <label className="swd-lab" htmlFor="swd-reg">{data.reg.label}</label>
        <input
          id="swd-reg" ref={refs.reg} className="swd-ctl" value={reg} placeholder={data.reg.hint.replace('Format: ', '')}
          onChange={(e) => setReg(e.target.value)} autoComplete="off" spellCheck="false"
          aria-invalid={tried && !!errors.reg}
          aria-describedby={tried && errors.reg ? 'swd-reg-e' : 'swd-reg-h'}
        />
        {tried && errors.reg
          ? <p className="swd-err" id="swd-reg-e">{errors.reg}</p>
          : <p className="swd-hint" id="swd-reg-h">{reg && regOk ? 'Looks right.' : data.reg.hint}</p>}
      </div>

      <fieldset className="swd-field swd-radios">
        <legend className="swd-lab">{data.visit.label}</legend>
        <div className="swd-opts">
          {data.visit.options.map((o, i) => (
            <label key={o} className={'swd-radio' + (visit === o ? ' is-on' : '')}>
              <input
                type="radio" name="swd-visit" value={o} checked={visit === o} ref={i === 0 ? refs.visit : undefined}
                onChange={() => setVisit(o)}
              />
              {o}
            </label>
          ))}
        </div>
        {tried && errors.visit ? <p className="swd-err">{errors.visit}</p> : null}
      </fieldset>

      {/* the conditional question: it only exists because of the answer above it */}
      {needsPhotos ? (
        <div className="swd-field swd-cond">
          <span className="swd-lab" id="swd-photos-l">Photos of the damage</span>
          <div className="swd-photos">
            {Array.from({ length: photos }, (_, i) => (
              <span key={i} className="swd-thumb" aria-hidden="true" />
            ))}
            <button
              type="button" ref={refs.photos} className="swd-addphoto" onClick={() => setPhotos((p) => p + 1)}
              aria-describedby="swd-photos-l"
            >
              + Add photo
            </button>
          </div>
          <p className="swd-hint">{photos ? photos + ' attached to this job' : 'Taken on the phone, attached to the record.'}</p>
          {tried && errors.photos ? <p className="swd-err">{errors.photos}</p> : null}
        </div>
      ) : null}

      <div className="swd-formfoot">
        <button type="submit" className="swd-btn">File the sheet</button>
        <p className="swd-said" aria-live="polite">
          {tried && bad.length ? bad.length + (bad.length === 1 ? ' answer needs fixing' : ' answers need fixing') : ''}
        </p>
      </div>
    </form>
  );
}

/* ── dispatch board: select a job, place it on a crew, and it refuses the impossible ──────────────── */
function BoardScreen({ data }) {
  const [assign, setAssign] = useState({});
  const [sel, setSel] = useState(null);
  const [warn, setWarn] = useState('');

  const jobById = useMemo(() => {
    const m = {};
    data.jobs.forEach((j) => { m[j.id] = j; });
    return m;
  }, [data.jobs]);

  const unassigned = data.jobs.filter((j) => !assign[j.id]);
  const forCrew = (cid) => data.jobs.filter((j) => assign[j.id] === cid);
  const scheduled = data.jobs.length - unassigned.length;

  const place = (crew) => {
    if (!sel) return;
    const job = jobById[sel];
    if (!crew) { setAssign((a) => { const n = { ...a }; delete n[job.id]; return n; }); setSel(null); setWarn(''); return; }
    if (crew.skills.indexOf(job.skill) === -1) {
      setWarn(crew.n + ' is not ' + job.skill.toLowerCase() + ' qualified, so that job cannot go there.');
      return;
    }
    const clash = forCrew(crew.id).find((j) => j.slot === job.slot);
    if (clash) {
      setWarn(crew.n + ' already has ' + job.slot + ' (' + clash.t + '). That would be a double-booking.');
      return;
    }
    setAssign((a) => ({ ...a, [job.id]: crew.id }));
    setSel(null);
    setWarn('');
  };

  // A plain render function, not a nested component: a nested component type is rebuilt every render, so
  // React would unmount and remount each button and throw away keyboard focus mid-interaction.
  const jobBtn = (j) => (
    <button
      key={j.id} type="button" className={'swd-job' + (sel === j.id ? ' is-sel' : '')} aria-pressed={sel === j.id}
      onClick={() => { setSel(sel === j.id ? null : j.id); setWarn(''); }}
    >
      <span className="swd-job-t">{j.t}</span>
      <span className="swd-job-m">{j.slot} · {j.skill}</span>
    </button>
  );

  return (
    <div className="swd-board">
      <p className="swd-boardhint">
        {sel ? 'Now choose where it goes.' : 'Choose a job, then choose who takes it.'}
      </p>

      <div className="swd-cols">
        <div className="swd-col">
          <button
            type="button" className={'swd-colhead' + (sel && assign[sel] ? ' is-drop' : '')}
            onClick={() => place(null)} disabled={!sel || !assign[sel]}
          >
            Unassigned <span className="swd-count">{unassigned.length}</span>
          </button>
          <div className="swd-colbody">
            {unassigned.map(jobBtn)}
            {!unassigned.length ? <p className="swd-empty">Nothing waiting.</p> : null}
          </div>
        </div>

        {data.crew.map((c) => (
          <div key={c.id} className="swd-col">
            <button
              type="button" className={'swd-colhead' + (sel && assign[sel] !== c.id ? ' is-drop' : '')}
              onClick={() => place(c)} disabled={!sel || assign[sel] === c.id}
            >
              {c.n} <span className="swd-count">{forCrew(c.id).length}</span>
              <span className="swd-skills">{c.skills.join(', ')}</span>
            </button>
            <div className="swd-colbody">
              {forCrew(c.id).map(jobBtn)}
              {!forCrew(c.id).length ? <p className="swd-empty">Free all day.</p> : null}
            </div>
          </div>
        ))}
      </div>

      <div className="swd-boardfoot">
        <p className={'swd-warn' + (warn ? ' is-on' : '')} role="alert">{warn}</p>
        <p className="swd-said" aria-live="polite">
          {scheduled} of {data.jobs.length} scheduled{scheduled === data.jobs.length ? ', with no double-bookings' : ''}
        </p>
      </div>
    </div>
  );
}

/* ── directory: the search actually searches ──────────────────────────────────────────────────────── */
function FindScreen({ data }) {
  const [q, setQ] = useState('');
  const [place, setPlace] = useState('');

  const hits = data.records.filter((r) => {
    if (place && r.c !== place) return false;
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return r.n.toLowerCase().indexOf(needle) > -1 || r.r.toLowerCase().indexOf(needle) > -1;
  });

  return (
    <div className="swd-find">
      <div className="swd-findbar">
        <label className="gs-sr-only" htmlFor="swd-q">Search members by name or discipline</label>
        <input
          id="swd-q" className="swd-ctl swd-search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search a name or a discipline" type="search" autoComplete="off"
        />
      </div>

      <div className="swd-opts swd-places" role="group" aria-label="Filter by city">
        <button type="button" className={'swd-opt is-chip' + (!place ? ' is-on' : '')} aria-pressed={!place} onClick={() => setPlace('')}>
          All
        </button>
        {data.places.map((p) => (
          <button key={p} type="button" className={'swd-opt is-chip' + (place === p ? ' is-on' : '')} aria-pressed={place === p} onClick={() => setPlace(p)}>
            {p}
          </button>
        ))}
      </div>

      <p className="swd-said" aria-live="polite">
        {hits.length} of {data.records.length} members{place ? ' in ' + place : ''}{q.trim() ? ' matching “' + q.trim() + '”' : ''}
      </p>

      <ul className="swd-hits">
        {hits.map((r) => (
          <li key={r.n} className="swd-hit">
            <span className="swd-av is-sm" aria-hidden="true">{r.n.slice(0, 1)}</span>
            <span className="swd-hitbody">
              <span className="swd-hit-n">
                {r.n}
                {r.v ? <span className="swd-verif"><Check /> Verified</span> : <span className="swd-verif is-off">Renewal due</span>}
              </span>
              <span className="swd-hit-m">{r.r} · {r.c} · member since {r.since}</span>
            </span>
          </li>
        ))}
        {!hits.length ? <li className="swd-empty">No members match that. Try a discipline, or clear the city.</li> : null}
      </ul>
    </div>
  );
}

/* ── credential lookup: status only, never the person's details ───────────────────────────────────── */
function VerifyScreen({ data }) {
  const [code, setCode] = useState('');
  const [state, setState] = useState('idle'); // idle | checking | done
  const [result, setResult] = useState(null);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const check = useCallback((raw) => {
    const key = (raw || '').toUpperCase().trim();
    const found = data.records[key] || null;
    const settle = () => { setResult(found ? { ...found, key } : { state: 'none', key }); setState('done'); };
    if (prefersReduced()) { settle(); return; }
    setState('checking');
    clearTimeout(timer.current);
    timer.current = setTimeout(settle, 380);
  }, [data.records]);

  const STATE_COPY = {
    valid: { tag: 'In good standing', cls: 'is-valid' },
    suspended: { tag: 'Not in good standing', cls: 'is-susp' },
    none: { tag: 'No such credential', cls: 'is-none' },
  };

  return (
    <div className="swd-verify">
      <form
        className="swd-verifybar"
        onSubmit={(e) => { e.preventDefault(); check(code); }}
      >
        <label className="gs-sr-only" htmlFor="swd-code">Membership number</label>
        <input
          id="swd-code" className="swd-ctl swd-search" value={code} placeholder={data.placeholder}
          onChange={(e) => { setCode(e.target.value); setState('idle'); }} autoComplete="off" spellCheck="false"
        />
        <button type="submit" className="swd-btn" disabled={!code.trim() || state === 'checking'}>
          {state === 'checking' ? 'Checking…' : 'Verify'}
        </button>
      </form>

      <div className="swd-samples">
        <span className="swd-tool-l">Try</span>
        {data.samples.map((s) => (
          <button key={s} type="button" className="swd-opt is-chip" onClick={() => { setCode(s); check(s); }}>{s}</button>
        ))}
        <span className="swd-tool-note">or type anything to see a miss</span>
      </div>

      <div className="swd-result" role="status">
        {state === 'checking' ? <p className="swd-empty">Checking the register…</p> : null}
        {state === 'done' && result ? (
          <div className={'swd-cred ' + STATE_COPY[result.state].cls}>
            <p className="swd-cred-tag">{STATE_COPY[result.state].tag}</p>
            {result.state === 'none' ? (
              <p className="swd-cred-d">Nothing on the register for {result.key}. If someone gave you that number, it is not one of ours.</p>
            ) : (
              <>
                <p className="swd-cred-n">{result.name}</p>
                <p className="swd-cred-d">{result.line}</p>
                <dl className="swd-cred-meta">
                  <div><dt>Number</dt><dd>{result.key}</dd></div>
                  <div><dt>Grade</dt><dd>{result.grade}</dd></div>
                  <div><dt>Valid until</dt><dd>{result.until}</dd></div>
                </dl>
              </>
            )}
          </div>
        ) : null}
        {state === 'idle' ? <p className="swd-empty">Enter a number, or scan the QR on the certificate.</p> : null}
      </div>

      <p className="swd-privline">
        The page confirms standing and nothing else. No address, no email, no phone number, whoever is asking.
      </p>
    </div>
  );
}

const KINDS = {
  page: PageScreen, dash: DashScreen, book: BookScreen,
  form: FormScreen, board: BoardScreen, find: FindScreen, verify: VerifyScreen,
};

export default function Screen({ screen }) {
  const C = KINDS[screen.kind];
  if (!C) return null;
  return <C data={screen[screen.kind] || screen} />;
}
