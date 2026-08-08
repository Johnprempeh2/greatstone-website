import { safeHref, safeMailto } from './safe-url.js';

// One resolver for every editable link target. A block stores either a STRUCTURED link value
// ({ kind, page, url, email, anchor, newTab }) from the LinkField, or a LEGACY plain string from
// before the field existed ('#book', '#go/services', 'mailto:x', 'https://…', '#'). resolveLink folds
// both into render-ready anchor props { href, target, rel } and routes them through the safe-url guards.
//
// The App-level click handler interprets two in-app hashes: '#book' opens the booking flow and
// '#go/<slug>' SPA-navigates to a page. So page + booking links resolve to those hashes (no onClick
// needed here); a plain '#anchor' scrolls natively; everything else is a real, sanitised href.

export const LINK_KINDS = [
  { value: 'page', label: 'A page on this site' },
  { value: 'url', label: 'External / custom URL' },
  { value: 'email', label: 'Email address' },
  { value: 'booking', label: 'The booking flow (opens the scheduler)' },
  { value: 'anchor', label: 'A section on this page' },
];

const NEWTAB = { target: '_blank', rel: 'noopener noreferrer' };

export function resolveLink(value) {
  // legacy / plain string: the existing safe-url guard covers it, and the App handler catches #book/#go
  if (typeof value === 'string') {
    const v = value.trim();
    return { href: v ? safeHref(v) : '#' };
  }
  if (!value || typeof value !== 'object') return { href: '#' };
  const { kind, page, url, email, anchor, newTab } = value;
  const tab = newTab ? NEWTAB : {};
  switch (kind) {
    case 'page': return { href: page ? '#go/' + page : '#' };
    case 'booking': return { href: '#book' };
    case 'email': return { href: safeMailto(email) };
    case 'anchor': {
      const a = String(anchor || '').trim().replace(/^#+/, '');
      return { href: a ? '#' + a : '#' };
    }
    case 'url': return url ? { href: safeHref(url), ...tab } : { href: '#' };
    default:
      // unknown/blank structured value: salvage whatever target it carries
      if (url) return { href: safeHref(url), ...tab };
      if (page) return { href: '#go/' + page };
      if (email) return { href: safeMailto(email) };
      return { href: '#' };
  }
}

// True when the value points somewhere usable (drives the field's "no link set" hint + lets a block
// hide a button with an empty link rather than render a dead '#').
export function hasLink(value) {
  const r = resolveLink(value);
  return !!r.href && r.href !== '#';
}

// Plain-English description of where a link goes, for the LinkField live preview. pages maps slug→{title}.
export function describeLink(value, pages = {}) {
  const title = (slug) => (pages[slug] && pages[slug].title) || slug;
  if (typeof value === 'string') {
    const v = value.trim();
    if (!v || v === '#') return 'No link set';
    if (v === '#book') return 'Opens the booking flow';
    const m = v.match(/^#go\/([\w-]+)$/);
    if (m) return 'Page: ' + title(m[1]);
    if (v.startsWith('mailto:')) return 'Email: ' + v.slice(7);
    if (v.startsWith('#')) return 'Section on this page: ' + v;
    return 'Link: ' + v;
  }
  if (!value || typeof value !== 'object') return 'No link set';
  const { kind, page, url, email, anchor, newTab } = value;
  const tab = newTab ? ' (opens in a new tab)' : '';
  switch (kind) {
    case 'page': return page ? 'Page: ' + title(page) : 'Choose a page';
    case 'booking': return 'Opens the booking flow';
    case 'email': return email ? 'Email: ' + email : 'Enter an email address';
    case 'anchor': return anchor ? 'Section on this page: #' + String(anchor).replace(/^#+/, '') : 'Enter a section anchor';
    case 'url': return url ? 'Link: ' + url + tab : 'Enter a URL';
    default: return 'No link set';
  }
}
