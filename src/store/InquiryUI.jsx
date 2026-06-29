// Shared UI for the multi-select service inquiry: the per-service "Add to inquiry" toggle, the little
// "N in your inquiry" bar, and the floating drawer (FAB to slide-out) that lists the chosen services.
// Submitting LOGS the inquiry server-side (the Supabase submit_service_inquiry rpc, the primary path) and
// shows a real in-page confirmation; a prefilled email is offered beneath it as a fallback link. If the
// backend is unconfigured or unreachable, it degrades to opening that prefilled email so a lead is never
// lost. Mirrors the store basket's FAB/drawer feel so services behave like the product space.
import { useState, useRef, useEffect, useId } from 'react';
import {
  useInquiry, addInquiry, removeInquiry, toggleInquiry, inInquiry, clearInquiry,
  openInquiryDrawer, onOpenInquiryDrawer, submitInquiry,
} from './inquiry.mjs';
import { serviceSlug } from './services.mjs';
import { bumpService } from './popularity.mjs';
import { safeMailto } from '../lib/safe-url.js';
import { buildInquiryMailto } from '../lib/inquiry-email.mjs';
import { track } from '../lib/analytics.js';
import './service-detail.css';

const asItem = (s) => ({ slug: serviceSlug(s), name: s.name, category: s.category || '' });

// The add/remove toggle. Isolated so it (not the whole card) re-renders on inquiry change — that keeps
// the catalogue cards' reveal class from being clobbered by a re-render.
export function InquiryToggle({ service, size = 'sm', onAdded }) {
  const items = useInquiry();
  const on = inInquiry(serviceSlug(service));
  const flip = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const item = asItem(service);
    if (!on) { addInquiry(item); bumpService(item.slug, 'inquiry'); track('add_to_inquiry', { service: item.slug }); if (onAdded) onAdded(); }
    else removeInquiry(item.slug);
  };
  return (
    <button type="button" className={'inq-toggle' + (on ? ' is-on' : '') + (size === 'lg' ? ' lg' : '')}
      aria-pressed={on} onClick={flip}>
      {on ? (
        <><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>In your inquiry</>
      ) : (
        <><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Add to inquiry</>
      )}
    </button>
  );
}

// "N services in your inquiry · Review →" — a clear path to the drawer, mirroring the basket bar.
export function InquiryBar() {
  const items = useInquiry();
  if (!items.length) return null;
  return (
    <div className="inq-bar">
      <span className="inq-bar-txt">{items.length} service{items.length === 1 ? '' : 's'} in your inquiry</span>
      <button type="button" className="inq-bar-btn" onClick={openInquiryDrawer}>Review &amp; send →</button>
    </div>
  );
}

