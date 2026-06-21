// Dev-only: seed a login-able DEMO CLIENT so the #org organization dashboard + DX engagement timeline
// can be experienced end-to-end. Creates a Supabase auth user per member (email_confirm, password 'stone'
// — same demo convention as seed-demo-staff.mjs; NOT John's account), the company, a partner tier, a full
// engagement journey, two orders and a quote. Idempotent: demo rows are tagged metadata.demo and replaced.
//   Run:  node --env-file=.env scripts/seed-demo-client.mjs
import { createClient } from '@supabase/supabase-js';

const URL = process.env.VITE_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = '11111111-1111-4111-8111-111111111111';
if (!URL || !SERVICE) { console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const a = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const PW = 'stone';

async function findAuthUser(email) {
  for (let page = 1; page <= 6; page++) {
    const { data, error } = await a.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = (data.users || []).find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (!data.users || data.users.length < 200) break;
  }
  return null;
}
async function ensureAuthUser(email, name) {
  const existing = await findAuthUser(email);
  if (existing) { await a.auth.admin.updateUserById(existing.id, { password: PW, email_confirm: true, user_metadata: { full_name: name } }); return existing.id; }
  const { data, error } = await a.auth.admin.createUser({ email, password: PW, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw new Error(`auth create ${email}: ${error.message}`);
  return data.user.id;
}

// 1) Partner tier ---------------------------------------------------------------------------------------
async function ensureTier(slug, name, rank, description) {
  const { data: existing } = await a.from('customer_tiers').select('id').eq('org_id', ORG_ID).eq('slug', slug).maybeSingle();
  if (existing) { await a.from('customer_tiers').update({ name, rank, description }).eq('id', existing.id); return existing.id; }
  const { data, error } = await a.from('customer_tiers').insert({ org_id: ORG_ID, slug, name, rank, description }).select('id').single();
  if (error) throw new Error(`tier ${slug}: ${error.message}`); return data.id;
}

// 2) Company --------------------------------------------------------------------------------------------
async function ensureCustomer(slug, name, domain, tier_id) {
  const { data: existing } = await a.from('customers').select('id').eq('org_id', ORG_ID).eq('slug', slug).maybeSingle();
  const fields = { name, domain, tier_id, notes: 'Greatstone digital-transformation engagement (demo).', metadata: { demo: true } };
  if (existing) { await a.from('customers').update(fields).eq('id', existing.id); return existing.id; }
  const { data, error } = await a.from('customers').insert({ org_id: ORG_ID, slug, ...fields }).select('id').single();
  if (error) throw new Error(`customer ${slug}: ${error.message}`); return data.id;
}

// 3) Member (customer_user + linked auth) ---------------------------------------------------------------
async function ensureMember(customer_id, email, full_name, { is_primary = false, role = 'member', phone = null } = {}) {
  const auth_subject = await ensureAuthUser(email, full_name);
  const { data: existing } = await a.from('customer_users').select('id').eq('org_id', ORG_ID).eq('customer_id', customer_id).eq('email', email).maybeSingle();
  const fields = { full_name, phone, is_primary, role, auth_subject };
  if (existing) { await a.from('customer_users').update(fields).eq('id', existing.id); return existing.id; }
  const { data, error } = await a.from('customer_users').insert({ org_id: ORG_ID, customer_id, email, ...fields }).select('id').single();
  if (error) throw new Error(`member ${email}: ${error.message}`); return data.id;
}

const recapHtml = (lead, points, decisions, next) => `
  <p class="dx-lead">${lead}</p>
  <h4>Where we got to</h4>
  <ul>${points.map((p) => `<li>${p}</li>`).join('')}</ul>
  <h4>Decisions</h4>
  <ul>${decisions.map((d) => `<li>${d}</li>`).join('')}</ul>
  <h4>Next steps</h4>
  <ul>${next.map((n) => `<li>${n}</li>`).join('')}</ul>`;

async function run() {
  const tier = await ensureTier('partner', 'Partner', 20, 'Strategic digital-transformation partner pricing.');
  const cust = await ensureCustomer('ethical-quest', 'Ethical Quest', 'ethicalquest.com', tier);
  const admin = await ensureMember(cust, 'demo-client@greatstone.dev', 'Naa Korkoi Quaynor', { is_primary: true, role: 'admin', phone: '+233 20 000 0000' });
  const member = await ensureMember(cust, 'demo-member@greatstone.dev', 'Kojo Mensah', { role: 'member' });
  console.log(`company Ethical Quest = ${cust}\n  admin  = ${admin} (demo-client@greatstone.dev)\n  member = ${member} (demo-member@greatstone.dev)`);

  // 4) Engagement journey ------------------------------------------------------------------------------
  await a.from('engagements').delete().eq('customer_id', cust).contains('metadata', { demo: true });
  // every row must carry the same NOT NULL keys — a Supabase array insert unions keys and fills gaps with null.
  const E = (o) => ({ org_id: ORG_ID, customer_id: cust, status: 'shared', metadata: { demo: true }, attendees: [], tags: [], pinned: false, owner_name: null, phase: null, summary: null, body_html: null, external_url: null, ...o });
  const journey = [
    E({ kind: 'kickoff', occurred_on: '2026-02-10', phase: 'Discovery', pinned: true, owner_name: 'John Prempeh',
        title: 'Kickoff — mapping the climb', summary: 'North star agreed, eight-pillar baseline set, discovery scope locked.',
        attendees: ['Naa Korkoi Quaynor', 'Ben Mensah', 'John Prempeh'],
        body_html: recapHtml('We opened the engagement by agreeing what summit we are climbing toward and how we will measure the ascent.',
          ['Aligned on the north-star outcome: a single, owned digital platform.', 'Walked the eight-pillar method and where Ethical Quest sits today.', 'Agreed a four-week discovery to set the maturity baseline.'],
          ['Greatstone leads discovery; Ethical Quest nominates pillar owners.', 'Fortnightly recaps land here in your DX timeline.'],
          ['Schedule discovery workshop 1 (current-state audit).', 'Share access to current systems for the audit.']) }),
    E({ kind: 'recap', occurred_on: '2026-02-24', phase: 'Discovery', owner_name: 'John Prempeh',
        title: 'Discovery workshop 1 — current-state audit', summary: 'Walked the current stack and surfaced the top friction points across sales and ops.',
        attendees: ['Naa Korkoi Quaynor', 'Kojo Mensah', 'John Prempeh'],
        body_html: recapHtml('A working session mapping the present-day stack and the friction it creates.',
          ['Catalogue + pricing live in spreadsheets; no single source of truth.', 'Quote-to-order is manual and slow.', 'No customer self-serve; every order is an email thread.'],
          ['Prioritise a unified catalogue + self-serve accounts in horizon 1.'],
          ['Greatstone drafts the maturity report and 3-horizon roadmap.']) }),
    E({ kind: 'milestone', occurred_on: '2026-03-09', phase: 'Discovery', pinned: true,
        title: 'Discovery complete — maturity baseline set', summary: 'Pebble Plateau → first ascent. Eight-pillar scorecard delivered.',
        owner_name: 'John Prempeh', attendees: ['Naa Korkoi Quaynor', 'Ben Mensah'] }),
    E({ kind: 'deliverable', occurred_on: '2026-03-23', phase: 'Discovery', owner_name: 'John Prempeh',
        title: 'Digital maturity report + roadmap', summary: 'Your DXP report and prioritised three-horizon roadmap.',
        external_url: 'https://greatstone-home.netlify.app/', tags: ['report', 'roadmap'] }),
    E({ kind: 'recap', occurred_on: '2026-04-13', phase: 'Build', owner_name: 'John Prempeh',
        title: 'Build sprint review 1', summary: 'Shipped the new catalogue + pricing engine to staging.',
        attendees: ['Kojo Mensah', 'John Prempeh'],
        body_html: recapHtml('First build sprint reviewed — the foundations of the new platform are standing.',
          ['Unified catalogue of 159 products imported and live on staging.', 'Pricing engine with tier + bulk discounts working.', 'Storefront browse + product pages rendering.'],
          ['Proceed to accounts + checkout in sprint 2.'],
          ['Greatstone wires customer accounts and Stripe checkout.']) }),
    E({ kind: 'deliverable', occurred_on: '2026-05-04', phase: 'Build', owner_name: 'John Prempeh',
        title: 'Commerce platform — staging live', summary: 'Storefront, accounts and checkout on the interim platform. Open it to browse the live catalogue.',
        external_url: 'https://greatstone-catalogue.netlify.app/products.html', tags: ['platform', 'staging'] }),
    E({ kind: 'review', occurred_on: '2026-05-25', phase: 'Adoption', owner_name: 'John Prempeh',
        title: 'Monthly review — adoption & metrics', summary: 'Reviewed early adoption signals and agreed the launch checklist.',
        attendees: ['Naa Korkoi Quaynor', 'Ben Mensah', 'John Prempeh'],
        body_html: recapHtml('A monthly checkpoint on momentum and what is left before launch.',
          ['Staff trained on the new catalogue admin.', 'Early self-serve orders flowing through on staging.'],
          ['Hold production launch until payments + emails are verified end-to-end.'],
          ['Complete the go-live runbook; book the launch.']) }),
    E({ kind: 'recap', occurred_on: '2026-06-15', phase: 'Adoption', pinned: true, owner_name: 'John Prempeh',
        title: 'Go-live readiness', summary: 'Final pre-launch walkthrough; payments and emails verified.',
        attendees: ['Naa Korkoi Quaynor', 'Kojo Mensah', 'John Prempeh'],
        body_html: recapHtml('The last walkthrough before flipping the switch.',
          ['Checkout, webhooks and order emails verified in test.', 'Account portal + order history confirmed.'],
          ['Green-light production launch for end of June.'],
          ['Greatstone schedules the launch and the Q3 review.']) }),
    // Upcoming (future-dated → surfaced under "What's next")
    E({ kind: 'milestone', occurred_on: '2026-06-30', phase: 'Adoption', title: 'Production launch',
        summary: 'Target launch date for the new platform.', owner_name: 'John Prempeh' }),
    E({ kind: 'review', occurred_on: '2026-07-06', phase: 'Review', title: 'Quarterly business review (Q3)',
        summary: 'Outcomes vs the roadmap and next-horizon planning.', owner_name: 'John Prempeh',
        attendees: ['Naa Korkoi Quaynor', 'Ben Mensah', 'John Prempeh'] }),
  ];
  const { error: engErr } = await a.from('engagements').insert(journey);
  if (engErr) throw new Error(`engagements: ${engErr.message}`);
  console.log(`engagements seeded: ${journey.length}`);

  // 5) Orders (so the company spend rollup is real) ----------------------------------------------------
  await a.from('orders').delete().eq('customer_id', cust).like('reference', 'GS-DEMO-%');
  const placeOrder = async (ref, status, placed_at, items) => {
    const subtotal = items.reduce((s, it) => s + it.line_total_minor, 0);
    const total = Math.round(subtotal * 1.2); // +20% VAT
    const { data: ord, error } = await a.from('orders').insert({
      org_id: ORG_ID, customer_id: cust, customer_user_id: admin, customer_email: 'demo-client@greatstone.dev',
      reference: ref, status, currency: 'GBP', subtotal_minor: subtotal, total_minor: total, placed_at,
    }).select('id').single();
    if (error) throw new Error(`order ${ref}: ${error.message}`);
    const rows = items.map((it) => ({ org_id: ORG_ID, order_id: ord.id, offering_name: it.offering_name, variant_name: it.variant_name, qty: it.qty, unit_price_minor: it.unit_price_minor, line_total_minor: it.line_total_minor, currency: 'GBP' }));
    const { error: ie } = await a.from('order_items').insert(rows);
    if (ie) throw new Error(`order_items ${ref}: ${ie.message}`);
  };
  await placeOrder('GS-DEMO-0001', 'fulfilled', '2026-04-02T10:00:00Z', [
    { offering_name: 'Bedrock Platform', variant_name: 'Site licence', qty: 1, unit_price_minor: 1200000, line_total_minor: 1200000 },
  ]);
  await placeOrder('GS-DEMO-0002', 'confirmed', '2026-05-20T14:30:00Z', [
    { offering_name: 'Mortar Connect', variant_name: 'Annual', qty: 2, unit_price_minor: 240000, line_total_minor: 480000 },
  ]);
  console.log('orders seeded: 2');

  // 6) One open quote ----------------------------------------------------------------------------------
  await a.from('quotes').delete().eq('customer_id', cust).contains('metadata', { demo: true });
  const { error: qe } = await a.from('quotes').insert({
    org_id: ORG_ID, customer_id: cust, customer_user_id: admin, reference: 'Q-2026-000042', status: 'quoted',
    currency: 'GBP', indicative_total_minor: 900000, quoted_total_minor: 1080000,
    valid_until: '2026-07-31', metadata: { demo: true },
  });
  if (qe) console.log(`quote (non-fatal): ${qe.message}`); else console.log('quote seeded: 1');

  console.log('\n✅ done. Sign in at #account as:');
  console.log('   demo-client@greatstone.dev / stone   (company admin — Ethical Quest)');
  console.log('   demo-member@greatstone.dev / stone   (member)');
}
run().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
