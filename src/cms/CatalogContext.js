import { createContext, useContext } from 'react';

// The product catalogue, provided by App from the store and consumed by the Storefront block (on
// both the public site and the editor canvas). Mirrors MediaContext: the data lives in the store,
// blocks read it through context rather than carrying their own copy. Default is empty so a block
// rendered without a provider degrades gracefully instead of throwing.
export const CatalogContext = createContext({ products: [], categories: [] });
export const useCatalog = () => useContext(CatalogContext);
