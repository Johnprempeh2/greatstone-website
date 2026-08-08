import { MediaField } from './MediaField.jsx';
import { BRAND_TAGLINE } from '../lib/brand.mjs';
import PanelFrame from './PanelFrame.jsx';
import { DEFAULT_LOGO } from '../store.js';

// Global site-chrome settings: the logo, site name, footer tagline and header CTA label that wrap every
// page. These were hardcoded in Header / Footer / AdminConsole; this panel makes them editor-controlled
// (state.settings). Changes are global (not part of the per-page draft→publish flow) and apply live, so
// an admin edit is the one source of truth. A small live preview shows the header + footer chrome.
export default function SiteSettingsPanel({ settings = {}, onChange, onClose, embedded }) {
  const s = settings;
  const set = (k, v) => onChange({ [k]: v });
  return (
    <PanelFrame embedded={embedded} label="Site settings" name="Site settings" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>The brand chrome that wraps every page. Changes apply across the whole site immediately.</p>

        <label className="gs-field">
          <span className="gs-field-label">Site name</span>
          <input value={s.siteName || ''} onChange={(e) => set('siteName', e.target.value)} placeholder="Greatstone International" />
          <span className="gs-field-hint">Used as the logo&rsquo;s alt text and the accessible site name.</span>
        </label>

        <div className="gs-field">
          <span className="gs-field-label">Logo</span>
          <MediaField value={s.logo || ''} onChange={(v) => set('logo', v)} />
          <span className="gs-field-hint">Shown in the header and footer. A transparent PNG or SVG works best.</span>
        </div>

        <label className="gs-field">
          <span className="gs-field-label">Header CTA label</span>
          <input value={s.headerCtaLabel || ''} onChange={(e) => set('headerCtaLabel', e.target.value)} placeholder="Book a Diagnostic" />
          <span className="gs-field-hint">The persistent button in the header and the Pages menu. The link is the booking flow.</span>
        </label>

        <label className="gs-field">
          <span className="gs-field-label">Footer tagline</span>
          <input value={s.footerTagline || ''} onChange={(e) => set('footerTagline', e.target.value)} placeholder={BRAND_TAGLINE} />
        </label>

        <label className="gs-field">
          <span className="gs-field-label">Footer contact email</span>
          <input value={s.footerEmail || ''} onChange={(e) => set('footerEmail', e.target.value)} type="email" placeholder="dx@greatstonesoftware.co.uk" />
          <span className="gs-field-hint">Shown in the footer as a mailto link across the whole site.</span>
        </label>

        <label className="gs-field">
          <span className="gs-field-label">Legal entity name</span>
          <input value={s.legalName || ''} onChange={(e) => set('legalName', e.target.value)} placeholder="Greatstone International Ltd" />
          <span className="gs-field-hint">Used in the footer copyright line.</span>
        </label>

        {/* Previews sit on the real (dark) site chrome — the brand logo is a light wordmark, so a white card
            would render it invisible. gs-chrome-preview mirrors what visitors actually see. */}
        <div className="gs-preview-label">Header preview</div>
        <div className="gs-chrome-preview" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', height: 26 }}>
            {/* mirror the live chrome's fallback (empty logo → the default mark) so the preview shows what
                visitors actually see; alt="" because this is a decorative duplicate of the fields above. */}
            <img src={s.logo || DEFAULT_LOGO} alt="" style={{ height: 22, width: 'auto' }} />
          </span>
          <span style={{ background: 'var(--gs-accent,#c8ff00)', color: '#0e1611', fontWeight: 800, fontSize: '.74rem', borderRadius: 100, padding: '7px 13px', whiteSpace: 'nowrap' }}>{s.headerCtaLabel || 'Book a Diagnostic'}</span>
        </div>

        <div className="gs-preview-label">Footer preview</div>
        <div className="gs-chrome-preview" style={{ textAlign: 'center' }}>
          <img src={s.logo || DEFAULT_LOGO} alt="" style={{ height: 20, width: 'auto', opacity: 0.8, display: 'block', margin: '0 auto 8px' }} />
          <div style={{ fontWeight: 700, letterSpacing: '.04em', fontSize: '.9rem', color: 'var(--gs-text)' }}>{s.footerTagline || BRAND_TAGLINE}</div>
        </div>
      </div>
    </PanelFrame>
  );
}
