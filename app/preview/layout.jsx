// An editor frame route: rendered per request so Next can put the middleware's CSP nonce on its scripts.
export const dynamic = 'force-dynamic';

export default function Layout({ children }) {
  return children;
}
