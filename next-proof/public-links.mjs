import { legacyHashDestination } from './legacy-hashes.mjs';

export function publicPathText(value, pagePaths) {
  return value.replace(/#go\/[\w-]+(?:\/[\w-]+)?/g, (hash) => legacyHashDestination(hash, '/', pagePaths) || hash);
}

// Published Puck data still contains structured page links for the Vite editor.
// Resolve them to real paths at the Next public render boundary.
export function publicLinkProps(value, pagePaths) {
  if (Array.isArray(value)) return value.map((item) => publicLinkProps(item, pagePaths));
  if (typeof value === 'string') return publicPathText(value, pagePaths);
  if (!value || typeof value !== 'object') return value;
  if (value.kind === 'page' && typeof value.page === 'string') {
    return legacyHashDestination(`#go/${value.page}`, '/', pagePaths) || value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, publicLinkProps(item, pagePaths)]));
}
