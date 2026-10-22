'use client';

import { useEffect, useState } from 'react';
import StoreProduct from '../src/store/StoreProduct.jsx';
import StoreCart from '../src/store/StoreCart.jsx';

export default function CatalogueProductClient({ item, related }) {
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    const route = () => {
      if (location.hash === '#shop') { location.replace('/shop'); return; }
      setConfirmed(location.hash.startsWith('#order-confirmed'));
    };
    route();
    window.addEventListener('hashchange', route);
    return () => window.removeEventListener('hashchange', route);
  }, []);
  return confirmed ? <StoreCart confirmed /> : <><StoreProduct slug={item.slug} initialOffering={item} initialRelated={related} onBack={() => { window.location.href = '/shop'; }} /><StoreCart /></>;
}
