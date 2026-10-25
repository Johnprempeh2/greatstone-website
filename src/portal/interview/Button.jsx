/**
 * Brand buttons, per the signed-off mockup: primary is neon lime with dark
 * text; ghost is transparent with a lime glow border. Both uppercase,
 * letter-spaced, Montserrat 700.
 *
 * Port: source components/Button.tsx, types dropped.
 */

function classes(variant, small, className) {
  return [
    'btn',
    variant === 'primary' ? 'btn-primary' : 'btn-ghost',
    small ? 'btn-sm' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export function Button({ variant = 'primary', small, className, children, ...rest }) {
  return (
    <button className={classes(variant, small, className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({ variant = 'primary', small, className, children, ...rest }) {
  return (
    <a className={classes(variant, small, className)} {...rest}>
      {children}
    </a>
  );
}

/** The quiet, low-emphasis text link used for the decline path. */
export function QuietLink({ className, children, ...rest }) {
  return (
    <button type="button" className={className ? `quiet-link ${className}` : 'quiet-link'} {...rest}>
      {children}
    </button>
  );
}
