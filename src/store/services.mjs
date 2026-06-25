// The live services catalogue, surfaced as a context so the detail pages (#service/<slug>) and the
// inquiry list can reach the same data the Services-page catalogue block renders. ONE CMS-editable
// source: editing the ServiceCatalog block's `services` array (in Puck) drives the listing, the detail
// pages and the inquiry. Falls back to the bundled default data when a page has no catalogue block yet.
import { createContext, useContext } from 'react';
import { services as DEFAULT_SERVICES, categories as DEFAULT_CATEGORIES } from '../data/service-catalog.mjs';

const DEFAULT_EMAIL = 'dx@greatstonesoftware.co.uk';

export const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// The catalogue's `format` is a full engagement sentence ("Fixed-scope build, then an embedded
// build-and-run subscription"); cards/badges want a short tag. Distil one engagement type from it; the
// full sentence still shows in the detail page's "How we deliver it". Most-specific signal first.
export function shortFormat(f) {
  const s = (f || '').toLowerCase();
  if (/\b(assessment|audit|diagnostic|workshop|discovery)\b/.test(s) && !/\bbuild\b/.test(s)) return 'Assessment';
  const hasBuild = /\b(build|web app|platform|deployment|microsite|landing page|site)\b/.test(s);
  const optionalRun = /optional[^.,;]*\b(retainer|care plan|subscription|run-and|maintenance|support plan|hosting)/.test(s);
  const hasRun = /\b(retainer|subscription|managed|run-and|run rate|run cost|hosted and operated|operated by|per-seat|per-minute|per-cycle|per-event|monthly)\b/.test(s);
  if (hasBuild && hasRun && !optionalRun) return 'Build + Run';
  if (hasBuild) return 'Build';
  if (/\bintegration\b/.test(s)) return 'Integration';
  if (hasRun) return 'Subscription';
  return 'Engagement';
}
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

export const ServicesContext = createContext({ services: DEFAULT_SERVICES, categories: DEFAULT_CATEGORIES, email: DEFAULT_EMAIL });
export const useServices = () => useContext(ServicesContext);
