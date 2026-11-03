// The React-free half of the services catalogue: reading services out of page content and finding
// one by slug. services.mjs re-exports these; the Next server routes import this file directly,
// because services.mjs creates a React context and server components cannot.
import { services as DEFAULT_SERVICES, categories as DEFAULT_CATEGORIES } from '../data/service-catalog.mjs';

export const DEFAULT_EMAIL = 'dx@greatstonesoftware.co.uk';

export const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// A service is addressable by its `slug`; if a CMS-added service has none, derive it from the name so it
// still routes. (The bundled catalogue ships explicit, unique slugs.)
export const serviceSlug = (s) => (s && (s.slug || slugify(s.name))) || '';

// Pull services + categories + the inquiry email out of a page's block content (the Services page's
// ServiceCatalog block). Used for the published projection visitors see.
export function servicesFromContent(content) {
  let services = [], categories = [], email = DEFAULT_EMAIL, found = false;
  (Array.isArray(content) ? content : []).forEach((b) => {
    if (b && b.type === 'ServiceCatalog' && b.props) {
      found = true;
      if (Array.isArray(b.props.services)) services = services.concat(b.props.services);
      if (Array.isArray(b.props.categories) && b.props.categories.length) categories = b.props.categories;
      if (b.props.inquiryEmail) email = b.props.inquiryEmail;
    }
  });
  if (!found || !services.length) { services = DEFAULT_SERVICES; categories = DEFAULT_CATEGORIES; }
  return { services, categories, email };
}

// Resolve the catalogue from a whole page's published/draft data (whichever a visitor would see).
export function servicesFromPage(page) {
  const data = (page && (page.published || page.data)) || null;
  return servicesFromContent(data && data.content);
}

export function findService(services, slug) {
  return (services || []).find((s) => serviceSlug(s) === slug) || null;
}
