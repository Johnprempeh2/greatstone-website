// Shared inline SVGs (1.7px stroke, round caps — the house icon style). No emoji, ever.
export const Arrow = (p) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...p}>
    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Search = (p) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...p}>
    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
