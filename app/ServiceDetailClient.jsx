'use client';

import ServiceDetail from '../src/store/ServiceDetail.jsx';
import StoreCart from '../src/store/StoreCart.jsx';
import { ServicesContext } from '../src/store/services.mjs';

// GRE-1824: a service's own page on the Next site. The basket drawer carries the enquiry,
// as it does on the catalogue page.
export default function ServiceDetailClient({ slug, catalogue, listingPath }) {
  const back = listingPath || '/';
  return <ServicesContext.Provider value={catalogue}>
    <ServiceDetail slug={slug} catalogueHref={back} onBack={() => { window.location.href = back; }} />
    <StoreCart />
  </ServicesContext.Provider>;
}
