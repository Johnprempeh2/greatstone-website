import { activeRelease, releaseStore } from '../../release-source.js';

const contentTypes = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif' };
const mediaFile = /^[0-9a-f]{64}\.(png|jpg|webp|avif|gif)$/;

export async function GET(_request, { params }) {
  const { file } = await params;
  const match = mediaFile.exec(file);
  if (!match) return new Response(null, { status: 404 });
  const key = `media/${file}`;
  const { release } = await activeRelease();
  if (!Object.values(release.media).some((item) => item.key === key)) return new Response(null, { status: 404 });
  try {
    const bytes = await releaseStore().get(key, { type: 'arrayBuffer' });
    if (bytes === null) return new Response(null, { status: 404 });
    return new Response(bytes, { headers: { 'Content-Type': contentTypes[match[1]], 'Cache-Control': 'public, max-age=31536000, immutable' } });
  } catch {
    return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
