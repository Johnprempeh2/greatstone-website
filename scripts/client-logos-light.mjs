// Makes the light client marks for the home page: each logo as one light tone on a transparent
// background, so it sits on the dark page with no white tile. Run: node scripts/client-logos-light.mjs
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const dir = new URL('../public/assets/two-doors/clients/', import.meta.url);
const out = new URL('light/', dir);
// ink: dark marks on white or transparent; the darker a pixel, the more solid it becomes.
// keep: marks that are already light on transparent; only the shape is kept.
const marks = [
  ['06.png', 'allen-overy', 'ink'], ['lcp.svg', 'lcp', 'ink'], ['04.png', 'london-business-school', 'ink'],
  ['02.png', 'uhbw-nhs', 'ink'], ['bank-of-ireland.svg', 'bank-of-ireland', 'ink'], ['05.png', 'welsh-government', 'ink'],
  ['phillips-66.svg', 'phillips-66', 'ink'], ['03.png', 'lloyds-bank', 'ink'], ['civica.svg', 'civica', 'keep'],
  ['01.png', 'd', 'ink'], ['shawbrook.svg', 'shawbrook', 'keep'],
];
const LIGHT = [236, 240, 234];

async function source(file) {
  let input = await readFile(new URL(file, dir));
  // Civica's file paints its own green tile behind the white mark; drop the tile.
  if (file === 'civica.svg') input = Buffer.from(input.toString().replace(/<rect[^>]*fill="#004529"\/>/, ''));
  return sharp(input, { density: 300 }).resize({ height: 240, withoutEnlargement: false }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

for (const [file, name, mode] of marks) {
  const { data, info } = await source(file);
  for (let i = 0; i < data.length; i += 4) {
    const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    const shape = data[i + 3] / 255;
    const alpha = mode === 'keep' ? shape * lum : shape * Math.min(1, (1 - lum) * 2.2);
    data[i] = LIGHT[0]; data[i + 1] = LIGHT[1]; data[i + 2] = LIGHT[2]; data[i + 3] = Math.round(alpha * 255);
  }
  await sharp(data, { raw: info }).trim({ threshold: 1 }).resize({ height: 120, fit: 'inside' }).png({ compressionLevel: 9 }).toFile(new URL(`${name}.png`, out).pathname);
  console.log(name);
}
