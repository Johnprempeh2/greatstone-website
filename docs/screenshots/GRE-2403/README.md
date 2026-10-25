# GRE-2403 editor block styles

Local Next editor frame, using the bundled release draft. No page content was saved or published. The "before" images remove only the host block style after Puck loads; the "after" images show the same draft with that style mirrored into Puck's iframe.

| Page | 1440 px | 390 px |
| --- | --- | --- |
| About | [Before](about-1440-before.png) / [After](about-1440-after.png) | [Before](about-390-before.png) / [After](about-390-after.png) |
| Method | [Before](method-1440-before.png) / [After](method-1440-after.png) | [Before](method-390-before.png) / [After](method-390-after.png) |
| Industries | [Before](industries-1440-before.png) / [After](industries-1440-after.png) | [Before](industries-390-before.png) / [After](industries-390-after.png) |

In all six iframe checks, the styled hero computed as `display: flex` with non-zero top padding; removing the mirrored block style changed it to `display: block` with zero padding. The browser reported no page errors.
