# GRE-2574 local visual check

Captured on 25 October 2026 from `next dev` with Chromium at 1440 and 390 px,
dark and light colour preferences, and reduced motion. The site currently has
one dark palette, so the two colour preferences render alike.

The `before-*` shots use the checked-in release with no briefing pages. The
`after-*` shots use this branch and two temporary, clearly labelled example
pages in the local release file. Both article routes returned HTTP 200. The
temporary pages were removed; the committed release file is unchanged. No
production or preview deploy was made.

The local browser check found two card links, no horizontal overflow at either
width, and no page errors. Real briefings appear only after their approved
article pages are included in a GSAM site content release.
