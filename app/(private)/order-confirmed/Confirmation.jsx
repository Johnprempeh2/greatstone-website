'use client';

import StoreCart from '../../../src/store/StoreCart.jsx';

export default function Confirmation({ sessionId }) {
  return <StoreCart confirmed sessionId={sessionId} />;
}
