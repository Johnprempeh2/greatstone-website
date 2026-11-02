export function readAuthLanding(search = '') {
  const query = new URLSearchParams(search);
  const verified = query.get('verified') === '1';
  return {
    openAccount: verified || query.has('token') || query.has('error'),
    recovery: query.has('token'),
    error: query.has('error') ? 'That link is invalid or has expired.' : null,
    verified,
  };
}

export function consumeVerifiedLanding(location, history) {
  const url = new URL(location.href);
  if (url.searchParams.get('verified') !== '1') return false;
  url.searchParams.delete('verified');
  url.hash = '#account';
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  return true;
}
