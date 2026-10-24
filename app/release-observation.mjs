export const releaseNumber = (release) => release.release.number;

export function releaseReport(active, engine, supportedReleaseSchemas) {
  const { release, source, refused } = active;
  return { release: releaseNumber(release), siteId: release.siteId, number: releaseNumber(release),
    source, engine, supportedReleaseSchemas, refused };
}
