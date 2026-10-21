# Design detector: required before every website pull request

The Impeccable detector (61 rules, engine 0.1.16) runs on the UI files a branch changes before the
pull request opens. John decided this on 22 October 2026 (GRE-1837). The safety limits come from the
code read on GRE-1836; the brand ignores come from Mica's evaluation on GRE-1821.

## The step

```bash
npm run design:detect                      # UI files under src/ changed against origin/main
```

1. Run it on your branch before `gh pr create`.
2. Paste the summary it prints on the task and in the PR description. Attach
   `.impeccable/reports/detect-latest.json` to the task.
3. Give every finding one line: **fixed**, or **justified** with a reason (for example "brand allows
   10px labels"). A clean scan does not replace the screenshot review.

If no UI file changed (copy-only, data-only or server work), the script says so. Post that line instead.

Other forms:

```bash
npm run design:detect -- --all             # the whole of src/
npm run design:detect -- src/blocks/Hero.jsx src/two-doors.css
npm run design:detect -- --url http://localhost:5180/   # adds a rendered scan at 390
```

## Rendered scan: local only, a warning

`--url` accepts `localhost` or `127.0.0.1` only. It never fails the step: if it times out or the browser
is missing, the summary says so and the PR goes on. The desktop (1440) rendered scan timed out in the
GRE-1821 trial, so it is not part of the step.

The engine needs a Chromium. On the GSAM host, use the Playwright copy:

```bash
export IMPECCABLE_BROWSER=~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome
export LD_LIBRARY_PATH=~/.cache/ms-playwright/gs-chromium-libs/root/usr/lib/x86_64-linux-gnu
```

## Brand ignores

`.impeccable/config.json` holds the four scoped ignores from GRE-1821. Each one ignores a value in named
files, never a whole rule. Do not add `ignoreRules` entries. Change this file only with Mica's agreement.

| Rule | Value | Files | Why |
| --- | --- | --- | --- |
| `overused-font` | `Montserrat` | all | Brand face |
| `kicker-above-heading` | any | `src/two-doors.css`, `src/blocks/*.jsx` | Brand kicker |
| `radial-halo` | `#1b5039` | `src/site.css` | Brand emerald atmosphere |
| `repeating-stripes-gradient` | any | `src/two-doors.css` | Tide still |

## The engine and its safety limits

- The engine is a **preinstalled binary**, outside the repo, at
  `~/.local/share/greatstone-tools/impeccable/0.1.16/impeccable-<platform>` (the real home directory,
  not an agent run's temporary `$HOME`). `IMPECCABLE_ENGINE` can point at another copy.
- Before every run the script checks the binary's **SHA-256** against the pinned value for the platform
  (in `scripts/design-detect.mjs`). Missing or different: it stops with exit 3 and runs nothing.
- The script **never downloads** the engine. If it is missing, ask Bedrock to install it.
- It always sets `IMPECCABLE_NO_TELEMETRY=1`, `IMPECCABLE_NO_UPDATE_CHECK=1` and `DO_NOT_TRACK=1`, and
  drops `IMPECCABLE_BIN` and `IMPECCABLE_DOWNLOAD_BASE`.
- Not used, by decision: the Impeccable launcher, `npx impeccable`, `impeccable install/update`, detector
  hooks, live mode and the direction picker. Do not run them on this repo.

Pins: Impeccable `skill-v4.7.0` = commit `aeeb3d8c30b5f95aeeb3e893b0f1a308af8fdb8f`, which names engine
0.1.16. Tag `engine-v0.1.16` = commit `24bdeb776a66a3c36d493072a04541287a327408`.

### Installing the engine (Bedrock, once per machine)

Download the platform's binary from the `engine-v0.1.16` release by hand, check it, then install it
read-only. Example for Linux x64:

```bash
curl -fsSLO https://github.com/pbakaus/impeccable/releases/download/engine-v0.1.16/impeccable-linux-x64
echo "a890a5b4b7d9d79ec54aa74612b5e924e5f5b422600a25fde8bcbda11b031787  impeccable-linux-x64" | sha256sum -c -
install -D -m 555 impeccable-linux-x64 ~/.local/share/greatstone-tools/impeccable/0.1.16/impeccable-linux-x64
```

Use the hash for your platform from `ENGINE_SHA256` in `scripts/design-detect.mjs`. If `sha256sum -c`
fails, stop and tell Everest.

Exit codes: `0` scan completed (with or without findings), `1` scan failed, `3` engine missing or hash
mismatch.
