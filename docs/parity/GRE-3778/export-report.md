# GRE-3778 export report

Engine render from http://127.0.0.1:5293, baked release 1. 16 pages. Site stylesheet 186 KB.

## Site stylesheet and chrome

- stylesheet: declaration stroke ×1, declaration filter ×1, declaration background-image ×1
- header: nothing removed
- nav: nothing removed
- footer: nothing removed

## Pages

### /

HTML 0 KB, page CSS 0 rules.

- frozen landing: TwoDoors, TwoDoorsStory, TwoDoorsProof, TwoDoorsTools, TwoDoorsClose, TwoDoorsBottom render through the two-doors-landing island
- sanitiser removes nothing

### /dx-consultancy

HTML 0 KB, page CSS 0 rules.

- AiBaselineSurvey → island ai-baseline-survey
- AiCostCalculator → island ai-cost-calculator
- sanitiser removes nothing

### /dev-tools

HTML 2 KB, page CSS 0 rules.

- sanitiser removes nothing

### /transformation-services

HTML 4 KB, page CSS 0 rules.

- sanitiser removes: article @tabindex ×8

### /how-we-help

HTML 82 KB, page CSS 4 rules.

- Panels: still render; its controls need an island (GRE-3777)
- ServiceCatalog: still render; its controls need an island (GRE-3777)
- 105 inline SVG (the sanitiser drops SVG)
- sanitiser removes: svg ×105, input ×1

### /services

HTML 16 KB, page CSS 13 rules.

- Panels: still render; its controls need an island (GRE-3777)
- Panels: still render; its controls need an island (GRE-3777)
- Faq: still render; its controls need an island (GRE-3777)
- 7 inline SVG (the sanitiser drops SVG)
- sanitiser removes: svg ×7, div @inert ×6, script ×1

### /method

HTML 11 KB, page CSS 16 rules.

- 3 inline SVG (the sanitiser drops SVG)
- sanitiser removes: svg ×3

### /case-studies

HTML 4 KB, page CSS 4 rules.

- 2 inline SVG (the sanitiser drops SVG)
- sanitiser removes: svg ×2

### /about

HTML 14 KB, page CSS 11 rules.

- Panels: still render; its controls need an island (GRE-3777)
- Panels: still render; its controls need an island (GRE-3777)
- Team: still render; its controls need an island (GRE-3777)
- 11 inline SVG (the sanitiser drops SVG)
- sanitiser removes: svg ×11

### /insights

HTML 10 KB, page CSS 5 rules.

- Panels: still render; its controls need an island (GRE-3777)
- IntelBand: still render; its controls need an island (GRE-3777)
- 8 inline SVG (the sanitiser drops SVG)
- sanitiser removes: svg ×8

### /climb

HTML 10 KB, page CSS 15 rules.

- MaturityMap: still render; its controls need an island (GRE-3777)
- Ladder: still render; its controls need an island (GRE-3777)
- 4 inline SVG (the sanitiser drops SVG)
- sanitiser removes: svg ×4

### /industries

HTML 6 KB, page CSS 4 rules.

- IndustryPicker: still render; its controls need an island (GRE-3777)
- 3 inline SVG (the sanitiser drops SVG)
- sanitiser removes: svg ×3, button @tabindex ×7, div @tabindex ×1

### /contact

HTML 3 KB, page CSS 3 rules.

- Panels: still render; its controls need an island (GRE-3777)
- BookDeepDive → island enquiry-form
- 4 inline SVG (the sanitiser drops SVG)
- sanitiser removes: svg ×4

### /privacy

HTML 8 KB, page CSS 0 rules.

- sanitiser removes nothing

### /cookies

HTML 5 KB, page CSS 0 rules.

- sanitiser removes nothing

### /terms

HTML 5 KB, page CSS 0 rules.

- sanitiser removes nothing

