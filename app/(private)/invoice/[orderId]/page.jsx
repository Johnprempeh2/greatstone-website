'use client';

import { useParams } from 'next/navigation';
import InvoiceView from '../../../../src/store/InvoiceView.jsx';

export default function InvoicePage() {
  const { orderId } = useParams();
  return <InvoiceView orderId={orderId} />;
}
