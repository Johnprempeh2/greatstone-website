import baked from '../../next-proof/data/release.json';
import { activeRelease } from '../release-source.js';
import { supportedReleaseSchemas } from '../../next-proof/release-reader.mjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { release, source, refused } = await activeRelease();
  return Response.json({
    siteId: release.siteId,
    releaseId: release.release.id,
    number: release.release.number,
    source,
    engine: { version: baked.release.engine.version, commit: baked.release.engine.commit },
    supportedReleaseSchemas,
    refused,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
