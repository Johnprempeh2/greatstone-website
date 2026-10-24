#!/usr/bin/env bash
# Prepares a GSAM task worktree of this repo (GRE-2248). GSAM runs it in the
# worktree on creation and again on every reuse, so it must stay idempotent.
#
# Disk: node_modules starts as hardlinks to the primary checkout's packages, so a
# new worktree costs about the size of the source (~75 MB), not ~1 GB. npm then
# installs only what this branch's lockfile changes; it replaces package folders
# instead of editing files in place, so the primary checkout is never changed.
set -euo pipefail

BUDGET_GB="${GSAM_WEBSITE_WORKTREE_BUDGET_GB:-15}"
primary="${GSAM_WORKSPACE_REPO_ROOT:-}"
here="$(pwd -P)"

if [ -n "$primary" ] && [ -d "$primary/node_modules" ] && [ ! -e node_modules ] &&
   [ "$(cd "$primary" && pwd -P)" != "$here" ]; then
  cp -al "$primary/node_modules" node_modules || rm -rf node_modules
  # npm and build tools rewrite these in place, which would also change the
  # primary's copy. npm rebuilds .package-lock.json from the real tree.
  rm -rf node_modules/.package-lock.json node_modules/.cache node_modules/.vite
fi

# Skip npm when node_modules already matches this lockfile.
if ! cmp -s package-lock.json node_modules/.gsam-provisioned-lock 2>/dev/null; then
  npm install --no-save --prefer-offline --no-audit --no-fund
  cp --remove-destination package-lock.json node_modules/.gsam-provisioned-lock
fi

# Size budget for all task worktrees together. du counts a hardlinked file once,
# so the extra cost is (primary + worktrees) minus the primary alone. Worktrees
# may sit inside the primary (<primary>/.gsam/worktrees), hence the --exclude.
parent="$(dirname "$here")"
if [ "${GSAM_WORKSPACE_CREATED:-}" = "true" ] && [ -n "$primary" ] && [ "$parent" != "$primary" ]; then
  total_kb="$(du -skc "$primary" "$parent" 2>/dev/null | tail -n 1 | cut -f1)"
  base_kb="$(du -sk --exclude="$parent" "$primary" 2>/dev/null | cut -f1)"
  used_kb=$(( ${total_kb:-0} - ${base_kb:-0} ))
  if [ "${used_kb:-0}" -gt $((BUDGET_GB * 1024 * 1024)) ]; then
    echo "GSAM-DISK-ALERT: website task worktrees use $((used_kb / 1024 / 1024)) GB, over the ${BUDGET_GB} GB budget, in $parent" >&2
  fi
fi
