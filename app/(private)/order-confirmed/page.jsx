import Confirmation from './Confirmation.jsx';
import { verifiedCheckoutSession } from '../../../next-proof/checkout-confirmation.mjs';

export default async function OrderConfirmedPage({ searchParams }) {
  const { session } = await searchParams;
  const id = typeof session === 'string' ? session : '';
  const verified = await verifiedCheckoutSession(id, process.env.STRIPE_SECRET_KEY);
  return <Confirmation sessionId={verified ? id : ''} />;
}
