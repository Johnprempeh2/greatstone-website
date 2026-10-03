import { useEffect, useId, useRef, useState } from 'react';
import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { SECTORS } from './IndustryPicker.jsx';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site
import { track, getConsent, getAttribution } from '../lib/analytics.js';
import { openBooking } from '../lib/booking.js';
import {
  TEAM_SIZES, OTHER, LIMITS, EVEREST_OPENING, NOTICE_INTAKE, CONSENT_LABEL, NOTICE_LEAD,
  addWord, validateIntake, validateContact, orderAgents, avatarIndex, readGaClientId, makeFrontDoorClient,
} from '../lib/front-door.mjs';

// FrontDoor: "Meet your first three employees" (GRE-416 spec rev 2, screens S1 to S7) as one block, so
// editors can place it on the homepage and on its own page for ads and links. The visitor gives an
// intake, may chat with a small Everest, and sees three named employees before any email is asked for.
// Every model call, the bot check and the lead store live in the `front-door` edge function; this block
// only collects fields, shows answers and moves between screens. On the editor canvas it shows S1 and
// never calls the network.

const ime = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const client = makeFrontDoorClient({ url: ime.VITE_SUPABASE_URL || '', anonKey: ime.VITE_SUPABASE_ANON_KEY || '' });
const TURNSTILE_KEY = ime.VITE_TURNSTILE_SITE_KEY || '';
const AVATARS = 6; // monogram tints until the cap-v1 images land (B5, GRE-465)

// events only after the visitor accepted analytics in the ConsentBanner (spec section 3)
const trackConsented = (event, params) => { if (getConsent() === 'granted') track(event, params); };

function source() {
  if (typeof window === 'undefined') return {};
  return {
    page: (location.pathname + location.hash).slice(0, 200),
    referrer: (document.referrer || '').slice(0, 200),
    firstTouch: getAttribution().first,
    gaClientId: getConsent() === 'granted' ? readGaClientId(document.cookie) : null,
  };
}

// Cloudflare Turnstile, loaded only when a site key is configured and only once the intake is open.
let turnstileLoader = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!turnstileLoader) {
    turnstileLoader = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => resolve(window.turnstile);
      s.onerror = () => { turnstileLoader = null; reject(new Error('turnstile failed to load')); };
      document.head.appendChild(s);
    });
  }
  return turnstileLoader;
}

