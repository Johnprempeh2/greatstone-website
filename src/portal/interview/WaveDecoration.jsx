/**
 * WaveDecoration: the signature Greatstone wave artwork. Canonical frozen
 * paths copied verbatim from the signed-off mockup
 * (docs/design/interview-screens-mockup.html). Do not redraw.
 *
 * Port: source components/WaveDecoration.tsx, types dropped.
 */

export function WaveDecoration({ position = 'top-right' }) {
  return (
    <svg
      className={`wave-decoration ${position} gs-wave`}
      viewBox="0 0 500 500"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g strokeWidth="0.8" fill="none" opacity="0.7">
        <path className="gs-draw" pathLength={1} d="M500 40 Q392 72 344 154 Q296 236 318 338 Q340 440 424 486" />
        <path className="gs-draw" pathLength={1} d="M484 52 Q382 84 336 162 Q290 240 311 336 Q332 432 410 476" />
        <path className="gs-draw" pathLength={1} d="M468 64 Q372 96 328 170 Q284 244 304 334 Q324 424 396 466" />
        <path className="gs-draw" pathLength={1} d="M452 76 Q362 108 320 178 Q278 248 297 332 Q316 416 382 456" />
        <path className="gs-draw" pathLength={1} d="M436 88 Q352 120 312 186 Q272 252 290 330 Q308 408 368 446" />
        <path className="gs-draw" pathLength={1} d="M420 100 Q342 132 304 194 Q266 256 283 328 Q300 400 354 436" />
      </g>
    </svg>
  );
}
