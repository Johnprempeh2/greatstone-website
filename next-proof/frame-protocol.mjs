export const FRAME_TAG = 'website-frame';
export const FRAME_PROTOCOL = 1;
export const NONCE_PATTERN = /^[A-Za-z0-9_-]{22}$/;

// Navigation hints for the block library at this engine commit. Identity comes from the block id and type.
const blockSourceLines = {
  TwoDoors: 179, TwoDoorsStory: 198, TwoDoorsProof: 211, TwoDoorsTools: 223, DevTools: 225,
  Hero: 308, Prose: 41, Panels: 208, ServiceCatalog: 292, Invite: 101,
  Steps: 74, FeatureGrid: 54, Faq: 96, PillarCards: 77, MaturityModel: 78,
  Chapter: 80, Team: 103, LogoWall: 60, IntelBand: 86, MaturityMap: 189,
  Ladder: 60, MethodTieIn: 79, IndustryPicker: 211, BookDeepDive: 271,
  AiBaselineSurvey: 319, AiCostCalculator: 218, MotionBand: 29,
};

export function allowedHostOrigins(value, development = false) {
  return String(value || '').split(',').map((part) => part.trim()).filter((part) => {
    try {
      const url = new URL(part);
      return url.origin === part && (url.protocol === 'https:' || (development && url.protocol === 'http:' && url.hostname === 'localhost'));
    } catch { return false; }
  });
}

export function publicFrameAncestors(value = 'https://gsam.tail83d26c.ts.net:3100') {
  return `frame-ancestors 'self' ${allowedHostOrigins(value).join(' ')}`.trim();
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
  return ["default-src 'none'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' https: blob: data:", "media-src 'self' https: blob:", "font-src 'self'", "connect-src 'self'", "frame-src 'self'", "worker-src 'none'", "manifest-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", `frame-ancestors ${origins.join(' ') || "'none'"}`].join('; ');
}

export function blockRef(item, page, siteId, engine) {
  const line = blockSourceLines[item.type];
  const file = ['TwoDoorsStory', 'TwoDoorsProof', 'TwoDoorsTools', 'DevTools'].includes(item.type) ? 'TwoDoors' : item.type;
  const source = line ? { file: `src/blocks/${file}.jsx`, line } : null;
  return { siteId, pageId: page.id, pageRevisionId: page.revisionId, blockId: item.props.id, blockType: item.type, engine, source };
}

export function findBlock(value, id, type) {
  if (!value || typeof value !== 'object') return null;
  if (value.props?.id === id && (type === undefined || value.type === type)) return value;
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
