# GRE-2215 local visual check

Captured on 24 October 2026 with `next dev`, Chromium headless, 1440 × 900 and
390 × 844 viewports, dark and light colour preferences, and reduced motion.

- `before-dev-tools-*`: unmodified `origin/main` in a scratch copy.
- `after-dev-tools-*`: this branch with a **temporary local release draft** that
  adds a Subtle `MotionBand` after the Dev Tools block. The draft passed release
  validation and was then removed. The committed release file is unchanged.
- `after-editor-dev-tools-1440-dark.png`: the Next editor after its GSAM frame
  handshake. The Dev Tools block was selected through Outline. Its Motion
  section has Effect and Off, Subtle, Full intensity controls. Nothing was saved.

The site currently has no light theme, so the light preference renders the dark
palette. The band is a calm, copy-free still on the phone and under reduced
motion. These shots test block insertion and the runtime fallback without a
public deploy. The Two Doors home page was not changed or captured after
John removed it from this motion work on 24 October.
