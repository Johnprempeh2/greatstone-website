'use client';

import StoreCart from '../../../src/store/StoreCart.jsx';

export default function Confirmation({ sessionId }) {
  return <div className="st-v15"><StoreCart confirmed sessionId={sessionId} /></div>;
}
