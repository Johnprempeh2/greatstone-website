import { execFileSync } from 'node:child_process';
import packageJson from '../package.json' with { type: 'json' };

const commitPattern = /^[a-f0-9]{40}$/i;

// next.config.mjs bakes GSAM_ENGINE_COMMIT in at build, and Next only replaces the literal
// process.env.GSAM_ENGINE_COMMIT expression, so it is named here, not read through `env`.
export function frameEngine(releaseEngine, env = { ...process.env, GSAM_ENGINE_COMMIT: process.env.GSAM_ENGINE_COMMIT }, readGit = () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()) {
  let commit = [env.GSAM_ENGINE_COMMIT, env.COMMIT_REF, env.VERCEL_GIT_COMMIT_SHA].find((value) => commitPattern.test(value || ''));
  if (!commit) {
    try { commit = readGit(); } catch { /* deployed bundles may not have .git */ }
  }
  if (!commitPattern.test(commit || '')) commit = releaseEngine.commit;
  return { version: packageJson.version, commit };
}
