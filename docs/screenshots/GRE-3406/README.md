# GRE-3406 visual review

The `before-*.png` images came from `origin/main` before this issue's changes. The `after-*.png` images came from this branch. Both runs used Vite, headless Chromium, a 900px viewport height, and reduced motion so off-screen content was visible in full-page captures.

The home and DX Consultancy page captures are at 1440px and 390px. The after captures were repeated after a clean build and the review changes. The home uses the frozen Two Doors opening, so it is visually unchanged; the fresh files differ at the byte level because moving page elements render at different frames. The same widths cover each restyled block through `gre3406-visual.html`. Its `PillarCards` fixture uses five real service-catalogue categories to exercise the explicit capability layout without mislabelling five of the eight method pillars. The canonical five professional-services capabilities are not present in this repository, so the fixture does not claim to represent them. The `StatStrip` fixture now selects the plain variant and has no body. No live page currently uses plain `StatStrip`, so this fixture provides the relevant regression check. The `LogoWall` marquee is new, so it has only after images.

The motion-on marquee frames are [1440px](after-LogoWall-motion-1440.png) and [390px](after-LogoWall-motion-390.png). Browser checks confirmed `running` normally and `paused` on hover and keyboard focus at both sizes. The plain stat count-up reached its target on first view at both sizes.

The Invite 390px after capture was retaken after Keystone's phone review. Chromium computed its heading at 19.5px, within the 26px phone cap.

| Block | Surface | 1440px | 390px |
| --- | --- | --- | --- |
| Hero | Dark | [Before](before-Hero-1440.png) · [After](after-Hero-1440.png) | [Before](before-Hero-390.png) · [After](after-Hero-390.png) |
| LogoWall marquee | Dark | [After](after-LogoWall-1440.png) | [After](after-LogoWall-390.png) |
| PillarCards | Dark | [Before](before-PillarCards-1440.png) · [After](after-PillarCards-1440.png) | [Before](before-PillarCards-390.png) · [After](after-PillarCards-390.png) |
| StatStrip | Dark | [Before](before-StatStrip-1440.png) · [After](after-StatStrip-1440.png) | [Before](before-StatStrip-390.png) · [After](after-StatStrip-390.png) |
| ComparisonMatrix | Light | [Before](before-ComparisonMatrix-1440.png) · [After](after-ComparisonMatrix-1440.png) | [Before](before-ComparisonMatrix-390.png) · [After](after-ComparisonMatrix-390.png) |
| TimeSavingsCalculator | Light | [Before](before-TimeSavingsCalculator-1440.png) · [After](after-TimeSavingsCalculator-1440.png) | [Before](before-TimeSavingsCalculator-390.png) · [After](after-TimeSavingsCalculator-390.png) |
| AiCostCalculator | Light | [Before](before-AiCostCalculator-1440.png) · [After](after-AiCostCalculator-1440.png) | [Before](before-AiCostCalculator-390.png) · [After](after-AiCostCalculator-390.png) |
| DxConsultancyMethod | Dark | [Before](before-DxConsultancyMethod-1440.png) · [After](after-DxConsultancyMethod-1440.png) | [Before](before-DxConsultancyMethod-390.png) · [After](after-DxConsultancyMethod-390.png) |
| Invite, framed | Dark | [Before](before-Invite-1440.png) · [After](after-Invite-1440.png) | [Before](before-Invite-390.png) · [After](after-Invite-390.png) |

Page regression captures: [home before 1440](before-home-1440.png), [home after 1440](after-home-1440.png), [home before 390](before-home-390.png), [home after 390](after-home-390.png), [DX before 1440](before-dx-1440.png), [DX after 1440](after-dx-1440.png), [DX before 390](before-dx-390.png), [DX after 390](after-dx-390.png). A supplemental [services page 1440](after-services-1440.png) and [services page 390](after-services-390.png) capture checks another unaffected page.
