import snapshot from '../next-proof/data/pages.json';

export const site = snapshot;
export function pageFor(slug) { return snapshot.pages[slug]; }
