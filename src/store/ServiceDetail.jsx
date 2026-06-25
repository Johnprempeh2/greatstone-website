// A single service's own page (#service/<slug>) — the product-detail equivalent for the services
// catalogue. Reads the service from the ServicesContext (the CMS-editable catalogue) and lays it out
// like the product detail: title, format badge, the promise, what we build, the payback, who it's for,
// how we deliver it, related services. Plus the multi-select inquiry: add this (and others) and inquire
// about several at once, or just this one. Reuses store.css's sp-* product-detail classes for parity.
import { useEffect } from 'react';
import { useServices, findService, serviceSlug, shortFormat } from './services.mjs';
import { InquiryToggle, InquiryBar } from './InquiryUI.jsx';
import { openInquiryDrawer } from './inquiry.mjs';
import { track } from '../lib/analytics.js';
import { safeMailto } from '../lib/safe-url.js';
import './store.css';
import './service-detail.css';

export default function ServiceDetail({ slug, onBack }) {
  const { services, email } = useServices();
  const svc = findService(services, slug);

  useEffect(() => { document.title = (svc ? svc.name : 'Service') + ' · Greatstone International'; }, [svc, slug]);

  if (!svc) {
    return (
      <>
        <div className="st-scrim" aria-hidden="true" />
        <div className="sp-wrap"><div className="st-empty"><h3>Service not found</h3><p>It may have moved or the link is out of date.</p><button className="st-more" onClick={onBack}>Back to services</button></div></div>
      </>
    );
  }

  const slugOf = serviceSlug(svc);
  const related = services.filter((s) => s.category === svc.category && serviceSlug(s) !== slugOf).slice(0, 4);
  const bullets = Array.isArray(svc.bullets) ? svc.bullets : [];

  const inquireOne = () => {
    const subject = 'Service inquiry · ' + svc.name;
    const body = [
      'I would like to inquire about: ' + svc.name,
      svc.oneLiner ? '(' + svc.oneLiner + ')' : '',
      '', '— About us —', 'Company:', 'Work email:', '',
      'What we are trying to solve:', '',
    ].filter((l) => l !== undefined).join('\n');
    track('generate_lead', { form: 'service_inquiry', count: 1, services: slugOf });
    const to = safeMailto(email);
    if (to !== '#') { try { if (typeof window !== 'undefined') window.location.href = to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body); } catch (e) { /* ignore */ } }
  };

  return (
    <>
      <div className="st-scrim" aria-hidden="true" />
      <div className="sp-wrap sd-wrap">
        <nav className="sp-crumb" aria-label="Breadcrumb">
          <a href="#go/services">Services</a><span className="sep" aria-hidden="true">›</span>
          <span className="here">{svc.category}</span><span className="sep" aria-hidden="true">›</span>
          <span className="here">{svc.name}</span>
        </nav>

        <div className="sd-head">
          {svc.category ? <div className="sd-eyebrow">{svc.category}</div> : null}
          <h1 className="sp-title">{svc.name}</h1>
          <div className="st-badges">
            {svc.format ? <span className="st-badge sd-fmt">{shortFormat(svc.format)}</span> : null}
            {svc.featured ? <span className="sd-flag">Flagship</span> : null}
          </div>
          {svc.oneLiner ? <p className="sp-lead">{svc.oneLiner}</p> : null}
          <div className="sd-cta">
            <InquiryToggle service={svc} size="lg" onAdded={openInquiryDrawer} />
            <button type="button" className="gs-btn ghost" onClick={inquireOne}>Inquire about just this</button>
          </div>
          <p className="sp-note">No obligation — tell us what you’re solving and we’ll scope it to your numbers. Add more services to inquire about several at once.</p>
        </div>

        {bullets.length ? (
          <section className="sp-section"><h2>What we build</h2>
            <div className="sp-specs">{bullets.map((b, i) => <div key={i} className="sp-spec"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>{b.text}</div>)}</div>
          </section>
        ) : null}

        <section className="sp-section sd-facts">
          {svc.outcome ? <div className="sd-fact"><h3>The payback</h3><p>{svc.outcome}</p></div> : null}
          {svc.idealClient ? <div className="sd-fact"><h3>Ideal for</h3><p>{svc.idealClient}</p></div> : null}
          {svc.format ? <div className="sd-fact"><h3>How we deliver it</h3><p>{svc.format}</p></div> : null}
        </section>

        {related.length ? (
          <section className="sp-section"><h2>Related services</h2>
            <div className="sp-related">{related.map((r) => <a key={serviceSlug(r)} className="sp-rel" href={'#service/' + serviceSlug(r)}><div className="rn">{r.name}</div><div className="rv">{r.category}</div><div className="rp">View details ›</div></a>)}</div>
          </section>
        ) : null}

        <div className="sp-back"><button className="st-more" onClick={onBack}>← Back to services</button></div>
        <InquiryBar />
      </div>
    </>
  );
}
