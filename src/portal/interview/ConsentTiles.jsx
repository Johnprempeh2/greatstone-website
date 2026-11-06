/**
 * Consent option tiles, per mockup screen 3: a two-tile radio group with the
 * lime selection ring, a bold option name and one honest line under each
 * option about what it means. Controlled by the parent (SignOffPanel).
 *
 * Port: source components/ConsentTiles.tsx, types dropped.
 */

export function ConsentTiles({ groupLabel, options, selected, onSelect, disabled = false }) {
  return (
    <div className="consent-options" role="radiogroup" aria-label={groupLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={selected === option.value}
          className={selected === option.value ? 'consent-opt selected' : 'consent-opt'}
          disabled={disabled}
          onClick={() => onSelect(option.value)}
        >
          <span className="opt-name">
            <span className="opt-ring" aria-hidden="true"></span>
            {option.name}
          </span>
          <span className="opt-line">{option.line}</span>
        </button>
      ))}
    </div>
  );
}
