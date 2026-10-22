import { validateRelease, supportedReleaseSchemas } from './release-validator.mjs';

const pointerId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const pointerDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
const refusal = (number, rule, message) => ({ number, rule, message });

export function createReleaseReader({ baked, siteId, orgId, readCurrent, readRelease }) {
  const bakedProblem = validateRelease(baked, { siteId, orgId });
  if (bakedProblem) throw new Error(`Invalid baked release: ${bakedProblem.rule} ${bakedProblem.message}`);
  let lastGood = null;

  return async function activeRelease() {
    let refused = null;
    try {
      const current = await readCurrent();
      if (current === null) refused = refusal(null, 'current', 'Current release pointer is missing');
      else if (current?.schema !== 1 || !Number.isSafeInteger(current.number) || current.number < 1 || !pointerId.test(current.releaseId || '') || !pointerDate.test(current.switchedAt || '') || !Number.isFinite(Date.parse(current.switchedAt))) refused = refusal(current?.number ?? null, 'current', 'Current release pointer is invalid');
      else {
        const raw = await readRelease(current.number);
        if (raw === null) refused = refusal(current.number, 'missing', 'Release file is missing');
        else if (Buffer.byteLength(raw) > 10 * 1024 * 1024) refused = refusal(current.number, 'R13', 'Release exceeds 10 MB');
        else {
          let release;
          try { release = JSON.parse(raw); }
          catch { refused = refusal(current.number, 'R1', 'Release is not valid JSON'); }
          if (release !== undefined) {
            const problem = validateRelease(release, { siteId, orgId });
            if (problem) refused = refusal(current.number, problem.rule, problem.message);
            else if (release.release.number !== current.number || release.release.id !== current.releaseId) refused = refusal(current.number, 'current', 'Release does not match current pointer');
            else {
              lastGood = release;
              return { release, source: 'blobs', refused: null };
            }
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
