import { publicNavOrder, footerLegalOrder } from './lib/nav-order.js';
import { safeMailto } from './lib/safe-url.js';

const LOGO = '/assets/greatstone-logo-web.png';
const LOGO_WEBP = '/assets/greatstone-logo-web.webp'; // 47% smaller twin; only offered for the built-in default logo

// The real site footer (uses site.css .site-footer classes verbatim), so the studio closes
// the page exactly like the live site. Global chrome, shown in view mode only.
export default function Footer({ order, pages, onNavigate, canEdit, logo, tagline, siteName, footerEmail, legalName }) {
  const year = new Date().getFullYear();
  const logoSrc = logo || LOGO;
  const brandName = siteName || 'Greatstone International';
  const footTagline = tagline || 'The Foundation of Digital Excellence';
  const mail = footerEmail || 'dx@greatstonesoftware.co.uk';
  const legal = legalName || 'Greatstone International Ltd';
  // public visitors only see published pages; editors see all (so they can reach drafts). Home always kept.
  const navOrder = publicNavOrder(order, pages, canEdit);
  // the small legal row (Terms, Privacy, …): footer-only pages, shown to the public once published.
  const legalOrder = footerLegalOrder(order, pages, canEdit);
  return (
    <footer className="site-footer">
      <style dangerouslySetInnerHTML={{ __html: '@media(pointer:coarse){.site-footer .foot-links a{min-height:44px;padding:8px 6px;display:inline-flex;align-items:center}}' }} />
      <svg className="foot-wave" viewBox="0 0 500 500" fill="none" aria-hidden="true">
        <g stroke="var(--gs-accent)" strokeWidth="0.8" fill="none" opacity="0.5">
          <path d="M500 40 Q392 72 344 154 Q296 236 318 338 Q340 440 424 486" />
          <path d="M468 64 Q372 96 328 170 Q284 244 304 334 Q324 424 396 466" />
          <path d="M436 88 Q352 120 312 186 Q272 252 290 330 Q308 408 368 446" />
          <path d="M404 112 Q332 144 296 202 Q260 260 276 326 Q292 392 340 426" />
        </g>
      </svg>
      <div className="logo"><a href="#" aria-label={brandName} onClick={(e) => { e.preventDefault(); onNavigate(order[0]); }}><picture>{logoSrc === LOGO && <source type="image/webp" srcSet={LOGO_WEBP} />}<img src={logoSrc} alt={brandName} width="800" height="160" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} /></picture></a></div>
      <div className="tagline">{footTagline}</div>
      <nav className="foot-links" aria-label="Footer">
        {navOrder.filter((slug) => pages[slug]).map((slug) => (
          <a key={slug} href={'#' + slug} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); onNavigate(slug); }}>{pages[slug].title || slug}</a>
        ))}
      </nav>
      <a className="mail" href={safeMailto(mail)}>{mail}</a>
      {legalOrder.length > 0 && (
        <nav className="foot-legal" aria-label="Legal">
          {legalOrder.map((slug) => (
            <a key={slug} href={'#' + slug} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); onNavigate(slug); }}>{pages[slug].title || slug}{canEdit && pages[slug].status !== 'published' ? ' (draft)' : ''}</a>
          ))}
        </nav>
      )}
      <div className="legal">© {year} {legal}. All rights reserved.</div>
    </footer>
  );
}
