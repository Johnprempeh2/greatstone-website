// Reproducibility note for public/assets/greatstone-logo-web.webp (NOT wired into the build).
//
// WebP is intentionally NOT a build-time conversion here: no image encoder ships as a project dependency
// (sharp is a heavy native binary we do not want in node_modules just for one logo), so the .webp is
// generated once, offline, and committed alongside the PNG. Run this script to print the exact command
// used, or regenerate with any encoder you have to hand.
//
// What produced the committed file (lossless, transparent, 800x160), 42,980 -> 22,642 bytes:
//   python3 - <<'PY'
//   from PIL import Image
//   im = Image.open("public/assets/greatstone-logo-web.png").convert("RGBA")
//   im.save("public/assets/greatstone-logo-web.webp", "WEBP", lossless=True, method=6)
//   PY
//
// Equivalent with cwebp (if installed):  cwebp -lossless public/assets/greatstone-logo-web.png -o public/assets/greatstone-logo-web.webp
// Equivalent with sharp-cli:             npx --yes sharp-cli -i public/assets/greatstone-logo-web.png -o public/assets/ -f webp --webpLossless

console.log('greatstone-logo-web.webp is a committed, pre-generated lossless twin of the PNG.');
console.log('To regenerate, use the PIL / cwebp / sharp-cli command in the header comment of this file.');
