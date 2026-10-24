# GRE-2227 local frame check

The desktop and phone `before` screenshots show the Next editor after a bound `insert-media` message with only an unavailable asset URL. The matching `after` screenshots show the same draft after a second message supplied a Blob. The Puck iframe rendered that Blob image at its natural width without saving or reloading. The frame returned `insert-media-result: ok` and kept the draft unsaved. `local-frame-after.png` is a separate desktop capture of the same Blob path.

This checks the site frame locally. The GSAM picker and the deployed editor origin need their own end-to-end check after this code is available there.
