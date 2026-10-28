/**
 * Card and GlassCard surfaces, per the signed-off mockup. Card is the solid
 * charcoal tile with hover lift; GlassCard is the blurred glass panel with
 * the stronger lime border.
 *
 * Port: source components/Card.tsx, types dropped.
 */

export function Card({ className, children, ...rest }) {
  return (
    <div className={className ? `card ${className}` : 'card'} {...rest}>
      {children}
    </div>
  );
}

export function GlassCard({ className, children, ...rest }) {
  return (
    <div className={className ? `glass-card ${className}` : 'glass-card'} {...rest}>
      {children}
    </div>
  );
}
