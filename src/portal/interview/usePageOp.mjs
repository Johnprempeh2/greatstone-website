// Port: the server-component half of each source page. A Next page awaited its loader on the server and
// either rendered or called redirect(); here the page asks the matching portal op once on mount and either
// renders the data, follows `{ redirect }`, or reports a signed-out / failed load.

import { useCallback, useEffect, useState } from 'react';
import { portalOp, redirectOf, navigate, followRedirect } from './api.mjs';

/** → { status: 'loading' | 'ready' | 'redirecting' | 'signed-out' | 'error', data, error, reload } */
export function usePageOp(op, args = {}) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const argsKey = JSON.stringify(args);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading', data: null, error: null });
    portalOp(op, JSON.parse(argsKey)).then(({ data, error, signedOut }) => {
      if (!alive) return;
      if (signedOut) return setState({ status: 'signed-out', data: null, error });
      if (error) return setState({ status: 'error', data: null, error });
      const to = redirectOf(data);
      if (to) {
        // A loader that redirects to the page it is on would loop; show it as a failed load instead.
        if (typeof location !== 'undefined' && location.hash === to) {
          return setState({ status: 'error', data: null, error: 'This page could not be shown just now.' });
        }
        navigate(to);
        return setState({ status: 'redirecting', data: null, error: null });
      }
      setState({ status: 'ready', data, error: null });
    });
    return () => {
      alive = false;
    };
  }, [op, argsKey, tick, reload]);

  return { ...state, reload };
}

/**
 * Port: a server-action form. Submits the form's fields (FormData → object) as the op args and follows the
 * redirect the action used to issue. A second submit while one is in flight is ignored.
 */
export function useActionForm(op, onError) {
  const [pending, setPending] = useState(false);
  const onSubmit = async (e) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    const args = Object.fromEntries(new FormData(e.currentTarget));
    const { data, error } = await portalOp(op, args);
    setPending(false);
    if (error) return onError(error);
    // A redirect to the hash already showing (e.g. ?seats=exhausted again) leaves its notice in place.
    followRedirect(data);
  };
  return { onSubmit, pending };
}
