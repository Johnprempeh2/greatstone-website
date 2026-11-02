// Service controls use the software basket; the old inquiry drawer is no longer mounted.
import { useCart, addService, removeService, openCart } from './cart.mjs';
import { serviceSlug } from './services.mjs';
import { bumpService } from './popularity.mjs';
import { track } from '../lib/analytics.js';
import './service-detail.css';

export function InquiryToggle({ service, size = 'sm', onAdded }) {
  const items = useCart();
  const slug = serviceSlug(service);
  const on = items.some((line) => line.serviceSlug === slug);
  const flip = (event) => {
    event.preventDefault(); event.stopPropagation();
    if (on) removeService(slug);
    else {
      addService({ slug, name: service.name, category: service.category });
      bumpService(slug, 'inquiry');
      track('add_to_inquiry', { service: slug });
      if (onAdded) onAdded();
    }
  };
  return <button type="button" className={'inq-toggle' + (on ? ' is-on' : '') + (size === 'lg' ? ' lg' : '')}
    aria-pressed={on} onClick={flip}>{on ? 'In your basket' : 'Add to basket'}</button>;
}

export function InquiryBar() {
  const count = useCart().filter((line) => line.kind === 'service').length;
  if (!count) return null;
  return <div className="inq-bar"><span className="inq-bar-txt">{count} service{count === 1 ? '' : 's'} in your basket</span>
    <button type="button" className="inq-bar-btn" onClick={openCart}>Review basket →</button></div>;
}
