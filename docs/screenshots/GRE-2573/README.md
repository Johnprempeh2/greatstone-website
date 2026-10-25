# GRE-2573 DX Consultancy method page

`before-1440.png` and `before-390.png` are full-page Chromium screenshots of
repository HEAD `23a5eba`, served locally by Vite at 1440 and 390 CSS pixels.
`after-1440.png` and `after-390.png` use the same browser, viewport heights,
reduced-motion setting and local Vite server after the method change.

At both widths the four steps and both existing tools render. The page has no
horizontal overflow. The four step links reach their sections; the closing CTA
opens the contact route.

`how-we-work-before-1440.png` and `how-we-work-before-390.png` show the
previous six-step How We Work page from `origin/main` (`23a5eba`).
`how-we-work-after-1440.png` and `how-we-work-after-390.png` show the same
route after John's rewrite choice, served locally by Vite. Both use full-page
Chromium captures at 1440 and 390 CSS pixels. The four method links reach their
sections, the closing CTA opens contact, and neither width has horizontal
overflow.
