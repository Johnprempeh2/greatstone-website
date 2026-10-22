export const FRAME_TAG = 'website-frame';
export const FRAME_PROTOCOL = 1;
export const NONCE_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function allowedHostOrigins(value, development = false) {
  return String(value || '').split(',').map((part) => part.trim()).filter((part) => {
    try {
      const url = new URL(part);
      return url.origin === part && (url.protocol === 'https:' || (development && url.protocol === 'http:' && url.hostname === 'localhost'));
    } catch { return false; }
  });
}

export function validHello(event, origins, siteId, bound) {
  const data = event.data;
  if (!origins.includes(event.origin) || event.source !== window.parent || !data || data.gs !== FRAME_TAG || data.type !== 'hello') return null;
  const payload = data.payload;
  if (!payload || !NONCE_PATTERN.test(payload.nonce) || !Array.isArray(payload.protocols) || !payload.protocols.length || !payload.protocols.every((p) => Number.isSafeInteger(p) && p > 0)) return null;
  if (bound && (bound.origin !== event.origin || bound.nonce !== payload.nonce)) return null;
  if (payload.siteId !== siteId) return { refused: 'site', payload };
  if (!payload.protocols.includes(FRAME_PROTOCOL)) return { refused: 'protocol', payload };
  return { payload };
}

export function validMessage(event, bound, types) {
  const data = event.data;
  return !!bound && event.origin === bound.origin && event.source === window.parent && data?.gs === FRAME_TAG && data.protocol === FRAME_PROTOCOL && data.session === bound.nonce && types.includes(data.type) && data.payload && typeof data.payload === 'object' && !Array.isArray(data.payload);
}

export function envelope(type, payload, bound) {
  const message = { gs: FRAME_TAG, id: crypto.randomUUID(), type, payload };
  return bound ? { ...message, protocol: FRAME_PROTOCOL, session: bound.nonce } : message;
}

export function frameCsp(origins, nonce, development = false) {
  return ["default-src 'none'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' blob: data:", "font-src 'self'", "connect-src 'self'", "frame-src 'self'", "worker-src 'none'", "manifest-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", `frame-ancestors ${origins.join(' ') || "'none'"}`].join('; ');
}

export function blockRef(item, page, siteId, engine) {
  return { siteId, pageId: page.id, pageRevisionId: page.revisionId, blockId: item.props.id, blockType: item.type, engine, source: null };
}

export function findBlock(value, id, type) {
  if (!value || typeof value !== 'object') return null;
  if (value.props?.id === id && value.type === type) return value;
  for (const child of Object.values(value)) {
    const match = findBlock(child, id, type);
    if (match) return match;
  }
  return null;
}

export function mapMediaRefs(value, replacements) {
  if (typeof value === 'string') return replacements[value] || value;
  if (Array.isArray(value)) return value.map((entry) => mapMediaRefs(entry, replacements));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, mapMediaRefs(entry, replacements)]));
  return value;
}
