# GRE-1946 visual comparison

Captured from local Next.js servers at 1440px and 390px, with reduced motion enabled. “Before” is `origin/main` at the start of this issue; “after” is `GRE-1946-release-adapter`. Both routes returned HTTP 200 with the same server-rendered title and heading. Each before and after PNG pair is byte-identical, so the release adapter changes no visible pixels.

| Page | Width | Before | After |
| --- | ---: | --- | --- |
| Home | 1440px | [View](before-home-1440.png) | [View](after-home-1440.png) |
| Home | 390px | [View](before-home-390.png) | [View](after-home-390.png) |
| Dev Tools | 1440px | [View](before-dev-tools-1440.png) | [View](after-dev-tools-1440.png) |
| Dev Tools | 390px | [View](before-dev-tools-390.png) | [View](after-dev-tools-390.png) |

The Next.js release metadata and `orgId` are present in the rendered HTML after the change. The [Impeccable detector report](design-detect.json) scanned five changed Next.js files and found zero issues.
