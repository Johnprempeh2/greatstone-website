// Content for the Comms Channels archetype.
//
// The spine: a message leaves your building, finds people on the channel they actually use, and comes back
// with proof it landed. That last part is what separates this category from "we sent an email".
//
//   broadcast  compose once, pick who, and watch the channel cascade carry it: WhatsApp first, SMS behind
//              it, email behind that. The reach numbers are computed, not decorative (3 services)
//   thread     a conversation on a phone, and beside it the ORDER RECORD filling in as it goes. The point
//              is not the chat, it is that the chat ends up in your system (1)
//   event      RSVP, ticket, tap to check in, live headcount, and the reconciliation that used to take a
//              week (1)
//
// The chat console deliberately belongs to the AI Agents archetype. Here the phone thread is context and
// the record is the subject, which is the opposite emphasis.
//
// HONESTY RULE: nothing is sent, no number is dialled, no WhatsApp account is touched. The rosters and
// messages are invented. What is real is the arithmetic: segment counts sum, the cascade partitions the
// audience exactly, and the headcount follows the check-ins.

export const COMMS = {
  // ── broadcast ──────────────────────────────────────────────────────────────────────────────────────
  'multi-channel-broadcast-messaging': {
    kind: 'broadcast',
    broadcast: {
      title: 'Institute of Surveyors', context: 'AGM notice, 14 November',
      drafts: [
        {
          id: 'd1', label: 'AGM notice',
          body: 'The AGM is on 14 November at 10:00, Accra International Conference Centre. Registration closes on the 7th. Reply YES to reserve a seat.',
          replies: [
            { who: 'Kwesi Anokye, Ashanti', t: 'YES, and I will bring two colleagues.' },
            { who: 'Ama Owusu, Diaspora', t: 'Is there a dial-in for members abroad?' },
            { who: 'Yaw Boadu, Northern', t: 'YES' },
          ],
        },
        {
          id: 'd2', label: 'Dues reminder',
          body: 'Your 2026 dues are outstanding. Members in arrears cannot vote at the AGM. Pay in two taps: [link]',
          replies: [
            { who: 'Efua Sarpong, Ashanti', t: 'Paid just now, thank you for the link.' },
            { who: 'Selorm Agbeko, Accra', t: 'I paid in March. Can you check?' },
            { who: 'Kofi Danquah, Accra', t: 'Can I pay in two instalments?' },
          ],
        },
      ],
      segments: [
        { id: 's1', label: 'Greater Accra', n: 1840 },
        { id: 's2', label: 'Ashanti', n: 960 },
        { id: 's3', label: 'Northern', n: 420 },
        { id: 's4', label: 'Diaspora', n: 280 },
      ],
      // The cascade: each tier takes its share of whoever is left, and the last channel catches the rest.
      cascade: [
        { id: 'whatsapp', label: 'WhatsApp', share: 0.82, note: 'Read on the phone they already have open' },
        { id: 'sms', label: 'SMS', share: 0.62, note: 'For the numbers with no WhatsApp' },
        { id: 'email', label: 'Email', share: 1, note: 'Whoever is left, and the record copy' },
      ],
      readRate: 0.79,
      repliesNote: 'Replies route to staff instead of vanishing into a number nobody owns. The dial-in question is now a task, not a missed message.',
      foot: 'One compose, three channels, and a notice that no longer misses half the membership.',
    },
  },

  'automated-email-newsletters': {
    kind: 'broadcast',
    broadcast: {
      title: 'Northgate Legal', context: 'Monthly client newsletter',
      drafts: [
        { id: 'd1', label: 'Lease renewals', body: 'Three things changed in commercial lease renewals this quarter, and one of them is worth acting on before October.' },
        { id: 'd2', label: 'Case note', body: 'A tenant won a break-clause dispute on a technicality most landlords still get wrong. Here is the wording to check.' },
      ],
      segments: [
        { id: 's1', label: 'Active clients', n: 2400 },
        { id: 's2', label: 'Past clients', n: 860 },
        { id: 's3', label: 'Lapsed, 12 months', n: 540 },
      ],
      cascade: [{ id: 'email', label: 'Email', share: 1, note: 'Branded, and it renders in Outlook' }],
      engagement: { open: 0.41, click: 0.12, bounce: 0.008 },
      foot: 'Drafted in your voice from a short brief, approved by a person, and sent on a cadence that survives a busy month.',
    },
  },

  'two-way-field-beneficiary-sms': {
    kind: 'broadcast',
    broadcast: {
      title: 'Tamale Girls’ Education Trust', context: 'Term-start check-in',
      drafts: [
        {
          id: 'd1', label: 'Term check-in',
          body: 'Term starts Monday. Reply 1 if she will attend, 2 if there is a problem we can help with. No cost to reply.',
          replies: [
            { who: 'Family 0142, Tamale', t: '2 — the uniform did not fit after the holidays' },
            { who: 'Family 0311, Kumasi', t: '1' },
            { who: 'Family 0288, Tamale', t: '1, and thank you for the reminder' },
          ],
        },
        {
          id: 'd2', label: 'Crew assignment',
          body: 'You are at the Tamale site on Tuesday, 07:30. Reply OK to confirm. Reply NO and we will reassign.',
          replies: [
            { who: 'Crew, D. Mensah', t: 'OK' },
            { who: 'Crew, A. Boateng', t: 'NO — I am on the Kumasi job until Wednesday' },
            { who: 'Crew, S. Adjei', t: 'OK, will bring the second van' },
          ],
        },
      ],
      segments: [
        { id: 's1', label: 'Families, Tamale', n: 320 },
        { id: 's2', label: 'Families, Kumasi', n: 210 },
        { id: 's3', label: 'Field crews', n: 68 },
      ],
      cascade: [
        { id: 'whatsapp', label: 'WhatsApp', share: 0.71, note: 'Free to them, which matters here' },
        { id: 'sms', label: 'SMS', share: 1, note: 'Reaches a basic handset with no data' },
      ],
      readRate: 0.84,
      repliesNote: 'Every reply lands on the record with a timestamp, so the uniform problem becomes a case with an owner rather than a message somebody remembers.',
      foot: 'Two-way, at a scale a team could never reach by hand, and consent-respecting throughout.',
    },
  },

  // ── thread ─────────────────────────────────────────────────────────────────────────────────────────
  'whatsapp-ordering-channel': {
    kind: 'thread',
    thread: {
      title: 'Ashanti Home', number: '+233 20 000 0000', who: 'Kofi, Adum Hardware',
      hint: 'Step through the conversation. Watch the order build itself on the right.',
      turns: [
        { from: 'them', t: 'Morning. Do you have the brass lamps in stock?', sets: { customer: 'Adum Hardware (Kofi)' } },
        { from: 'us', t: 'Morning Kofi. Yes, 14 in stock. Same price as last time, £154 each.', sets: { status: 'Enquiry' } },
        { from: 'them', t: 'Take 6. And 2 of the carved stools, the large ones.', sets: { items: ['Brass lamp × 6', 'Carved stool, large × 2'] } },
        // 6 × £154 + 2 × £129 = £1,182. Priced off the same Ashanti Home catalogue the Commerce demo uses,
        // so the two prototypes do not quote different figures for the same fictional shop.
        { from: 'us', t: 'Six lamps and two large stools. That is £1,182. Deliver to Adum as usual?', sets: { total: '£1,182.00' } },
        { from: 'them', t: 'Yes, but Thursday not Tuesday. And can you invoice the Kumasi branch this time?', sets: { delivery: 'Thursday, Adum', flag: 'Invoice to a different branch is non-standard' } },
        { from: 'us', t: 'Thursday is fine. Changing the invoicing branch needs Ama to confirm, so I am passing that part to her now. The order itself is placed.', sets: { status: 'Placed, one item with a person' } },
      ],
      record: { label: 'Order record', ref: 'ORD-4471' },
      after: 'It was already going to happen over chat. The only question was whether it ended up in your system or on somebody’s phone.',
    },
  },

  // ── event ──────────────────────────────────────────────────────────────────────────────────────────
  'event-rsvp-check-in-system': {
    kind: 'event',
    event: {
      title: 'Annual Conference', context: 'Accra, 14 November',
      hint: 'Scan the next ticket, or check somebody in by hand. The headcount follows, and so does the reconciliation.',
      attendees: [
        { id: 'a1', name: 'Akosua Mensah', meta: 'Member, paid £260', paid: true },
        { id: 'a2', name: 'Kwesi Anokye', meta: 'Member, paid £260', paid: true },
        { id: 'a3', name: 'Naa Adjeley Tetteh', meta: 'Guest, paid £320', paid: true },
        { id: 'a4', name: 'Yaw Boadu', meta: 'Member, RSVP only, unpaid', paid: false },
        { id: 'a5', name: 'Efua Sarpong', meta: 'Member, paid £260, paper ticket', paid: true, paper: true },
        { id: 'a6', name: 'Kofi Danquah', meta: 'Member, paid £260', paid: true },
      ],
      foot: 'The organiser view is live while the doors are open, and the reconciliation is done before you leave the hall.',
    },
  },
};

// Any comms service without a hand-built panel gets a broadcast, built from its own copy: everything in
// this category is ultimately one message reaching a list.
export function commsFor(svc) {
  if (!svc) return null;
  const hand = COMMS[svc.slug];
  if (hand) return hand;
  const bullets = (Array.isArray(svc.bullets) ? svc.bullets.map((b) => b && b.text).filter(Boolean) : []).slice(0, 2);
  if (!bullets.length) return null;
  return {
    kind: 'broadcast',
    broadcast: {
      title: 'Your channel', context: svc.name,
      drafts: bullets.map((t, i) => ({ id: 'd' + i, label: 'Draft ' + (i + 1), body: t })),
      segments: [{ id: 's1', label: 'Everyone', n: 1200 }, { id: 's2', label: 'Recent only', n: 380 }],
      cascade: [
        { id: 'whatsapp', label: 'WhatsApp', share: 0.8, note: 'Where people already are' },
        { id: 'email', label: 'Email', share: 1, note: 'Whoever is left' },
      ],
      readRate: 0.76,
      foot: 'Sent on the channel they read, with proof it landed.',
    },
  };
}

export default COMMS;
