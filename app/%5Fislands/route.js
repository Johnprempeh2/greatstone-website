// GRE-3777: the island list for GSAM live design. Names, labels, placeholders, accepted attributes and
// the placeholder CSS GSAM adds to a draft page so each <gs-island> shows as a labelled box.
import { islandManifest } from '../../next-proof/islands.mjs';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(islandManifest(), { headers: { 'Cache-Control': 'public, max-age=300' } });
}
