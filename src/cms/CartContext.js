import { createContext, useContext } from 'react';

// The licence basket, provided by App and consumed by the Storefront ("Add to licence") + CartDrawer.
// Greatstone sells enterprise software LICENCES (sales-led, "from £X" pricing), so this is a
// request basket → quote, not a fixed-price consumer checkout: it never takes payment and transmits
// nothing. Real licence purchase + payment is the Laravel/Stripe backend (see HANDOVER → Checkout).
// Cart lives in App's in-memory state (not the persisted store), so it's ephemeral per session.
export const CartContext = createContext({ cart: {}, add: () => {}, setQty: () => {}, remove: () => {}, clear: () => {}, count: 0 });
export const useCart = () => useContext(CartContext);
