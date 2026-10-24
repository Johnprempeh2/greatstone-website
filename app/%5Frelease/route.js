import baked from '../../next-proof/data/release.json';
import { activeRelease } from '../release-source.js';
import { supportedReleaseSchemas } from '../../next-proof/release-reader.mjs';
import { releaseNumber, releaseReport } from '../release-observation.mjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const active = await activeRelease();
  return Response.json(releaseReport(active, baked.release.engine, supportedReleaseSchemas),
    { headers: { 'Cache-Control': 'no-store', 'x-gsam-release': String(releaseNumber(active.release)) } });
}
