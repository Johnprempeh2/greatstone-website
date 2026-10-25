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
    if ((png.length - 'data:image/png;base64,'.length) * 3 / 4 <= MAX_CAPTURE_BYTES) return { png, width: canvas.width };
    scale *= 0.7;
  }
  throw new Error('The screenshot is too large.');
}

export function validPins(payload, draft) {
  if (!Array.isArray(payload?.pins) || payload.pins.length > 200 || !draft) return null;
  for (const pin of payload.pins) {
    if (!pin || typeof pin.blockId !== 'string' || !pin.blockId || !Number.isInteger(pin.number) || pin.number < 1 || pin.number > 9999 || !findBlock(draft.content, pin.blockId)) return null;
  }
  return payload.pins;
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
    button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); onClick(pin); });
    doc.body.append(button);
  }
}

function dataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('An image could not be read.'));
    reader.readAsDataURL(blob);
  });
}

/** Browser-only, dependency-free PNG capture of the visible editor content. */
export async function capturePng(doc, blockId) {
  const source = blockId === null ? doc.body : [...doc.querySelectorAll('[data-gs-block-id]')].find((node) => node.dataset.gsBlockId === blockId);
  if (!source) throw new Error('The requested block is not visible.');
  const rect = source.getBoundingClientRect();
  const width = Math.min(10000, Math.ceil(blockId === null ? doc.documentElement.clientWidth : rect.width));
  const height = Math.ceil(blockId === null ? doc.documentElement.scrollHeight : rect.height);
  if (!width || !height) throw new Error('The page has no visible content.');
  const clone = source.cloneNode(true);
  const originals = [source, ...source.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  for (let i = 0; i < originals.length; i++) {
    const computed = doc.defaultView.getComputedStyle(originals[i]);
    copies[i].style.cssText = [...computed].map((name) => {
      const value = computed.getPropertyValue(name);
      return value.includes('url(') && !value.includes('data:') ? '' : `${name}:${value};`;
    }).join('');
    copies[i].style.outline = 'none';
  }
  for (const pin of clone.querySelectorAll('.gs-comment-pin')) pin.remove();
  for (let i = 0; i < originals.length; i++) {
    if (originals[i].tagName !== 'CANVAS') continue;
    const image = doc.createElement('img');
    image.style.cssText = copies[i].style.cssText;
    try { image.src = originals[i].toDataURL('image/png'); copies[i].replaceWith(image); }
    catch { copies[i].remove(); } // A cross-origin WebGL texture cannot be exported.
  }
  for (const image of clone.querySelectorAll('img')) {
    if (!image.src || image.src.startsWith('data:')) continue;
    const response = await fetch(image.src);
    if (!response.ok) throw new Error('An image could not be captured.');
    image.src = await dataUrl(await response.blob());
    image.removeAttribute('srcset');
  }
  for (const media of clone.querySelectorAll('video,iframe')) media.remove();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${new XMLSerializer().serializeToString(clone)}</div></foreignObject></svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('The page could not be captured.')); image.src = url; });
    return encodeCapture(image, width, height, () => doc.createElement('canvas'));
  } finally { URL.revokeObjectURL(url); }
}
