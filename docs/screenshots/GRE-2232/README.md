# GRE-2232 local editor check

Captured at 1440 × 900 in the Next.js editor on 24 October 2026. A local host page sent the frame protocol 1 `hello` and `load-draft` messages for the Proof page. It then sent `set-motion` for the selected Hero block with `bg.ascent` and `subtle`.

- `before.png`: the loaded draft before the motion message.
- `after.png`: the editor after `set-motion-result` returned `ok: true`. The Puck Motion group shows Ascent and Subtle, and the frame shows **Unsaved changes**.

The local draft was not saved or deployed. The temporary host and dev server were stopped after capture.