function Turnstile({ onToken }) {
  const host = useRef(null);
  useEffect(() => {
    if (!TURNSTILE_KEY) return undefined;
    let widget = null, dead = false;
    loadTurnstile().then((ts) => {
      if (dead || !host.current) return;
      widget = ts.render(host.current, {
        sitekey: TURNSTILE_KEY, theme: 'dark',
        callback: (t) => onToken(t), 'expired-callback': () => onToken(null), 'error-callback': () => onToken(null),
      });
    }).catch(() => onToken(null));
    return () => { dead = true; if (widget != null && window.turnstile) { try { window.turnstile.remove(widget); } catch (e) { /* gone */ } } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return TURNSTILE_KEY ? <div className="b-fd-turnstile" ref={host} /> : null;
}

// focus the new screen's heading so keyboard and screen-reader users land on it
function useScreenFocus(screen) {
  const ref = useRef(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (ref.current) ref.current.focus();
  }, [screen]);
  return ref;
}

const PrivacyLink = ({ children }) => <a className="b-fd-link" href="#go/privacy">{children}</a>;
const FieldError = ({ id, text }) => (text ? <p className="b-fd-err" id={id}>{text}</p> : null);

function Avatar({ name }) {
  return <span className={'b-fd-avatar t' + avatarIndex(name, AVATARS)} aria-hidden="true">{String(name).charAt(0)}</span>;
}

function AgentCard({ agent }) {
  return (
    <article className={'card b-fd-agent' + (agent.is_lead ? ' is-lead' : '')}>
      <header className="b-fd-agent-head">
        <Avatar name={agent.name} />
        <div>
          <h3 className="b-fd-agent-name">{agent.name}</h3>
          <p className="b-fd-agent-role">{agent.role}</p>
        </div>
      </header>
      {agent.is_lead ? <p className="b-fd-lead-tag">Leads the team: guards your brand and checks the other two</p> : null}
      <ul className="b-fd-traits" aria-label="Personality">
        {(agent.personality || []).map((t, i) => <li key={i}>{t}</li>)}
      </ul>
      <p className="b-fd-sub">First three tasks</p>
      <ol className="b-fd-tasks">{(agent.first_tasks || []).map((t, i) => <li key={i}>{t}</li>)}</ol>
      {agent.works_with ? <p className="b-fd-with">{agent.works_with}</p> : null}
    </article>
  );
}

export function FrontDoor({ id, puck, headline, ctaLabel }) {
  const editing = puck && puck.isEditing;
  const ref = useReveal();
  const uid = useId();
  const [screen, setScreen] = useState('entry'); // entry | intake | chat | building | team | declined | error | thanks
  const headRef = useScreenFocus(screen);

  // S2 intake
  const [form, setForm] = useState({ industry: '', other: '', company: '', teamSize: '' });
  const [words, setWords] = useState([]);
  const [wordDraft, setWordDraft] = useState('');
  const [errors, setErrors] = useState({});
  const [token, setToken] = useState(null);
  const [intake, setIntake] = useState(null);
  // S3 chat
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState('');
  // S4/S5
  const [team, setTeam] = useState(null);
  const [failure, setFailure] = useState('');
  // S6
  const [contact, setContact] = useState({ name: '', email: '', role: '', consent: false });
  const [contactErrors, setContactErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const visitorTurns = messages.filter((m) => m.from === 'visitor').length;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const start = () => {
    trackConsented('cta_click', { cta: 'front_door_start', cta_location: 'front_door' });
    setScreen('intake');
  };

  const commitWord = () => { setWords((w) => addWord(w, wordDraft)); setWordDraft(''); };
  const onWordKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitWord(); }
    else if (e.key === 'Backspace' && !wordDraft && words.length) setWords((w) => w.slice(0, -1));
  };

  const checkIntake = () => {
    const all = wordDraft.trim() ? addWord(words, wordDraft) : words;
    if (all !== words) { setWords(all); setWordDraft(''); }
    const r = validateIntake({ ...form, words: all }, SECTORS);
    if (!r.ok) { setErrors(r.errors); return null; }
    if (TURNSTILE_KEY && !token) { setErrors({ bot: 'Please wait for the check above to finish, then try again.' }); return null; }
    setErrors({});
    setIntake(r.intake);
    return r.intake;
  };

  const propose = async (forIntake, transcript) => {
    setScreen('building');
    setFailure('');
    try {
      const out = await client.propose({ intake: forIntake, messages: transcript, source: source(), turnstile: token });
      if (out.status === 'declined') { setScreen('declined'); return; }
      const agents = orderAgents(out.agents);
      if (agents.length !== 3) throw new Error('Something went wrong on our side. Please try again in a moment.');
      setTeam({ leadId: out.leadId, agents });
      setScreen('team');
    } catch (e) {
      setFailure(e.message);
      setScreen('error');
    }
  };

  const onBuild = (e) => { e.preventDefault(); const it = checkIntake(); if (it) propose(it, []); };
  const onTalkFirst = () => { const it = checkIntake(); if (it) { setMessages([{ from: 'everest', text: EVEREST_OPENING }]); setScreen('chat'); } };

  const sendChat = async (e) => {
    e.preventDefault();
    const text = draft.trim().slice(0, LIMITS.message);
    if (!text || chatBusy) return;
    const next = [...messages, { from: 'visitor', text }];
    setMessages(next); setDraft(''); setChatError(''); setChatBusy(true);
    try {
      const out = await client.chat({ intake, messages: next, turnstile: token });
      const withReply = out.reply ? [...next, { from: 'everest', text: out.reply }] : next;
      setMessages(withReply);
      const turns = next.filter((m) => m.from === 'visitor').length;
      // the cap is enforced on the server too; the page simply stops offering the box
      if (out.closed || turns >= LIMITS.chatTurns) propose(intake, withReply);
    } catch (err) {
      setMessages(messages); setDraft(text); setChatError(err.message);
    } finally { setChatBusy(false); }
  };

  const sendLead = async (e) => {
    e.preventDefault();
    const r = validateContact(contact);
    if (!r.ok) { setContactErrors(r.errors); return; }
    setContactErrors({}); setSendError(''); setSending(true);
    try {
      await client.lead({ leadId: team.leadId, contact: r.contact, consent: r.consent });
      setScreen('thanks');
    } catch (err) {
      // the form keeps what they typed; the walk-through link still works without the pack
      setSendError(err.message + ' You can also book the walk-through directly.');
    } finally { setSending(false); }
  };

  const heading = (text, cls = 'b-fd-h') => <h2 className={cls} ref={headRef} tabIndex={-1}>{text}</h2>;
  const errId = (k) => uid + 'err-' + k;
  const described = (k, extra) => ({ 'aria-invalid': errors[k] ? 'true' : undefined, 'aria-describedby': [errors[k] ? errId(k) : '', extra || ''].join(' ').trim() || undefined });

  return (
    <section ref={ref} className="b-fd" aria-label="Meet your first three employees">
      <div className="wrap" data-reveal>

        {(screen === 'entry' || editing) && (
          <div className="b-fd-entry">
            <EditableText editing={editing} id={id} field="headline" value={headline} as="h2" className="b-fd-pitch" placeholder="Pitch…" />
            <button type="button" className="b-cta gs-cta-lg gs-cta-fill" onClick={editing ? undefined : start}>{ctaLabel}<Arrow /></button>
          </div>
        )}

        {!editing && screen === 'intake' && (
          <form className="card b-fd-panel" onSubmit={onBuild} noValidate>
            {heading('Tell us about your business')}
            <div className="field">
              <label htmlFor={uid + 'industry'}>Industry</label>
              <select className="fld" id={uid + 'industry'} value={form.industry} onChange={set('industry')} required aria-required="true" {...described('industry')}>
                <option value="" disabled>Choose your industry…</option>
                {SECTORS.map((s) => <option key={s}>{s}</option>)}
                <option>{OTHER}</option>
              </select>
              {form.industry === OTHER && (
                <input className="fld b-fd-other" aria-label="Your industry" placeholder="Your industry" maxLength={LIMITS.other} value={form.other} onChange={set('other')} />
              )}
              <FieldError id={errId('industry')} text={errors.industry} />
            </div>
            <div className="field">
              <label htmlFor={uid + 'company'}>Company name</label>
              <input className="fld" id={uid + 'company'} autoComplete="organization" maxLength={LIMITS.company} value={form.company} onChange={set('company')} required aria-required="true" {...described('company')} />
              <FieldError id={errId('company')} text={errors.company} />
            </div>
            <div className="field">
              <label htmlFor={uid + 'words'}>Three words for your brand</label>
              <div className="b-fd-chips">
                {words.map((w, i) => (
                  <span className="b-fd-chip" key={w}>{w}
                    <button type="button" aria-label={'Remove ' + w} onClick={() => setWords((ws) => ws.filter((_, j) => j !== i))}>×</button>
                  </span>
                ))}
                {words.length < LIMITS.words && (
                  <input className="b-fd-chip-input" id={uid + 'words'} maxLength={LIMITS.word} value={wordDraft}
                    placeholder={words.length ? 'Next word' : 'For example: calm'} onChange={(e) => setWordDraft(e.target.value)}
                    onKeyDown={onWordKey} onBlur={() => wordDraft.trim() && commitWord()} {...described('words', uid + 'words-hint')} />
                )}
              </div>
              <p className="b-fd-hint" id={uid + 'words-hint'}>Press Enter after each word. {words.length} of 3.</p>
              <FieldError id={errId('words')} text={errors.words} />
            </div>
            <fieldset className="field b-fd-sizes">
              <legend>Team size (optional)</legend>
              {TEAM_SIZES.map((s) => (
                <label key={s} className="b-fd-size"><input type="radio" name={uid + 'size'} value={s} checked={form.teamSize === s} onChange={set('teamSize')} />{s}</label>
              ))}
            </fieldset>
            <Turnstile onToken={setToken} />
            <FieldError id={errId('bot')} text={errors.bot} />
            <p className="b-fd-notice">{NOTICE_INTAKE} <PrivacyLink>How we handle your data</PrivacyLink></p>
            <div className="b-fd-actions">
              <button className="b-cta" type="submit">Build my team<Arrow /></button>
              <button className="b-fd-textbtn" type="button" onClick={onTalkFirst}>Talk to Everest first</button>
            </div>
          </form>
        )}

        {!editing && screen === 'chat' && (
          <div className="card b-fd-panel">
            {heading('A few questions from Everest')}
            <ol className="b-fd-log" aria-live="polite" aria-relevant="additions">
              {messages.map((m, i) => (
                <li key={i} className={'b-fd-msg ' + m.from}><span className="b-fd-who">{m.from === 'everest' ? 'Everest' : 'You'}</span>{m.text}</li>
              ))}
              {chatBusy ? <li className="b-fd-msg everest is-typing"><span className="b-fd-who">Everest</span>Thinking…</li> : null}
            </ol>
            <form className="b-fd-chatform" onSubmit={sendChat}>
              <label className="b-fd-sr" htmlFor={uid + 'msg'}>Your answer</label>
              <textarea className="fld" id={uid + 'msg'} rows={2} maxLength={LIMITS.message} value={draft} disabled={chatBusy}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) sendChat(e); }} />
              <p className="b-fd-hint">{LIMITS.chatTurns - visitorTurns} of {LIMITS.chatTurns} messages left.</p>
              <FieldError id={uid + 'chat-err'} text={chatError} />
              <div className="b-fd-actions">
                <button className="b-cta" type="submit" disabled={chatBusy || !draft.trim()}>Send<Arrow /></button>
                <button className="b-fd-textbtn" type="button" disabled={chatBusy} onClick={() => propose(intake, messages)}>Skip and build my team</button>
              </div>
            </form>
          </div>
        )}

        {!editing && screen === 'building' && (
          <div className="b-fd-building" role="status">
            {heading('Building your team')}
            <div className="b-fd-arrive" aria-hidden="true"><span /><span /><span /></div>
            <p className="b-fd-muted">Your three employees are on their way. This takes a few seconds.</p>
          </div>
        )}

        {!editing && screen === 'error' && (
          <div className="card b-fd-panel" role="alert">
            {heading('We could not build your team just now')}
            <p className="b-fd-muted">{failure} Your details are not lost: try again, or send us a note and we will build it with you.</p>
            <div className="b-fd-actions">
              <button className="b-cta" type="button" onClick={() => propose(intake, messages)}>Try again<Arrow /></button>
              <a className="b-fd-textbtn" href="#go/contact">Contact us</a>
            </div>
          </div>
        )}

        {!editing && screen === 'declined' && (
          <div className="card b-fd-panel">
            {heading('Let us talk this one through')}
            <p className="b-fd-muted">We could not build a team from these details. If you would like to talk about your business, send us a note.</p>
            <div className="b-fd-actions"><a className="b-cta" href="#go/contact">Contact us<Arrow /></a></div>
          </div>
        )}

        {!editing && screen === 'team' && team && (
          <div className="b-fd-team">
            {heading('Meet your first three employees')}
            <p className="b-fd-for">For {intake.company}</p>
            <div className="b-fd-cards">{team.agents.map((a) => <AgentCard key={a.name} agent={a} />)}</div>
            <p className="b-fd-models">Your three employees can run on different models: Claude, ChatGPT, Gemini.</p>

            <form className="card b-fd-panel b-fd-keep" onSubmit={sendLead} noValidate>
              <h3 className="b-fd-h3">Get your team pack and book a 30-minute walk-through.</h3>
              <div className="field-row">
                <div className="field">
                  <label htmlFor={uid + 'name'}>Name</label>
                  <input className="fld" id={uid + 'name'} autoComplete="name" maxLength={LIMITS.name} value={contact.name}
                    onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))} aria-invalid={contactErrors.name ? 'true' : undefined} aria-describedby={contactErrors.name ? errId('name') : undefined} />
                  <FieldError id={errId('name')} text={contactErrors.name} />
                </div>
                <div className="field">
                  <label htmlFor={uid + 'role'}>Role</label>
                  <input className="fld" id={uid + 'role'} autoComplete="organization-title" maxLength={LIMITS.role} value={contact.role}
                    onChange={(e) => setContact((c) => ({ ...c, role: e.target.value }))} aria-invalid={contactErrors.role ? 'true' : undefined} aria-describedby={contactErrors.role ? errId('role') : undefined} />
                  <FieldError id={errId('role')} text={contactErrors.role} />
                </div>
              </div>
              <div className="field">
                <label htmlFor={uid + 'email'}>Work email</label>
                <input className="fld" id={uid + 'email'} type="email" autoComplete="email" maxLength={LIMITS.email} value={contact.email}
                  onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} aria-invalid={contactErrors.email ? 'true' : undefined} aria-describedby={contactErrors.email ? errId('email') : undefined} />
                <FieldError id={errId('email')} text={contactErrors.email} />
              </div>
              <label className="b-fd-consent">
                <input type="checkbox" checked={contact.consent} onChange={(e) => setContact((c) => ({ ...c, consent: e.target.checked }))} />
                <span>{CONSENT_LABEL}</span>
              </label>
              <button className="b-cta book-submit" type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send my team pack'}<Arrow /></button>
              {sendError ? <p className="b-fd-err" role="alert">{sendError} <button type="button" className="b-fd-textbtn" onClick={openBooking}>Book the walk-through</button></p> : null}
              <p className="b-fd-notice">{NOTICE_LEAD} <PrivacyLink>Privacy policy</PrivacyLink></p>
            </form>
          </div>
        )}

        {!editing && screen === 'thanks' && (
          <div className="card b-fd-panel b-fd-thanks">
            {heading('Your team pack is on its way.')}
            <button type="button" className="b-cta" onClick={openBooking}>Book your walk-through<Arrow /></button>
            <p className="b-fd-muted">Your first three are a start. The deep dive designs the whole company around your goal.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export const css = `
.b-fd{padding:clamp(56px,9vw,120px) 0;position:relative}
.b-fd-entry{max-width:46rem}
.b-fd-pitch{font-size:clamp(1.9rem,5vw,3.4rem);font-weight:800;line-height:1.04;letter-spacing:-.025em;margin:0 0 1.6rem}
.b-fd-panel{max-width:44rem;padding:clamp(22px,3.4vw,40px)}
.b-fd-h{font-size:clamp(1.4rem,3vw,2.1rem);font-weight:800;line-height:1.08;letter-spacing:-.02em;margin:0 0 1.4rem;outline:none}
.b-fd-h3{font-size:clamp(1.1rem,2.2vw,1.4rem);font-weight:800;line-height:1.15;margin:0 0 1.2rem}
.b-fd-muted{color:var(--gs-text-muted);line-height:1.6;margin:.8rem 0 1.4rem;max-width:52ch}
.b-fd-hint{margin:.45rem 0 0;font-size:.82rem;color:var(--gs-muted)}
.b-fd-err{margin:.45rem 0 0;font-size:.86rem;color:#ffb4a8}
.b-fd-notice{margin:1.2rem 0 0;font-size:.82rem;color:var(--gs-muted);line-height:1.55}
.b-fd-link{color:var(--gs-accent);border-bottom:1px solid var(--gs-border)}
.b-fd-other{margin-top:.6rem}
.b-fd-chips{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;min-height:3rem;padding:.45rem;border:1px solid var(--gs-border-soft);border-radius:10px;background:rgba(255,255,255,.03)}
.b-fd-chips:focus-within{border-color:var(--gs-accent-mid,rgba(200,255,0,.4));box-shadow:0 0 0 3px var(--gs-accent-mid,rgba(200,255,0,.4))}
.b-fd-chip{display:inline-flex;align-items:center;gap:.3rem;padding:.3em .3em .3em .75em;border-radius:999px;background:var(--gs-accent-soft);border:1px solid var(--gs-border);font-weight:600;font-size:.9rem}
.b-fd-chip button{min-width:28px;min-height:28px;border:0;border-radius:50%;background:transparent;color:inherit;font-size:1.05rem;cursor:pointer}
.b-fd-chip button:focus-visible{outline:2px solid var(--gs-accent)}
.b-fd-chip-input{flex:1 1 8rem;min-width:8rem;border:0;background:transparent;color:var(--gs-text);font:inherit;padding:.35em .4em;outline:none}
.b-fd-sizes{border:0;padding:0;display:flex;flex-wrap:wrap;gap:.5rem}
.b-fd-sizes legend{display:block;width:100%;font-size:.74rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gs-muted);margin-bottom:.5rem;padding:0}
.b-fd-size{display:inline-flex;align-items:center;gap:.4rem;padding:.5em .9em;border:1px solid var(--gs-border-soft);border-radius:999px;cursor:pointer;font-size:.92rem}
.b-fd-size:has(input:checked){border-color:var(--gs-accent);background:var(--gs-accent-soft)}
.b-fd-size input{accent-color:var(--gs-accent)}
.b-fd-actions{display:flex;flex-wrap:wrap;gap:1rem 1.4rem;align-items:center;margin-top:1.4rem}
.b-fd-textbtn{background:none;border:0;padding:.4em 0;color:var(--gs-accent);font:inherit;font-weight:600;cursor:pointer;border-bottom:1px solid var(--gs-border)}
.b-fd-textbtn:disabled{opacity:.5;cursor:default}
.b-fd-turnstile{margin:.4rem 0 0;min-height:65px}
.b-fd-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.b-fd-log{list-style:none;margin:0 0 1.2rem;padding:0;display:flex;flex-direction:column;gap:.7rem;max-height:min(52vh,26rem);overflow-y:auto}
.b-fd-msg{max-width:88%;padding:.7em .95em;border-radius:12px;line-height:1.5;font-size:.96rem}
.b-fd-msg.everest{align-self:flex-start;background:rgba(255,255,255,.04);border:1px solid var(--gs-border-soft)}
.b-fd-msg.visitor{align-self:flex-end;background:var(--gs-accent-soft);border:1px solid var(--gs-border)}
.b-fd-msg.is-typing{color:var(--gs-muted)}
.b-fd-who{display:block;font-size:.7rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gs-muted);margin-bottom:.2rem}
.b-fd-building{text-align:center;padding:2rem 0}
.b-fd-building .b-fd-muted{margin-left:auto;margin-right:auto}
.b-fd-arrive{display:flex;justify-content:center;gap:1rem;margin:1.6rem 0}
.b-fd-arrive span{width:56px;height:56px;border-radius:50%;background:var(--gs-accent-soft);border:1px solid var(--gs-border);animation:b-fd-arrive 1.8s var(--gs-ease) infinite both}
.b-fd-arrive span:nth-child(2){animation-delay:.3s}.b-fd-arrive span:nth-child(3){animation-delay:.6s}
@keyframes b-fd-arrive{0%{opacity:0;transform:translateY(14px)}35%,75%{opacity:1;transform:none}100%{opacity:.35;transform:none}}
@media (prefers-reduced-motion:reduce){.b-fd-arrive span{animation:none;opacity:1}}
.b-fd-for{color:var(--gs-muted);margin:-.8rem 0 1.4rem;font-weight:600}
.b-fd-cards{display:grid;grid-template-columns:1fr;gap:1rem}
@media(min-width:900px){.b-fd-cards{grid-template-columns:repeat(3,1fr)}}
.b-fd-agent{padding:clamp(20px,2.6vw,28px);display:flex;flex-direction:column}
.b-fd-agent.is-lead{border-color:var(--gs-accent-mid,rgba(200,255,0,.4))}
.b-fd-agent-head{display:flex;gap:.9rem;align-items:center}
.b-fd-avatar{flex:0 0 auto;width:52px;height:52px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:1.3rem;color:#0e1611;background:var(--gs-accent)}
.b-fd-avatar.t1{background:#9fd9b8}.b-fd-avatar.t2{background:#e7d08a}.b-fd-avatar.t3{background:#a9c6f0}.b-fd-avatar.t4{background:#e9a9a0}.b-fd-avatar.t5{background:#c9b6ef}
.b-fd-agent-name{font-size:1.3rem;font-weight:800;margin:0}
.b-fd-agent-role{margin:.15rem 0 0;color:var(--gs-text-muted);font-size:.92rem;line-height:1.4}
.b-fd-lead-tag{margin:1rem 0 0;font-size:.78rem;font-weight:700;color:var(--gs-accent);letter-spacing:.02em}
.b-fd-traits{list-style:none;display:flex;flex-wrap:wrap;gap:.4rem;margin:1rem 0 0;padding:0}
.b-fd-traits li{padding:.25em .7em;border-radius:999px;border:1px solid var(--gs-border-soft);font-size:.82rem}
.b-fd-sub{margin:1.2rem 0 .4rem;font-size:.7rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gs-muted)}
.b-fd-tasks{margin:0;padding-left:1.2rem;display:flex;flex-direction:column;gap:.35rem;font-size:.92rem;line-height:1.45}
.b-fd-with{margin:1rem 0 0;padding-top:.9rem;border-top:1px solid var(--gs-border-soft);font-size:.86rem;color:var(--gs-text-muted);line-height:1.5}
.b-fd-models{margin:1.4rem 0 2.4rem;color:var(--gs-text-muted)}
.b-fd-keep{margin-top:0}
.b-fd-consent{display:flex;gap:.7rem;align-items:flex-start;margin-top:1.2rem;font-size:.9rem;line-height:1.5;cursor:pointer}
.b-fd-consent input{margin-top:.25rem;width:18px;height:18px;flex:0 0 auto;accent-color:var(--gs-accent)}
.b-fd-thanks .b-cta{margin-top:.4rem}
`;

export const puck = {
  label: 'Front door (meet your three employees)',
  fields: {
    headline: { type: 'custom', label: 'Pitch', render: (props) => <RichTextField {...props} variant="heading" /> },
    ctaLabel: { type: 'text', label: 'Start button label' },
  },
  defaultProps: {
    headline: 'Turn your AI freelancers into one team that knows your goal.',
    ctaLabel: 'Meet your first three employees',
  },
  render: (props) => <FrontDoor {...props} />,
};

export default FrontDoor;
