# Page editor overhaul — Canva-grade authoring (plan)

Goal: take the Puck page editor from "stock Puck + one toolbar override" to a Canva-grade authoring surface.
Researched against the REAL @measured/puck 0.20.2 source in node_modules (not guesses) and the best-in-class
editors (Canva, Webflow, Framer, Gutenberg, Notion).

## Three things to know up front (the research corrected our mental model)

1. **Titles are already click-to-edit.** Headlines/eyebrows use Puck's native `contentEditable`. The gap John
   hit is they lack the *rich toolbar* the body has, not that they can't be edited. So ask #5 is "add the
   toolbar to headings," which is very doable.
2. **"Custom blocks" honestly means saving configured *instances*,** not authoring brand-new block code.
   No-code authoring of new render code would break the sanitise-everything security posture. New block *types*
   stay developer-authored; editors get a powerful "save this configured block / section" library.
3. **The custom shell rides Puck's composition + override API, which Puck flags as "experimental."** Real and
   usable (10 override keys verified), but version-coupled, so we wrap it as ONE removable editor plugin.

## How each ask is answered

| Ask | Approach | Tier |
|---|---|---|
| #1 Collapsible/neat right panel | Group props into Content (open) / Appearance / Section / Advanced accordions via the `fields` + `fieldLabel` overrides; the universal _section/_note go into a collapsed "Advanced" group | Quick win |
| #2 Outline-first rail + page thumbnails + organised picker | Custom shell via the `puck` composition override: `<Puck.Outline>` on top, a visual `Drawer.Item` picker below; thumbnails start as type-glyph + first line, live mini-renders later | Core (shell) / Big bet (live thumbs) |
| #3 Canva intuitiveness | Consolidate every override into one coherent editor Plugin + designed empty-state | Big bet (+ quick empty-state) |
| #4 Drag-drop performance | App-side wins: pause the 3D Stage + thumbnails during drag/type, debounce the draft save, memoise heavy blocks (the engine is already modern dnd-kit) | Quick win |
| #5 Formatting on titles/eyebrows | A constrained `HeadingRichField` variant of RichTextField (colour/bold for headings, no highlight box), rendered through the same `<RichText>` sanitiser chokepoint | Quick win → Core (floating toolbar) |
| #6 Save / create custom blocks | Promote Saved Sections into a first-class "My Blocks" library in the drawer + the inserter; "Save this block" on the block toolbar | Core |
| #7 Add-block from the page | Notion/Gutenberg "+" between blocks → searchable visual browser → insert at that position (replaces append-to-bottom-then-drag) | Core |
| #8 Next-level polish | Branded drag ghost, animated drop-indicator, on-canvas contextual toolbar (duplicate/move/delete/save), responsive viewport toggles | Quick (indicator) → Big bet |

## Roadmap

**Quick wins** (high value, low Puck-API risk, mostly app-side or a single override; each independently revertable):
- Collapsed-by-default field groups (the #1 fix)
- Rich toolbar on titles/eyebrows
- Drag/typing performance pass (Stage-pause, debounce, memoise)
- Visual drawer cards + search (split the 18-item Story category)
- Designed empty-state + animated drop-indicator + branded drag ghost

**Core upgrades** (the structural Canva mental model; higher effort, on the experimental override surface):
- Custom editor shell: outline-first rail (the headline move)
- In-canvas "+" add-block with positional insert
- Saved/custom blocks as a first-class "My Blocks" library
- Kill the puckKey full-remount; debounce the committed draft
- Inline floating format toolbar for headings

**Big bets** (highest polish ceiling; do once the Core shell proves out):
- Live page-preview thumbnails (outline + drawer + library)
- Consolidate all overrides into ONE durable editor Plugin
- Responsive viewport toggles + on-canvas action toolbar

## Risks to hold

- **Puck-version coupling:** the shell uses 7 of 10 experimental override keys + composition; wrap as one plugin.
- **Security (highest stakes):** every newly-rich heading MUST render via `<RichText>`→`sanitizeInline`. A single
  raw `{headline}` re-opens the stored-XSS we already closed.
- **Performance truth:** the real jank is app-side (keystroke → saveDraft → whole-App re-render + ~12 audit
  memos), not Puck's engine. Debounce + memo first; measure before/after.
- **Migrations:** object-field regrouping and slot-based insertion touch stored page data; gate behind version
  snapshots + tests.

## Recommended sequence

Ship the **Quick wins first** (they answer asks #1, #4, #5 and most of #2's picker at low risk and prove the
plugin pattern), then the **Core shell**, then **Big bets**. Each quick win is revertable and adversarially
reviewed before deploy, same as the rest of the CMS work.
