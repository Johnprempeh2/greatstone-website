import { SITE_CONTRACT } from '../next-proof/site-contract.mjs';

export const releaseNumber = (release) => release.release.number;

export function releaseReport(active, engine, supportedReleaseSchemas) {
  const { release, source, refused } = active;
  return { release: releaseNumber(release), siteId: release.siteId, number: releaseNumber(release),
    source, engine, supportedReleaseSchemas, siteContract: SITE_CONTRACT, refused };
}
