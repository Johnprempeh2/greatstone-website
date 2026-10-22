import release from '../next-proof/data/release.json';
import { catalogueFromRelease } from '../next-proof/catalogue-data.mjs';

export const catalogue = catalogueFromRelease(release);
export const catalogueReleaseNumber = release.release.number;
