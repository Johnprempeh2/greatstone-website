export function resolveMediaRefs(value, media) {
  if (typeof value === 'string') {
    const item = value.startsWith('media:') && media[value.slice(6)];
    return item ? `/${item.key}` : value;
  }
  if (Array.isArray(value)) return value.map((item) => resolveMediaRefs(item, media));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveMediaRefs(item, media)]));
  return value;
}
