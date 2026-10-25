import { validateRelease, supportedReleaseSchemas } from './release-validator.mjs';
import { readGsamRelease, validateCurrent } from './gsam-release.mjs';

const refusal = (number, rule, message) => ({ number, rule, message });

export function createReleaseReader({ baked, siteId, orgId, readCurrent, readRelease }) {
  const bakedProblem = baked.gsamSnapshot ? null : validateRelease(baked, { siteId, orgId });
  if (bakedProblem) throw new Error(`Invalid baked release: ${bakedProblem.rule} ${bakedProblem.message}`);
  let lastGood = null;

  return async function activeRelease() {
    let refused = null;
    try {
      const current = await readCurrent();
      if (current === null) refused = refusal(null, 'current', 'Current release pointer is missing');
      else if (validateCurrent(current)) refused = refusal(current?.release ?? null, 'current', 'Current release pointer is invalid');
      else {
        const raw = await readRelease(current.release);
        if (raw === null) refused = refusal(current.release, 'missing', 'Release file is missing');
        else {
          const parsed = readGsamRelease(raw, current, { siteId, orgId }, baked);
          if (parsed.refused) refused = refusal(current.release, parsed.refused.rule, parsed.refused.message);
          else {
            lastGood = parsed.release;
            return { release: parsed.release, source: 'blobs', refused: null };
          }
        }
      }
    } catch (error) {
      refused = error?.code === 'NOT_CONFIGURED'
        ? refusal(null, 'config', 'Release site or organisation id is not configured')
        : error?.code === 'MISSING_RELEASE'
        ? refusal(error.number, 'missing', 'Release file is missing')
        : refusal(null, 'read', `Blobs read failed: ${error?.name || 'Error'}`);
    }
    return { release: lastGood || baked, source: lastGood ? 'cache' : 'baked', refused };
  };
}

export { supportedReleaseSchemas };
