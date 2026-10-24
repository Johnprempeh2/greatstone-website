import { resolveMediaRefs } from './release-media.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function framePageFor(param, release) {
  const page = release.pages.find((item) => item.id === param)
    || release.pages.find((item) => item.slug === param);
  if (page) return { ...resolveMediaRefs(page, release.media), orgId: release.orgId };
  return uuid.test(param) ? { id: param } : undefined;
}
