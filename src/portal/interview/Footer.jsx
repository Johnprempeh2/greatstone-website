/**
 * The branded footer every interview screen ends with.
 *
 * Port: the source repeated this markup inline in each page (and as Footer() in join/[token]/page.tsx);
 * it is the same markup, written once.
 */

export function InterviewFooter({ borderless = false }) {
  return (
    <footer className={borderless ? 'gs-footer borderless' : 'gs-footer'}>
      <div className="footer-tagline">The Foundation of Digital Excellence</div>
      <div className="footer-contact">
        <a href="mailto:DX@greatstoneinternational.co.uk">DX@greatstoneinternational.co.uk</a>
      </div>
      <div className="footer-legal">&copy; 2026 Greatstone International Ltd. All rights reserved.</div>
    </footer>
  );
}

export function DotDivider({ className }) {
  return (
    <div className={className ? `dot-divider ${className}` : 'dot-divider'} aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => (
        <span key={i}></span>
      ))}
    </div>
  );
}
