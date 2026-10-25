import { findBlock } from './frame-protocol.mjs';

export const EDITOR_MESSAGES = ['comment-pins', 'pin-clicked', 'ask-agent', 'capture'];
export const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;

export function encodeCapture(image, width, height, makeCanvas) {
  let scale = Math.min(1, 10000 / width, 10000 / height);
  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = makeCanvas();
    canvas.width = Math.max(1, Math.floor(width * scale)); canvas.height = Math.max(1, Math.floor(height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL('image/png');
    const base64 = png.slice('data:image/png;base64,'.length);
    const bytes = base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    if (bytes <= MAX_CAPTURE_BYTES) return { png, width: canvas.width };
    scale *= 0.7;
  }
  throw new Error('The screenshot is too large.');
}

export function validPins(payload, draft) {
  if (!Array.isArray(payload?.pins) || payload.pins.length > 200 || !draft) return null;
  for (const pin of payload.pins) {
    if (!pin || typeof pin.blockId !== 'string' || !pin.blockId || !Number.isInteger(pin.number) || pin.number < 1 || pin.number > 9999) return null;
  }
  return payload.pins.filter((pin) => findBlock(draft.content, pin.blockId));
}

export function askAgent(item) {
  if (!item?.props?.id || !item.type) return null;
  return { blockId: item.props.id, blockType: item.type, label: String(item.props.heading || item.props.title || item.type).slice(0, 200) };
}

export function captureTarget(payload, draft) {
  if (!draft || !payload || !Object.hasOwn(payload, 'blockId')) return false;
  return payload.blockId === null || (typeof payload.blockId === 'string' && !!findBlock(draft.content, payload.blockId));
}

export function renderPins(doc, pins, onClick) {
  for (const old of doc.querySelectorAll('.gs-comment-pin')) old.remove();
  const positions = new Map();
  for (const pin of pins) {
    const block = [...doc.querySelectorAll('[data-gs-block-id]')].find((node) => node.dataset.gsBlockId === pin.blockId);
    if (!block) continue;
    const button = doc.createElement('button');
    button.type = 'button'; button.className = 'gs-comment-pin';
    const position = positions.get(pin.blockId) || 0;
    const rect = block.getBoundingClientRect();
    button.style.left = `${rect.left + 12 + position * 38}px`;
    button.style.top = `${Math.max(rect.top + 12, doc.documentElement.clientWidth < 600 ? 64 : 12)}px`;
    positions.set(pin.blockId, position + 1);
    button.textContent = String(pin.number);
    button.setAttribute('aria-label', `Open comment ${pin.number} on this block`);
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); onClick(pin); });
    doc.body.append(button);
  }
}

export function captureOptions(doc, blockId, rect) {
  if (blockId !== null) return { width: Math.min(10000, Math.ceil(rect.width)), height: Math.ceil(rect.height) };
  return {
    width: Math.min(10000, Math.ceil(doc.documentElement.clientWidth)),
    height: Math.ceil(doc.documentElement.clientHeight),
    x: doc.defaultView.scrollX,
    y: doc.defaultView.scrollY,
  };
}

/** Render the editor document in-browser; the host receives only the bounded PNG. */
export async function capturePng(doc, blockId) {
  const source = blockId === null ? doc.body : [...doc.querySelectorAll('[data-gs-block-id]')].find((node) => node.dataset.gsBlockId === blockId);
  if (!source) throw new Error('The requested block is not visible.');
  const rect = source.getBoundingClientRect();
  const bounds = captureOptions(doc, blockId, rect);
  const { width, height } = bounds;
  if (!width || !height) throw new Error('The page has no visible content.');
  const { default: html2canvas } = await import('html2canvas-pro');
  const canvas = await html2canvas(source, {
    backgroundColor: null, useCORS: true, allowTaint: false, logging: false,
    ...bounds, scale: Math.min(1, 10000 / width, 10000 / height),
    onclone(clone) {
      for (const pin of clone.querySelectorAll('.gs-comment-pin')) pin.remove();
      const style = clone.createElement('style');
      style.textContent = '[data-puck-component]{outline:none!important}';
      clone.head.append(style);
    },
  });
  return encodeCapture(canvas, canvas.width, canvas.height, () => doc.createElement('canvas'));
}
