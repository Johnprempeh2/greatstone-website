// GRE-1862: the shop and product pages end with the landing's close band. Its words come from the
// landing's own TwoDoorsClose block, so they are edited in one place. A schema 2 release has no
// blocks, so the band falls back to the landing's approved words.
export const LANDING_CLOSE = Object.freeze({
  closeHeading: 'Begin the conversation',
  closeLine: 'Tell us what you are working on. We will suggest a next step.',
  closeCta: 'Begin the conversation →',
  contactHref: '/contact',
});

const FIELDS = Object.keys(LANDING_CLOSE);

export function landingClose(release) {
  const home = release?.pages?.find((page) => page.path === '/');
  const block = home?.data?.content?.find((item) => item?.type === 'TwoDoorsClose');
  const props = block?.props || {};
  if (typeof props.closeHeading !== 'string' || !props.closeHeading.trim()) return { ...LANDING_CLOSE };
  return Object.fromEntries(FIELDS.map((key) => [key, typeof props[key] === 'string' && props[key] ? props[key] : LANDING_CLOSE[key]]));
}
