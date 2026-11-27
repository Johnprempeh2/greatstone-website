// Makes the light client marks for the home page: each logo as one light tone on a transparent
// background, so it sits on the dark page with no white tile. Run: node scripts/client-logos-light.mjs
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const dir = new URL('../public/assets/two-doors/clients/', import.meta.url);
const out = new URL('light/', dir);
// ink: dark marks on white or transparent; the darker a pixel, the more solid it becomes.
// keep: marks that are already light on transparent; only the shape is kept.
// light: light letters on a dark tile (London Business School); the letters stay, the tile goes (GRE-5823).
// Pass names to remake only those marks: node scripts/client-logos-light.mjs london-business-school
// Every source is a vector (GRE overnight polish, 27 Nov): the six that were small PNGs (115 to 200px, shown
// larger than they were) now come from Wikimedia: Commons "File:Allen and Overy.svg",
// "File:London Business School logo.svg", "File:University Hospitals Bristol and Weston NHS FT.svg";
// English Wikipedia "File:Welsh Government logo.svg" and "File:LloydsBankLogo.svg". d.svg is the D and the
// dot of deloitte.svg (Commons "File:Logo of Deloitte.svg").
const marks = [
  ['allen-overy.svg', 'allen-overy', 'ink'], ['lcp.svg', 'lcp', 'ink'], ['london-business-school.svg', 'london-business-school', 'light'],
  ['uhbw-nhs.svg', 'uhbw-nhs', 'ink'], ['bank-of-ireland.svg', 'bank-of-ireland', 'ink'], ['welsh-government.svg', 'welsh-government', 'ink'],
  ['phillips-66.svg', 'phillips-66', 'ink'], ['lloyds-bank.svg', 'lloyds-bank', 'ink'], ['civica.svg', 'civica', 'keep'],
  ['d.svg', 'd', 'ink'], ['shawbrook.svg', 'shawbrook', 'keep'],
];
// The page shows a mark at most 70px tall and 200px wide, so 240 by 720 is at least three device pixels
// to each CSS pixel. The work is done at twice that and scaled down.
const OUT = { height: 240, width: 720 };
const LIGHT = [236, 240, 234];

// The box around the solid pixels of a mark, ignoring the outer edge where a dark tile blended into its page.
function solidBox(data, { width, height, channels }, pad = 8, edge = 0.05) {
  const inset = Math.round(Math.min(width, height) * edge);
  let left = width, top = height, right = 0, bottom = 0;
  for (let y = inset; y < height - inset; y++) {
    for (let x = inset; x < width - inset; x++) {
      if (data[(y * width + x) * channels + 3] < 200) continue;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  left = Math.max(0, left - pad); top = Math.max(0, top - pad);
  return { left, top, width: Math.min(width, right + pad + 1) - left, height: Math.min(height, bottom + pad + 1) - top };
}

async function source(file) {
  let input = await readFile(new URL(file, dir));
  // Civica's file paints its own green tile behind the white mark; drop the tile.
  if (file === 'civica.svg') input = Buffer.from(input.toString().replace(/<rect[^>]*fill="#004529"\/>/, ''));
  // Draw the vector at the size it is needed, not at a fixed density and then stretched (which blurred the small ones).
  const { height, density = 72 } = await sharp(input).metadata();
  const want = OUT.height * 2;
  return sharp(input, { density: Math.min(2400, Math.ceil(density * want / height)) }).resize({ height: want }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

const only = new Set(process.argv.slice(2));
for (const [file, name, mode] of marks) {
  if (only.size && !only.has(name)) continue;
  const { data, info } = await source(file);
  for (let i = 0; i < data.length; i += 4) {
    const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    const shape = data[i + 3] / 255;
    const alpha = mode === 'keep' ? shape * lum : mode === 'light' ? shape * Math.min(1, Math.max(0, (lum - 0.45) * 2.5)) : shape * Math.min(1, (1 - lum) * 2.2);
    data[i] = LIGHT[0]; data[i + 1] = LIGHT[1]; data[i + 2] = LIGHT[2]; data[i + 3] = Math.round(alpha * 255);
  }
  // A light mark keeps a faint ring where the tile's edge blended into the page, so it is cut to its solid pixels.
  const image = mode === 'light' ? sharp(data, { raw: info }).extract(solidBox(data, info)) : sharp(data, { raw: info }).trim({ threshold: 1 });
  const made = await image.resize({ ...OUT, fit: 'inside' }).png({ compressionLevel: 9, palette: true }).toFile(new URL(`${name}.png`, out).pathname);
  console.log(name, `${made.width}x${made.height}`, `${Math.round(made.size / 1024)} KB`);
}
