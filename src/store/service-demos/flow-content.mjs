// Flows for the Automation & Integration archetype. Pure data, so the copy is reviewable in one place
// and the runner component stays about behaviour rather than content.
//
// HONESTY RULE: same as the agent scripts. Every step must be something the automation genuinely does, and
// the numbers must be defensible as a typical case rather than a best case. The UI labels them as a sample.
//
// Shape: { [slug]: { trigger, steps:[{ label, detail, tool }], outcome, manualMin, autoSec, runsPerMonth } }
//   trigger      what starts the run without anyone pressing anything
//   steps        the work itself, 3 or 4 beats, each with a concrete detail line
//   outcome      what the human sees at the end
//   manualMin    how long this takes a person, per run
//   autoSec      how long the automation takes, per run
//   runsPerMonth typical volume, used for the hours-a-month figure

export const FLOWS = {
  'workflow-process-automation': {
    trigger: { label: 'Enquiry lands', detail: 'New enquiry hits the shared inbox at 21:14' },
    steps: [
      { label: 'Read + classify', detail: 'Type: quote request. Urgency: standard.', tool: 'AI' },
      { label: 'Pull the data', detail: 'Matched to an existing account, 3 past orders', tool: 'CRM' },
      { label: 'Draft the quote', detail: 'Priced from the rate card, 4 line items', tool: 'Quotes' },
      { label: 'Route for approval', detail: 'Sent to the owner, ready to send in one tap', tool: 'Email' },
    ],
    outcome: { label: 'Quote waiting, approved in the morning', detail: 'The enquiry that arrived at 21:14 was answered by 21:15.' },
    manualMin: 22, autoSec: 9, runsPerMonth: 90,
  },

  'app-tool-integration': {
    trigger: { label: 'Record changes', detail: 'A deal moves to Won in the CRM' },
    steps: [
      { label: 'Detect the change', detail: 'Webhook fires within a second', tool: 'CRM' },
      { label: 'Map the fields', detail: 'Company, value, owner, close date mapped', tool: 'Sync' },
      { label: 'Write everywhere', detail: 'Accounting, project tool and the sheet updated', tool: 'M365' },
      { label: 'Confirm', detail: 'One message to the channel, no re-keying', tool: 'Teams' },
    ],
    outcome: { label: 'One entry, five systems correct', detail: 'The number typed once is now right everywhere it appears.' },
    manualMin: 12, autoSec: 4, runsPerMonth: 160,
  },

  'automated-onboarding-workflow': {
    trigger: { label: 'New client signs', detail: 'Engagement accepted, onboarding opens' },
    steps: [
      { label: 'Send the portal', detail: 'Branded intake link issued automatically', tool: 'Portal' },
      { label: 'Collect + e-sign', detail: '6 documents uploaded, agreement signed', tool: 'Docs' },
      { label: 'Check the pack', detail: 'AI reads it: 1 missing proof of address flagged', tool: 'AI' },
      { label: 'File + notify', detail: 'Filed to the matter, team told what is outstanding', tool: 'Drive' },
    ],
    outcome: { label: 'Onboarded with the paper trail built in', detail: 'Nothing chased by hand, nothing filed in the wrong place.' },
    manualMin: 46, autoSec: 15, runsPerMonth: 24,
  },

  'automated-invoicing-chasing': {
    trigger: { label: 'Invoice falls due', detail: 'Payment terms reach day 30' },
    steps: [
      { label: 'Check the ledger', detail: '3 invoices unpaid, 1 paid this morning', tool: 'Accounts' },
      { label: 'Draft the nudge', detail: 'Polite first reminder, in your tone', tool: 'AI' },
      { label: 'Send on channel', detail: 'Email plus WhatsApp where the client prefers it', tool: 'Comms' },
      { label: 'Escalate on rules', detail: 'Day 45 goes to a named person, not a robot', tool: 'Rules' },
    ],
    outcome: { label: 'Chased without the awkwardness', detail: 'The polite chase happens on time, every time, without you doing it.' },
    manualMin: 18, autoSec: 6, runsPerMonth: 110,
  },

  'automated-appointment-reminders': {
    trigger: { label: '24 hours before', detail: 'Appointment tomorrow at 10:30' },
    steps: [
      { label: 'Read the diary', detail: '14 appointments tomorrow, 2 unconfirmed', tool: 'Calendar' },
      { label: 'Send reminders', detail: 'WhatsApp first, email as the fallback', tool: 'Comms' },
      { label: 'Take the reply', detail: 'One confirm, one reschedule to Thursday', tool: 'Booking' },
      { label: 'Refill the gap', detail: 'Cancelled slot offered to the waiting list', tool: 'Rules' },
    ],
    outcome: { label: 'A fuller diary, no phone tag', detail: 'The empty slot was filled before anyone noticed it was empty.' },
    manualMin: 14, autoSec: 5, runsPerMonth: 260,
  },

  'automated-membership-renewals': {
    trigger: { label: 'Membership nears expiry', detail: '30 days before the renewal date' },
    steps: [
      { label: 'Find who is due', detail: '48 members expiring this month', tool: 'Members' },
      { label: 'Send the sequence', detail: 'Timed nudges on email, WhatsApp and SMS', tool: 'Comms' },
      { label: 'Take payment', detail: 'One-click Stripe link, no login gymnastics', tool: 'Stripe' },
      { label: 'Update + receipt', detail: 'Record renewed, digital receipt issued', tool: 'Members' },
    ],
    outcome: { label: 'Members renewed before they drift', detail: 'The lapse you would only have spotted in next year\'s numbers.' },
    manualMin: 9, autoSec: 4, runsPerMonth: 190,
  },

  'customer-order-status-tracking': {
    trigger: { label: 'Job status moves', detail: 'Engineer marks the job as on the way' },
    steps: [
      { label: 'Read the update', detail: 'Status changed in the job system', tool: 'Jobs' },
      { label: 'Update the page', detail: 'Customer tracking link now shows on the way', tool: 'Portal' },
      { label: 'Message the customer', detail: 'Arriving in about 40 minutes', tool: 'Comms' },
      { label: 'Flag delays', detail: 'A running-late alert goes out on its own', tool: 'Rules' },
    ],
    outcome: { label: 'They stop ringing to ask', detail: 'The where-is-it call never gets made, because they can see it.' },
    manualMin: 6, autoSec: 3, runsPerMonth: 420,
  },

  'automated-inbox-request-triage': {
    trigger: { label: 'Message arrives', detail: '38 items overnight across inbox and WhatsApp' },
    steps: [
      { label: 'Classify each', detail: 'Type, urgency and matter tagged on all 38', tool: 'AI' },
      { label: 'Answer the easy ones', detail: '19 routine replies drafted, ready to send', tool: 'AI' },
      { label: 'Route the rest', detail: '14 to owners, 5 flagged urgent with SLA running', tool: 'Rules' },
      { label: 'Start the clock', detail: 'Every routed item has a timer and an owner', tool: 'SLA' },
    ],
    outcome: { label: 'An inbox already triaged by 08:00', detail: 'The morning starts at the 5 that matter, not the 38 that arrived.' },
    manualMin: 55, autoSec: 20, runsPerMonth: 22,
  },

  'abandoned-cart-win-back-emails': {
    trigger: { label: 'Cart abandoned', detail: 'Basket left at checkout 1 hour ago' },
    steps: [
      { label: 'Wait the right beat', detail: 'One hour, not one minute. Nobody likes a pounce.', tool: 'Rules' },
      { label: 'Compose', detail: 'The exact items, with the size they chose', tool: 'AI' },
      { label: 'Send where they are', detail: 'Email, or WhatsApp for the mobile-first buyer', tool: 'Comms' },
      { label: 'Follow the journey', detail: 'Post-purchase and replenishment queued next', tool: 'Lifecycle' },
    ],
    outcome: { label: 'Recovered without a discount', detail: 'A reminder was enough. The margin stayed where it was.' },
    manualMin: 0, autoSec: 3, runsPerMonth: 310, alwaysOn: true,
  },

  'automated-stock-alerts': {
    trigger: { label: 'Stock crosses a threshold', detail: 'Line drops below the reorder point' },
    steps: [
      { label: 'Watch the levels', detail: 'Checked continuously against your rules', tool: 'Stock' },
      { label: 'Work out the need', detail: 'Cover for 11 days at current run rate', tool: 'Rules' },
      { label: 'Tell the right person', detail: 'Buyer alerted on WhatsApp, not a shared inbox', tool: 'Comms' },
      { label: 'Draft the PO', detail: 'Reorder ready for approval with the usual supplier', tool: 'POs' },
    ],
    outcome: { label: 'You never sell what you cannot ship', detail: 'The stockout that would have been found by a customer.' },
    manualMin: 8, autoSec: 3, runsPerMonth: 140,
  },

  'automated-review-requests': {
    trigger: { label: 'Job completes', detail: 'Work signed off two hours ago' },
    steps: [
      { label: 'Wait for the moment', detail: 'Same day, while it is still fresh', tool: 'Rules' },
      { label: 'Ask privately first', detail: 'One question: how did we do?', tool: 'Comms' },
      { label: 'Route on the answer', detail: 'Happy to Google, unhappy straight to you', tool: 'Rules' },
      { label: 'Log it', detail: 'Response recorded against the job', tool: 'Jobs' },
    ],
    outcome: { label: 'More reviews, and no public surprises', detail: 'The unhappy customer reached you before they reached Google.' },
    manualMin: 5, autoSec: 2, runsPerMonth: 180,
  },

  'case-complaints-tracking-system': {
    trigger: { label: 'Case logged', detail: 'Raised on WhatsApp at 19:40' },
    steps: [
      { label: 'Issue a reference', detail: 'CR-2026-0481 given instantly', tool: 'Cases' },
      { label: 'Classify + assign', detail: 'Category set, routed to the right officer', tool: 'AI' },
      { label: 'Acknowledge', detail: 'Person told the reference and what happens next', tool: 'Comms' },
      { label: 'Track to close', detail: 'Status visible to them: submitted, in review, resolved', tool: 'Portal' },
    ],
    outcome: { label: 'Nothing falls between the cracks', detail: 'Every request has a number, an owner and a visible state.' },
    manualMin: 11, autoSec: 4, runsPerMonth: 130,
  },

  'supplier-purchase-order-portal': {
    trigger: { label: 'PO issued', detail: 'Purchase order raised for a supplier' },
    steps: [
      { label: 'Publish to the portal', detail: 'Supplier sees it without an email hunt', tool: 'Portal' },
      { label: 'Supplier confirms', detail: 'Quantities and a delivery date of the 14th', tool: 'Supplier' },
      { label: 'Update the status', detail: 'Confirmed, and visible to everyone who needs it', tool: 'POs' },
      { label: 'Chase the overdue', detail: 'Day 15 with no delivery raises a flag on its own', tool: 'Rules' },
    ],
    outcome: { label: 'Every open PO at a glance', detail: 'No more digging through a buyer\'s inbox to find a date.' },
    manualMin: 16, autoSec: 6, runsPerMonth: 70,
  },
};

// Any automation service without a hand-written flow still gets an honest one built from its own bullets.
export function flowFor(svc) {
  if (!svc) return null;
  const hand = FLOWS[svc.slug];
  if (hand) return hand;
  const bullets = (Array.isArray(svc.bullets) ? svc.bullets.map((b) => b && b.text).filter(Boolean) : []).slice(0, 4);
  if (bullets.length < 2) return null;
  return {
    trigger: { label: 'Trigger fires', detail: svc.oneLiner || 'The process starts on its own.' },
    steps: bullets.map((t, i) => ({ label: 'Step ' + (i + 1), detail: t, tool: 'Auto' })),
    outcome: { label: 'Done, without anyone starting it', detail: svc.outcome || 'The work completes on its own.' },
    manualMin: 15, autoSec: 6, runsPerMonth: 100,
  };
}

// Hours a month handed back. Deliberately conservative: it counts only the manual minutes replaced.
export function hoursSaved(flow) {
  if (!flow) return 0;
  return Math.round(((flow.manualMin || 0) * (flow.runsPerMonth || 0)) / 60);
}

export default FLOWS;
