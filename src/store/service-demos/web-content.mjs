// Screens for the Websites & Web Apps archetype. Pure data, so the copy is reviewable in one place and
// the screen components stay about behaviour rather than content.
//
// WHY SEVEN SCREEN KINDS. Every other category has one interaction that carries the whole pitch. This one
// does not: a marketing site, a booking flow, a dispatch board and a credential lookup behave nothing alike,
// and a single generic mock-up would sell none of them. So the archetype is a frame (browser chrome, device
// toggle, what-it-replaced strip) wrapping one of seven genuinely working screens. The visitor does the task
// the real product exists to do.
//
// HONESTY RULE: every screen does its own work in the browser with no network call, the records are invented,
// and the frame labels the whole thing a prototype. The one number that could be mistaken for a measurement
// is `target`, so it is always phrased and labelled as a build target rather than a reading.
//
// Shape: { [slug]: { kind, url, replaced, target, ...kindData } }

export const SCREENS = {
  // ── marketing pages ────────────────────────────────────────────────────────────────────────────────
  'business-website-build': {
    kind: 'page', url: 'northgate-legal.co.uk',
    replaced: 'A one-page site last touched in 2019',
    target: 'Interactive in under a second on a mid-range phone',
    page: {
      mode: 'edit',
      nav: ['Services', 'About', 'Proof', 'Contact'],
      eyebrow: 'Commercial property',
      headline: 'Deals that complete on time',
      sub: 'A commercial property team acting for developers, lenders and landlords across the North.',
      cta: 'Book a call',
      cards: [
        { t: 'Acquisitions', d: 'Site assembly through to completion.' },
        { t: 'Development finance', d: 'Security, drawdown and reporting.' },
        { t: 'Landlord and tenant', d: 'Lease renewals, breaks and disputes.' },
      ],
    },
  },

  'editable-website-cms': {
    kind: 'page', url: 'studio.northgate-legal.co.uk',
    replaced: 'A ticket to the agency, and a two-week wait',
    target: 'A wording change live in under a minute',
    page: {
      mode: 'edit', history: true,
      nav: ['Services', 'About', 'Proof', 'Contact'],
      eyebrow: 'Commercial property',
      headline: 'Deals that complete on time',
      sub: 'Edit the words on the page itself. No ticket, no developer, no waiting for a slot.',
      cta: 'Book a call',
      cards: [
        { t: 'Inline editing', d: 'Change it where you see it.' },
        { t: 'Version history', d: 'Roll back any edit, any time.' },
        { t: 'Roles', d: 'Draft, review, approve, publish.' },
      ],
    },
  },

  'campaign-landing-pages': {
    kind: 'page', url: 'go.northgate-legal.co.uk/lease-renewals',
    replaced: 'Ad spend pointed at a slow homepage',
    target: 'Live within the week, measurable from day one',
    page: {
      mode: 'variant',
      nav: [],
      eyebrow: 'Free lease review',
      headline: 'Your lease renewal, reviewed in 48 hours',
      sub: 'Send us the lease. We will tell you what to argue for, and what it is worth.',
      cta: 'Send the lease',
      cards: [
        { t: 'No obligation', d: 'A written view, not a sales call.' },
        { t: '48 hours', d: 'Turnaround, in writing.' },
        { t: 'Fixed fee', d: 'If you want us to act.' },
      ],
      variants: [
        { label: 'A', headline: 'Your lease renewal, reviewed in 48 hours', cta: 'Send the lease', rate: 2.4 },  // illustrative, see the label in web-screens.jsx
        { label: 'B', headline: 'Do not sign that renewal until you have read this', cta: 'Get the free review', rate: 4.1 },
      ],
    },
  },

  // ── portals and apps ───────────────────────────────────────────────────────────────────────────────
  'client-member-portal': {
    kind: 'dash', url: 'clients.northgate-legal.co.uk',
    replaced: '"Any update?" emails, three a week',
    target: 'The answer on screen before they think to ring',
    dash: {
      who: 'Amara Boateng', role: 'Client, Meridian Developments',
      tiles: [{ v: '2', l: 'Open matters' }, { v: '£0', l: 'Outstanding' }, { v: '14', l: 'Documents' }],
      rows: [
        { t: 'Lease renewal, Unit 4', s: 'With the landlord', when: 'Updated 2 days ago' },
        { t: 'Site acquisition, Bramley', s: 'Searches back', when: 'Updated Monday' },
        { t: 'Invoice 2026-0184', s: 'Paid', when: '14 July', ok: true },
      ],
      action: {
        label: 'Ask for an update',
        row: { t: 'Update requested', s: 'Sent to your solicitor', when: 'Just now' },
        said: 'Your solicitor has it. You will see the reply here.',
      },
    },
  },

  'rapid-mvp-app-build': {
    kind: 'dash', url: 'app.yourproduct.com',
    replaced: 'A pitch deck full of promises',
    target: 'A real URL in users’ hands within weeks',
    dash: {
      who: 'Founder view', role: 'Live product, week 6',
      // no invented traction figures here: a fabricated growth curve is not evidence of anything, and it was
      // the only thing this panel was proving. The tiles now describe the build, which is what is being sold.
      tiles: [{ v: '3', l: 'Core features' }, { v: '1', l: 'Live URL' }, { v: 'Wk 6', l: 'Since kickoff' }],
      rows: [
        { t: 'New sign-up, t.owusu@…', s: 'Completed onboarding', when: '11 minutes ago' },
        { t: 'First paid plan', s: 'Monthly, £29', when: 'Yesterday', ok: true },
        { t: 'Feedback, "needs bulk import"', s: 'Third time asked', when: 'Tuesday' },
      ],
      action: {
        label: 'Invite a tester',
        row: { t: 'Invite sent', s: 'Awaiting sign-up', when: 'Just now' },
        said: 'An invite link they can use once, tied to their email.',
      },
    },
  },

  'custom-internal-web-app': {
    kind: 'dash', url: 'ops.penrose.co.uk',
    replaced: 'A shared spreadsheet nobody dares sort',
    target: 'One record, one owner, one version',
    dash: {
      who: 'Ops board', role: 'Signed in as Danny K, Supervisor',
      tiles: [{ v: '31', l: 'Open jobs' }, { v: '4', l: 'Awaiting parts' }, { v: '0', l: 'Unassigned' }],
      rows: [
        { t: 'Job 4471, Chorlton', s: 'Parts ordered', when: 'Due Thursday' },
        { t: 'Job 4468, Salford', s: 'Signed off', when: 'Completed Monday', ok: true },
        { t: 'Job 4465, Didsbury', s: 'Waiting on access', when: 'Held 3 days' },
      ],
      action: {
        label: 'Raise a job',
        row: { t: 'Job 4472 raised', s: 'Ready to assign', when: 'Just now' },
        said: 'Logged against the site, with who raised it and when.',
      },
    },
  },

  'self-service-citizen-portal': {
    kind: 'dash', url: 'my.districtcouncil.gov',
    replaced: 'A morning in a queue, for a two-minute job',
    target: 'Usable on a modest phone over 3G',
    dash: {
      who: 'Kwabena Asante', role: 'Resident, Ward 6',
      tiles: [{ v: '1', l: 'Open request' }, { v: '2', l: 'Certificates' }, { v: '0', l: 'Owing' }],
      rows: [
        { t: 'Business permit renewal', s: 'In review', when: 'Submitted 3 days ago' },
        { t: 'Proof of residence', s: 'Ready to download', when: 'Issued 9 July', ok: true },
        { t: 'Rates statement 2026', s: 'Settled', when: 'Paid 2 April', ok: true },
      ],
      action: {
        label: 'Request a letter',
        row: { t: 'Letter requested', s: 'With the registry', when: 'Just now' },
        said: 'No queue, no form to collect. It arrives here when it is signed.',
      },
    },
  },

  // ── booking ────────────────────────────────────────────────────────────────────────────────────────
  'online-booking-system': {
    kind: 'book', url: 'book.thecuttingroom.co.uk',
    replaced: 'Six missed calls and a paper diary',
    target: 'Booked, paid and confirmed without a phone call',
    book: {
      services: [
        { n: 'Cut and finish', mins: 45, dep: 10 },
        { n: 'Colour', mins: 120, dep: 30 },
        { n: 'Consultation', mins: 15, dep: 0 },
      ],
      days: [
        { d: 'Thu 23', slots: ['09:30', '11:00', '14:15'] },
        { d: 'Fri 24', slots: ['10:00', '15:30'] },
        { d: 'Sat 25', slots: ['09:00', '12:45', '16:00'] },
      ],
    },
  },

  // ── forms ──────────────────────────────────────────────────────────────────────────────────────────
  'digital-forms-intake': {
    kind: 'form', url: 'forms.penrose.co.uk/job-sheet',
    replaced: 'A clipboard, and a photo of it in WhatsApp',
    target: 'Complete on submission, filed without re-keying',
    form: {
      title: 'Vehicle job sheet',
      site: { label: 'Site', options: ['Trafford depot', 'Salford yard', 'Client site'] },
      reg: { label: 'Vehicle registration', hint: 'Format: LT21 XKM', pattern: '^[A-Z]{2}[0-9]{2} ?[A-Z]{3}$' },
      visit: { label: 'Visit type', options: ['Routine service', 'Breakdown', 'Damage'], photosFor: 'Damage' },
      photosHint: 'Damage visits need at least one photo before the sheet can be filed.',
    },
  },

  // ── dispatch ───────────────────────────────────────────────────────────────────────────────────────
  'job-fleet-dispatch-board': {
    kind: 'board', url: 'dispatch.penrose.co.uk',
    replaced: 'A whiteboard and three WhatsApp groups',
    target: 'A reschedule in seconds, and no double-bookings',
    board: {
      jobs: [
        { id: 'j1', t: 'Boiler service, Chorlton', slot: '09:00', skill: 'Gas' },
        { id: 'j2', t: 'Fuse board, Didsbury', slot: '09:00', skill: 'Electrical' },
        { id: 'j3', t: 'Leak trace, Salford', slot: '11:30', skill: 'Gas' },
        { id: 'j4', t: 'EV charger fit, Sale', slot: '11:30', skill: 'Electrical' },
        { id: 'j5', t: 'Annual check, Urmston', slot: '14:00', skill: 'Gas' },
      ],
      crew: [
        { id: 'c1', n: 'Danny K', skills: ['Gas'] },
        { id: 'c2', n: 'Priya R', skills: ['Electrical'] },
        { id: 'c3', n: 'Marcus O', skills: ['Gas', 'Electrical'] },
      ],
    },
  },

  // ── directory ──────────────────────────────────────────────────────────────────────────────────────
  'searchable-member-directory': {
    kind: 'find', url: 'members.instituteofsurveyors.org/find',
    replaced: 'A PDF list, last updated in March',
    target: 'The right member found in two taps',
    find: {
      places: ['Accra', 'Kumasi', 'Takoradi'],
      records: [
        { n: 'Akosua Mensah', r: 'Valuation', c: 'Accra', since: 2014, v: true },
        { n: 'Kwesi Anokye', r: 'Quantity surveying', c: 'Kumasi', since: 2009, v: true },
        { n: 'Naa Adjeley Tetteh', r: 'Land surveying', c: 'Accra', since: 2019, v: true },
        { n: 'Yaw Boadu', r: 'Building surveying', c: 'Takoradi', since: 2016, v: true },
        { n: 'Efua Sarpong', r: 'Valuation', c: 'Kumasi', since: 2021, v: false },
        { n: 'Kofi Danquah', r: 'Quantity surveying', c: 'Accra', since: 2011, v: true },
        { n: 'Ama Owusu', r: 'Land surveying', c: 'Takoradi', since: 2022, v: true },
        { n: 'Selorm Agbeko', r: 'Building surveying', c: 'Accra', since: 2017, v: true },
      ],
    },
  },

  // ── verification ───────────────────────────────────────────────────────────────────────────────────
  'public-credential-verification': {
    kind: 'verify', url: 'verify.instituteofsurveyors.org',
    replaced: 'A phone call to the office, and a wait',
    target: 'Standing confirmed by a third party in seconds',
    verify: {
      placeholder: 'IOS-000000',
      samples: ['IOS-104882', 'IOS-097315'],
      records: {
        'IOS-104882': { name: 'Akosua Mensah', state: 'valid', line: 'Full member, in good standing', until: '31 December 2026', grade: 'Valuation' },
        'IOS-097315': { name: 'Kofi Danquah', state: 'suspended', line: 'Suspended pending a conduct review', until: 'Under review', grade: 'Quantity surveying' },
      },
    },
  },
};

// Any web service without a hand-built screen still gets an honest one, assembled from its own catalogue
// copy. A generic marketing page is the safe default: it is the one screen every service in this category
// could plausibly ship, and it never claims a behaviour the service does not have.
export function screenFor(svc) {
  if (!svc) return null;
  const hand = SCREENS[svc.slug];
  if (hand) return hand;
  const bullets = (Array.isArray(svc.bullets) ? svc.bullets.map((b) => b && b.text).filter(Boolean) : []).slice(0, 3);
  if (!svc.name) return null;
  return {
    kind: 'page',
    url: 'yourbusiness.co.uk',
    replaced: 'A site that could not be changed without a developer',
    target: 'Fast on a phone, editable by you',
    page: {
      mode: 'edit',
      nav: ['Services', 'About', 'Contact'],
      eyebrow: svc.category || 'Your business',
      headline: svc.name,
      sub: svc.oneLiner || '',
      cta: 'Get in touch',
      cards: bullets.map((t) => ({ t: t.split(/[,.(]/)[0].trim().slice(0, 28), d: t })),
    },
  };
}

export default SCREENS;
