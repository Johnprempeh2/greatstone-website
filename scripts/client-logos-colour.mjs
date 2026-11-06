// Makes the full-colour client marks for the dark Two Doors page: each logo in its brand colours on a
// transparent background, with black ink turned white so it reads on #121212.
// Same file names as light/. Run: node scripts/client-logos-colour.mjs
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const dir = new URL('../public/assets/two-doors/clients/', import.meta.url);
const out = new URL('colour/', dir);
// white: the file has a white page behind the mark; turn the white into transparency.
// reverse: neutral (black and grey) ink becomes its light opposite; brand colours stay.
// allWhite: every ink outside the brand tile turns white (NHS text on dark backgrounds).
// box: a solid brand tile (NHS) inside the mark keeps its white letters.
const marks = [
  ['06.png', 'allen-overy', { white: true }],
  ['lcp.svg', 'lcp', {}],
  ['04.png', 'london-business-school', {}],
  ['02.png', 'uhbw-nhs', { white: true, allWhite: true, box: true }],
  ['bank-of-ireland.svg', 'bank-of-ireland', {}],
  ['05.png', 'welsh-government', { reverse: true }],
  ['phillips-66.svg', 'phillips-66', {}],
  ['03.png', 'lloyds-bank', { reverse: true }],
  ['civica.svg', 'civica', {}],
  ['01.png', 'd', { white: true, reverse: true }],
  ['shawbrook.svg', 'shawbrook', {}],
];

// The NHS lozenge: the bounding box of strong blue pixels in the top part of the image.
function blueBox(data, { width, height }) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height * 0.4; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (data[i + 2] > 140 && data[i] < 90) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

for (const [file, name, opts] of marks) {
  const input = await readFile(new URL(file, dir));
  const { data, info } = await sharp(input, { density: 600 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const box = opts.box ? blueBox(data, info) : null;
  for (let p = 0, i = 0; i < data.length; p++, i += 4) {
    const x = p % info.width, y = Math.floor(p / info.width);
    if (box && x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1) continue;
    let [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3] / 255];
    if (opts.white) {
      // Colour to alpha against white: the least white channel sets how solid the pixel is.
      const k = Math.max(255 - r, 255 - g, 255 - b) / 255;
      if (k === 0) { data[i + 3] = 0; continue; }
      [r, g, b] = [r, g, b].map((c) => Math.round((c - 255 * (1 - k)) / k));
      a *= k;
    }
    if (opts.allWhite) [r, g, b] = [255, 255, 255];
    if (opts.reverse && Math.max(r, g, b) - Math.min(r, g, b) < 48) [r, g, b] = [255 - r, 255 - g, 255 - b];
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = Math.round(a * 255);
  }
  await sharp(data, { raw: info }).trim({ threshold: 1 }).resize({ height: 120, fit: 'inside' })
    .png({ compressionLevel: 9 }).toFile(new URL(`${name}.png`, out).pathname);
  console.log(name);
}
