import { publicNavOrder, footerLegalOrder } from './lib/nav-order.js';
import { BRAND_TAGLINE } from './lib/brand.mjs';
import { safeMailto } from './lib/safe-url.js';
import { analyticsConfigured, openConsentSettings } from './lib/analytics.js';

const LOGO = '/assets/greatstone-logo-web.png';
const LOGO_WEBP = '/assets/greatstone-logo-web.webp'; // 47% smaller twin; only offered for the built-in default logo
// A page link's address. The Vite studio routes by hash; the Next site passes hrefFor with real paths.
const hashHref = (slug) => '#' + slug;

// The real site footer (uses site.css .site-footer classes verbatim), so the studio closes
// the page exactly like the live site. Global chrome, shown in view mode only.
export default function Footer({ order, pages, onNavigate, canEdit, logo, tagline, siteName, footerEmail, legalName, hrefFor = hashHref, cookieSettings = analyticsConfigured }) {
  const year = new Date().getFullYear();
  const logoSrc = logo || LOGO;
  const brandName = siteName || 'Greatstone International';
  const footTagline = tagline || BRAND_TAGLINE;
  const mail = footerEmail || 'dx@greatstonesoftware.co.uk';
  const legal = legalName || 'Greatstone International Ltd';
  // public visitors only see published pages; editors see all (so they can reach drafts). Home always kept.
  const navOrder = publicNavOrder(order, pages, canEdit);
  // the small legal row (Terms, Privacy, …): footer-only pages, shown to the public once published.
  const legalOrder = footerLegalOrder(order, pages, canEdit);
  return (
    <footer className="site-footer">
      <style dangerouslySetInnerHTML={{ __html: '@media(pointer:coarse){.site-footer .foot-links a,.site-footer .foot-cookie-settings{min-height:44px;padding:8px 6px;display:inline-flex;align-items:center}}' }} />
      <div className="logo"><a href={hrefFor === hashHref ? '#' : hrefFor(order[0])} aria-label={brandName} onClick={(e) => { e.preventDefault(); onNavigate(order[0]); }}><picture>{logoSrc === LOGO && <source type="image/webp" srcSet={LOGO_WEBP} />}<img src={logoSrc} alt={brandName} width="800" height="160" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} /></picture></a></div>
      <div className="tagline">{footTagline}</div>
      <nav className="foot-links" aria-label="Footer">
        {navOrder.filter((slug) => pages[slug]).map((slug) => (
          <a key={slug} href={hrefFor(slug)} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); onNavigate(slug); }}>{pages[slug].title || slug}</a>
        ))}
      </nav>
      <a className="mail" href={safeMailto(mail)}>{mail}</a>
      {/* "Cookie settings" reopens the consent banner so a visitor can change or withdraw their choice
          (GRE-659, legal doc "Code findings" 3). Shown only when analytics is configured: with no GTM
          container there is no banner and no analytics cookie to choose about. */}
      {(legalOrder.length > 0 || cookieSettings) && (
        <nav className="foot-legal" aria-label="Legal">
          {legalOrder.map((slug) => (
            <a key={slug} href={hrefFor(slug)} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); onNavigate(slug); }}>{pages[slug].title || slug}{canEdit && pages[slug].status !== 'published' ? ' (draft)' : ''}</a>
          ))}
          {cookieSettings && <button type="button" className="foot-cookie-settings" onClick={openConsentSettings}>Cookie settings</button>}
        </nav>
      )}
      <div className="legal">© {year} {legal}. All rights reserved.</div>
    </footer>
  );
}