// The floating button + slide-out drawer. Mount once (App) on the services routes.
export default function InquiryDrawer({ email: inboxEmail = 'dx@greatstonesoftware.co.uk' }) {
  const items = useInquiry();
  const [open, setOpen] = useState(false);
  // phase: 'form' (entering) | 'sending' | 'done' (captured server-side) | 'fallback' (email opened) | 'error'
  const [phase, setPhase] = useState('form');
  const [mailHref, setMailHref] = useState('#');
  const uid = useId();
  const closeRef = useRef(null);

  useEffect(() => onOpenInquiryDrawer(() => { setOpen(true); setPhase('form'); }), []);
  useEffect(() => { if (open && closeRef.current) closeRef.current.focus(); }, [open]);
  // close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [open]);

  const onSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const g = (k) => (fd.get(k) || '').toString().trim();
    const name = g('name'), company = g('company'), email = g('email'), message = g('message');
    const services = items;
    track('generate_lead', { form: 'service_inquiry', count: services.length, services: services.map((i) => i.slug).join(',') });
    // the prefilled email is composed up front: offered as a fallback link on success, auto-opened on degradation.
    const href = buildInquiryMailto(inboxEmail, services, { name, company, email, message });
    setMailHref(href);
    setPhase('sending');
    const res = await submitInquiry({ services, name, email, company, message });
    if (res && res.ok) { setPhase('done'); return; }
    // capture did not land (backend unconfigured, migration absent, rate-limited or offline): never lose the lead.
    if (href !== '#') {
      try { if (typeof window !== 'undefined') window.location.href = href; } catch (err) { /* ignore */ }
      setPhase('fallback');
    } else {
      setPhase('error');
    }
  };

  return (
    <>
      {items.length > 0 && (
        <button className="inq-fab" onClick={() => { setOpen(true); setPhase('form'); }} aria-label={'Open your inquiry, ' + items.length + ' service' + (items.length === 1 ? '' : 's')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
          <span className="inq-fab-label">Inquiry</span>
          <span className="inq-fab-badge">{items.length}</span>
        </button>
      )}

      {open && (
        <div className="inq-overlay" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <aside className="inq-drawer" role="dialog" aria-modal="true" aria-label="Your service inquiry">
            <div className="inq-drawer-head">
              <h2>Your inquiry</h2>
              <button ref={closeRef} className="inq-x" onClick={() => setOpen(false)} aria-label="Close inquiry">✕</button>
            </div>

            {phase === 'done' ? (
              <div className="inq-sent" role="status" aria-live="polite">
                <div className="inq-sent-ico" aria-hidden="true">✓</div>
                <h3>Thanks, we have it.</h3>
                <p>Your inquiry is in. We will come back within a day with where each service fits, and what it is worth.</p>
                <p className="inq-sent-alt">Prefer email? <a href={mailHref}>Open a prefilled message instead</a>.</p>
              </div>
            ) : phase === 'fallback' ? (
              <div className="inq-sent" role="status" aria-live="polite">
                <h3>Your email is ready.</h3>
                <p>We could not log it directly just now, so we have opened a prefilled message with your {items.length} service{items.length === 1 ? '' : 's'} listed. Send it and we will pick it up.</p>
                <a className="gs-btn primary" href={mailHref}>{inboxEmail}</a>
              </div>
            ) : phase === 'error' ? (
              <div className="inq-sent" role="alert">
                <h3>That did not go through.</h3>
                <p>Please try again, or email us directly:</p>
                <a className="gs-btn primary" href={safeMailto(inboxEmail)}>{inboxEmail}</a>
              </div>
            ) : items.length === 0 ? (
              <div className="inq-empty">
                <p>Nothing here yet. Browse the catalogue and add the services you’d like to talk about, one or several together.</p>
                <a className="gs-btn ghost" href="#go/services" onClick={() => setOpen(false)}>Browse services</a>
              </div>
            ) : (
              <>
                <ul className="inq-list">
                  {items.map((it) => (
                    <li key={it.slug} className="inq-item">
                      <a className="inq-item-name" href={'#service/' + it.slug} onClick={() => setOpen(false)}>{it.name}</a>
                      {it.category ? <span className="inq-item-cat">{it.category}</span> : null}
                      <button className="inq-remove" onClick={() => removeInquiry(it.slug)} aria-label={'Remove ' + it.name}>Remove</button>
                    </li>
                  ))}
                </ul>
                <button className="inq-clear" type="button" onClick={clearInquiry}>Clear all</button>

                <form className="inq-form" onSubmit={onSubmit} noValidate>
                  <p className="inq-form-lead">Tell us a little about you and we’ll come back with where each one fits, and what it’s worth.</p>
                  <div className="inq-row">
                    <label>Company<input className="inq-fld" name="company" type="text" autoComplete="organization" placeholder="Stonewell &amp; Co." /></label>
                    <label>Your name<input className="inq-fld" name="name" type="text" autoComplete="name" placeholder="Jane Stonewell" /></label>
                  </div>
                  <label>Work email<input className="inq-fld" name="email" type="email" autoComplete="email" placeholder="jane@stonewell.co" /></label>
                  <label>What are you trying to solve? <span className="inq-opt">(optional)</span>
                    <textarea className="inq-fld" name="message" rows={3} placeholder="A line on where the time goes, or what prompted this." /></label>
                  <button className="gs-btn primary inq-send" type="submit" disabled={phase === 'sending'} aria-busy={phase === 'sending'}>{phase === 'sending' ? 'Sending…' : 'Send inquiry (' + items.length + ')'}</button>
                  <p className="inq-fine">We log your inquiry securely and reply within a day. No obligation.</p>
                </form>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
