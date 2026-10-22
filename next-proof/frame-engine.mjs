import { execFileSync } from 'node:child_process';
import packageJson from '../package.json' with { type: 'json' };

const commitPattern = /^[a-f0-9]{40}$/i;

export function frameEngine(releaseEngine, env = process.env, readGit = () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()) {
  let commit = [env.GSAM_ENGINE_COMMIT, env.COMMIT_REF, env.VERCEL_GIT_COMMIT_SHA].find((value) => commitPattern.test(value || ''));
  if (!commit) {
    try { commit = readGit(); } catch { /* deployed bundles may not have .git */ }
  }
  if (!commitPattern.test(commit || '')) commit = releaseEngine.commit;
  return { version: packageJson.version, commit };
}
