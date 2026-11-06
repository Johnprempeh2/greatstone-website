/**
 * GsLogo: the Greatstone International wordmark.
 *
 * Port: the source inlined the mockup's PNG as a 58 KB base64 data URI. The website already serves its own
 * wordmark (the one the site header uses), so the interview wears the site's logo rather than shipping a
 * second copy of it in the bundle.
 */

const LOGO = '/assets/greatstone-logo-web.png';

export function GsLogo({ className }) {
  return (
    <div className={className ? `gs-logo ${className}` : 'gs-logo'}>
      <img src={LOGO} alt="Greatstone International" />
    </div>
  );
}
