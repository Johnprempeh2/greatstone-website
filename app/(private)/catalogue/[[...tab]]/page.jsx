'use client';

import { useParams } from 'next/navigation';
import CatalogueAdmin from '../../../../src/store/CatalogueAdmin.jsx';

export default function CataloguePage() {
  const { tab = [] } = useParams();
  return <CatalogueAdmin initialTab={tab[0] || 'offerings'} />;
}
