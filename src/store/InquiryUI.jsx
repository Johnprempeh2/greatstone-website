// Shared UI for the multi-select service inquiry: the per-service "Add to inquiry" toggle, the little
// "N in your inquiry" bar, and the floating drawer (FAB → slide-out) that lists the chosen services and
// composes ONE prefilled email for all of them (client-side mailto, no backend — same path the booking
// form uses). Mirrors the store basket's FAB/drawer feel so services behave like the product space.
import { useState, useRef, useEffect, useId } from 'react';
import {
  useInquiry, addInquiry, removeInquiry, toggleInquiry, inInquiry, clearInquiry,
  openInquiryDrawer, onOpenInquiryDrawer,
} from './inquiry.mjs';
import { serviceSlug } from './services.mjs';
import { bumpService } from './popularity.mjs';
import { safeMailto } from '../lib/safe-url.js';
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
export default function InquiryDrawer({ email = 'dx@greatstonesoftware.co.uk' }) {
  const items = useInquiry();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const uid = useId();
  const closeRef = useRef(null);

  useEffect(() => onOpenInquiryDrawer(() => { setOpen(true); setSent(false); }), []);
  useEffect(() => { if (open && closeRef.current) closeRef.current.focus(); }, [open]);
  // close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [open]);

  const onSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const g = (k) => (fd.get(k) || '').toString().trim();
    const company = g('company'), name = g('name');
    const subject = items.length === 1
      ? 'Service inquiry · ' + items[0].name
      : 'Services inquiry · ' + items.length + ' services';
    const lines = [
      'I would like to inquire about the following Greatstone service' + (items.length === 1 ? '' : 's') + ':',
      '',
      ...items.map((it, i) => (i + 1) + '. ' + it.name + (it.category ? ' — ' + it.category : '')),
      '',
      '— About us —',
      company ? 'Company: ' + company : '',
      name ? 'Name: ' + name : '',
      g('email') ? 'Work email: ' + g('email') : '',
      '',
      'What we are trying to solve:',
      g('message') || '',
    ].filter((l) => l !== undefined);
    track('generate_lead', { form: 'service_inquiry', count: items.length, services: items.map((i) => i.slug).join(',') });
    const to = safeMailto(email);
    if (to !== '#') {
      const href = to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\n'));
      try { if (typeof window !== 'undefined') window.location.href = href; } catch (err) { /* ignore */ }
    }
    setSent(true);
  };

  return (
    <>
      {items.length > 0 && (
        <button className="inq-fab" onClick={() => { setOpen(true); setSent(false); }} aria-label={'Open your inquiry, ' + items.length + ' service' + (items.length === 1 ? '' : 's')}>
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

            {sent ? (
              <div className="inq-sent" role="status">
                <h3>Your email is ready.</h3>
                <p>We’ve opened your email with the {items.length} service{items.length === 1 ? '' : 's'} listed and ready to send. If nothing opened, write to us directly:</p>
                <a className="gs-btn primary" href={safeMailto(email)}>{email}</a>
              </div>
            ) : items.length === 0 ? (
              <div className="inq-empty">
                <p>Nothing here yet. Browse the catalogue and add the services you’d like to talk about — one, or several together.</p>
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
                  <p className="inq-form-lead">Tell us a little about you and we’ll come back with where each one fits — and what it’s worth.</p>
                  <div className="inq-row">
                    <label>Company<input className="inq-fld" name="company" type="text" autoComplete="organization" placeholder="Stonewell &amp; Co." /></label>
                    <label>Your name<input className="inq-fld" name="name" type="text" autoComplete="name" placeholder="Jane Stonewell" /></label>
                  </div>
                  <label>Work email<input className="inq-fld" name="email" type="email" autoComplete="email" placeholder="jane@stonewell.co" /></label>
                  <label>What are you trying to solve? <span className="inq-opt">(optional)</span>
                    <textarea className="inq-fld" name="message" rows={3} placeholder="A line on where the time goes, or what prompted this." /></label>
                  <button className="gs-btn primary inq-send" type="submit">Send inquiry ({items.length})</button>
                  <p className="inq-fine">Opens your email client with the service list filled in, ready to send. No obligation.</p>
                </form>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
