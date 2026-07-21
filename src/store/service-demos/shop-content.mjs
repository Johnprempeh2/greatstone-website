// Content for the Commerce & Storefronts archetype.
//
// ONE KIND, not several. Every service here ends in the same place: money clears and something has to
// arrive. What differs is what is being bought (a product, a course, a tier, a treatment, a table) and what
// lands afterwards (an order, a QR ticket and a CPD certificate, an unlocked members area, a reconciled
// patient record). So the demo is a single purchase engine, and each service supplies its own catalogue,
// its own pricing rules and its own `grants`: the things the payment actually produces.
//
// MONEY IS IN PENCE. Every price below is an integer of the minor unit, and all arithmetic stays there
// until the moment it is formatted. Floating-point pounds are how a checkout ends up 1p out.
//
// HONESTY RULE: no network call, no Stripe, nothing is charged. The frame says so. What is real is the
// arithmetic: member pricing, discount codes, deposits and instalments all genuinely recompute.

export const SHOPS = {
  'online-store-ecommerce-build': {
    kind: 'shop',
    shop: {
      title: 'Ashanti Home', kicker: 'Catalogue of 159 lines, 4 shown',
      itemNoun: 'products',
      codes: { SPRING10: { pct: 10, label: 'SPRING10 applied' } },
      pay: { modes: ['full'] },
      items: [
        { id: 'p1', name: 'Kente throw', meta: 'Handwoven, 180 x 130cm', price: 12500, variants: [{ label: 'Indigo', delta: 0 }, { label: 'Ochre', delta: 0 }, { label: 'Limited weave', delta: 3500 }] },
        { id: 'p2', name: 'Carved stool', meta: 'Sese wood, one piece', price: 8900, variants: [{ label: 'Small', delta: 0 }, { label: 'Large', delta: 4000 }] },
        { id: 'p3', name: 'Brass lamp', meta: 'Cast and hand-finished', price: 15400 },
        { id: 'p4', name: 'Woven basket set', meta: 'Set of three', price: 4750 },
      ],
      grants: [
        { t: 'Order in your own database', d: 'Not a platform’s. You can query it, export it, and it is still yours if you change checkout provider.' },
        { t: 'Stock moved', d: 'The listing decrements as it sells, so the catalogue stops promising what the shelf cannot deliver.' },
        { t: 'Confirmation sent', d: 'Branded, with the variant the buyer actually chose, not a generic line.' },
      ],
      ledger: 'Order 1041 captured, reconciled against the Stripe payout on 24 July. No per-sale platform tax.',
    },
  },

  'stripe-checkout-setup': {
    kind: 'shop',
    shop: {
      title: 'Penrose Services', kicker: 'Live and taking payments',
      itemNoun: 'services',
      pay: { modes: ['full'] },
      items: [
        { id: 's1', name: 'Boiler service', meta: 'Annual, includes certificate', price: 9000 },
        { id: 's2', name: 'Landlord gas safety', meta: 'CP12 issued same day', price: 7500 },
        { id: 's3', name: 'Power flush', meta: 'Up to 10 radiators', price: 42000 },
      ],
      grants: [
        { t: 'Payment taken', d: 'A real card payment through Stripe, not an invoice you then have to chase.' },
        { t: 'Order captured', d: 'Written to your backend the moment the webhook fires, so what sold is never a guess.' },
        { t: 'Receipt issued', d: 'Branded to you rather than to the payment provider.' },
      ],
      ledger: 'Order 0007 captured. This is week one: the catalogue went up on Monday and this is Thursday.',
    },
  },

  'course-event-sales-platform': {
    kind: 'shop',
    shop: {
      title: 'Institute CPD', kicker: 'Courses, modules and events',
      itemNoun: 'courses',
      member: { onLabel: 'Member', offLabel: 'Non-member', pct: 30, note: 'Member pricing applies itself. Nobody has to remember the rate.' },
      codes: { EARLY15: { pct: 15, label: 'EARLY15 applied' } },
      pay: { modes: ['full', 'instalments'], instalments: 3 },
      items: [
        { id: 'c1', name: 'Valuation practice, Level 4', meta: '6 modules, self-paced, 12 CPD hours', price: 48000 },
        { id: 'c2', name: 'Ethics and conduct', meta: 'Single module, 3 CPD hours', price: 12000 },
        { id: 'c3', name: 'Annual conference ticket', meta: 'Accra, 14 November', price: 26000, max: 6 },
      ],
      grants: [
        { t: 'Access provisioned', d: 'The moment payment clears. Nobody emails a login the next morning.' },
        { t: 'QR ticket issued', d: 'For the conference line, scannable on the door and tied to the buyer.' },
        { t: 'CPD certificate queued', d: 'Auto-issued on completion, with the hours already on it.' },
      ],
      ledger: 'Order CPD-2211 captured against the member record, and the CPD hours are already counted.',
    },
  },

  'online-deposits-patient-payments': {
    kind: 'shop',
    shop: {
      title: 'Meridian Dental', kicker: 'Treatment plans and deposits',
      itemNoun: 'treatments', single: true,
      pay: { modes: ['deposit', 'instalments', 'full'], depositPct: 20, instalments: 6 },
      items: [
        { id: 't1', name: 'Implant, single tooth', meta: 'Consultation, placement, crown', price: 235000 },
        { id: 't2', name: 'Clear aligners', meta: 'Full course, both arches', price: 320000 },
        { id: 't3', name: 'Hygiene plan', meta: '12 months, 3 visits', price: 27000 },
      ],
      grants: [
        { t: 'Deposit held, not lost', d: 'The slot is secured against a real payment rather than a promise at the front desk.' },
        { t: 'Receipt to the patient record', d: 'Tied to the plan, so the balance owing is never a separate spreadsheet.' },
        { t: 'Front desk freed', d: 'No card machine, no reading a long number over the phone.' },
      ],
      ledger: 'Payment PT-8842 recorded against the plan. Outstanding balance updates on the dashboard the same second.',
    },
  },

  'membership-subscription-platform': {
    kind: 'shop',
    shop: {
      title: 'The Surveyors’ Association', kicker: 'Join, upgrade or cancel yourself',
      itemNoun: 'tiers', single: true,
      pay: { modes: ['subscription'], period: 'month' },
      items: [
        { id: 'm1', name: 'Associate', meta: 'Directory listing, CPD library', price: 1200 },
        { id: 'm2', name: 'Full member', meta: 'Everything in Associate, plus verified badge and events', price: 2900 },
        { id: 'm3', name: 'Practice', meta: 'Up to 10 seats, plus the accreditation pathway', price: 9500 },
      ],
      grants: [
        { t: 'Members area unlocked', d: 'Immediately, at the tier bought. Gating follows the tier rather than a manual list.' },
        { t: 'Renewal scheduled', d: 'It renews itself. Nobody has to remember to chase, which is where memberships usually leak.' },
        { t: 'Upgrade and cancel self-serve', d: 'Both without an email to the office, which is what stops cancellation becoming a complaint.' },
      ],
      ledger: 'Subscription SUB-4417 active. Next renewal 21 August, and the member can change tier without asking anyone.',
    },
  },

  'all-in-one-venue-platform': {
    kind: 'shop',
    shop: {
      title: 'The Long Room', kicker: 'Reservations, pre-orders and deposits',
      itemNoun: 'items',
      pay: { modes: ['deposit', 'full'], depositPct: 25 },
      items: [
        { id: 'v1', name: 'Table for 12, Saturday 20:00', meta: 'Large party, deposit required', price: 0, fixed: true },
        { id: 'v2', name: 'Set menu, per head', meta: 'Three courses', price: 4500, max: 12 },
        { id: 'v3', name: 'Wine pairing, per head', meta: 'Four glasses', price: 2800, max: 12 },
        { id: 'v4', name: 'Cake, brought in', meta: 'Plated and served', price: 1500 },
      ],
      grants: [
        { t: 'Reservation held', d: 'Against a deposit, so a twelve-cover no-show costs the party rather than the kitchen.' },
        { t: 'Pre-order to the kitchen', d: 'Covers and courses known before Saturday, so the order goes in on Thursday.' },
        { t: 'One guest record', d: 'The booking, the spend and the party size all on the same guest, across every venue you run.' },
      ],
      ledger: 'Booking LR-3390 confirmed with deposit. No widget subscription, no per-cover fee to a third party.',
    },
  },
};

// Any commerce service without a hand-built shop still gets an honest one, built from its own copy.
export function shopFor(svc) {
  if (!svc) return null;
  const hand = SHOPS[svc.slug];
  if (hand) return hand;
  const bullets = (Array.isArray(svc.bullets) ? svc.bullets.map((b) => b && b.text).filter(Boolean) : []).slice(0, 3);
  if (bullets.length < 2) return null;
  return {
    kind: 'shop',
    shop: {
      title: 'Your storefront', kicker: svc.name, itemNoun: 'items',
      pay: { modes: ['full'] },
      items: [
        { id: 'g1', name: 'Standard', meta: 'The everyday line', price: 4900 },
        { id: 'g2', name: 'Extended', meta: 'The one most people pick', price: 9900 },
      ],
      grants: bullets.map((t) => ({ t: t.split(/[,.(]/)[0].trim().slice(0, 40), d: t })),
      ledger: 'Order captured to a backend you control.',
    },
  };
}

export default SHOPS;
