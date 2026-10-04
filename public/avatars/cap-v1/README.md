# cap-v1 agent avatars

Static exports of the ClipLab cap-v1 character in the eight Greatstone
palettes, for the front door agent cards (GRE-416 spec, S5 and B5).

- `<palette>.svg`: the card image. Scales cleanly, about 9 KB.
- `<palette>.png`: 512 x 512 (256 at 2x), transparent. For email (B4),
  where SVG does not render.
- `index.json`: the palette ids, in order, so code never guesses a filename.

Pose is `rest`, facing front. Rendered with `renderAgentSvg` from the
GS Agentic Manager copy of ClipLab cap-v1 (release v0.2.0, commit
987b6db049471df815ebcb88bcd7abb46ed0c34b), then rasterised with sharp.
cap-v1 is frozen; new artwork means a new character version and a new folder.

## Licence

ClipLab art is MIT licensed. `LICENSE` in this folder is the original
notice and must stay with these files wherever they are copied.

Source: https://github.com/tonio-alucema/cliplab
