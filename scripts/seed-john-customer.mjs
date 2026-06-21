// One-off: provision mr.jprempeh@gmail.com as a CUSTOMER (its own company + a DX journey) so John can
// see the #org organization dashboard under his own login. Temp password 'stone' — change it in Security.
// NOT a staff account (staff = john@greatstonesoftware.co.uk), so it's a valid customer. Idempotent.
//   Run:  node --env-file=.env scripts/seed-john-customer.mjs
import { createClient } from '@supabase/supabase-js';
const URL = process.env.VITE_SUPABASE_URL, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG = '11111111-1111-4111-8111-111111111111';
if (!URL || !SERVICE) { console.error('missing env'); process.exit(1); }
const a = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const EMAIL = 'mr.jprempeh@gmail.com', PW = 'greatstone'; // >=6 chars (Supabase min); temp, change in Security

async function findAuth(email) {
  for (let p = 1; p <= 8; p++) {
    const { data, error } = await a.auth.admin.listUsers({ page: p, perPage: 200 });
    if (error) throw error;
    const hit = (data.users || []).find(u => (u.email || '').toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (!data.users || data.users.length < 200) break;
  }
  return null;
}

const recap = (lead, points, next) => `<p class="dx-lead">${lead}</p><h4>Highlights</h4><ul>${points.map(p => `<li>${p}</li>`).join('')}</ul><h4>Next steps</h4><ul>${next.map(n => `<li>${n}</li>`).join('')}</ul>`;

async function run() {
  // guard: never provision a staff email as a customer
  const { data: staff } = await a.from('users').select('id').eq('email', EMAIL).maybeSingle();
  if (staff) { console.error(`${EMAIL} is a STAFF account — refusing to make it a customer.`); process.exit(1); }

  let authId = await findAuth(EMAIL);
  if (authId) { await a.auth.admin.updateUserById(authId, { password: PW, email_confirm: true }); console.log('auth: reused ' + EMAIL); }
  else { const { data, error } = await a.auth.admin.createUser({ email: EMAIL, password: PW, email_confirm: true, user_metadata: { full_name: 'John Prempeh' } }); if (error) throw error; authId = data.user.id; console.log('auth: created ' + EMAIL); }

  // tier
  let { data: tier } = await a.from('customer_tiers').select('id').eq('org_id', ORG).eq('slug', 'partner').maybeSingle();
  const tierId = tier?.id || null;

  // company
  const slug = 'prempeh-digital';
  let { data: cust } = await a.from('customers').select('id').eq('org_id', ORG).eq('slug', slug).maybeSingle();
  const cfields = { name: 'Prempeh Digital', domain: 'prempehdigital.com', tier_id: tierId, notes: 'Founder preview account.', metadata: { demo: true } };
  if (cust) { await a.from('customers').update(cfields).eq('id', cust.id); }
  else { const r = await a.from('customers').insert({ org_id: ORG, slug, ...cfields }).select('id').single(); if (r.error) throw r.error; cust = r.data; }
  const cid = cust.id;

  // primary contact (admin) = John
  let { data: cu } = await a.from('customer_users').select('id').eq('org_id', ORG).eq('customer_id', cid).eq('email', EMAIL).maybeSingle();
  const ufields = { full_name: 'John Prempeh', is_primary: true, role: 'admin', auth_subject: authId };
  if (cu) { await a.from('customer_users').update(ufields).eq('id', cu.id); }
  else { const r = await a.from('customer_users').insert({ org_id: ORG, customer_id: cid, email: EMAIL, ...ufields }).select('id').single(); if (r.error) throw r.error; cu = r.data; }
  const cuid = cu.id;
  console.log(`company Prempeh Digital = ${cid}, admin = ${cuid}`);

  // journey
  await a.from('engagements').delete().eq('customer_id', cid).contains('metadata', { demo: true });
  const E = o => ({ org_id: ORG, customer_id: cid, status: 'shared', metadata: { demo: true }, attendees: [], tags: [], pinned: false, owner_name: 'Greatstone', phase: null, summary: null, body_html: null, external_url: null, ...o });
  const journey = [
    E({ kind: 'kickoff', occurred_on: '2026-04-02', phase: 'Discovery', pinned: true, title: 'Kickoff — your digital north star', summary: 'Agreed the outcome, the eight-pillar baseline and the discovery plan.', attendees: ['John Prempeh', 'Greatstone'], body_html: recap('We set what summit we are climbing toward and how we will measure the ascent.', ['Agreed the north-star outcome and success metrics.', 'Walked the eight-pillar method and your starting position.'], ['Run discovery and deliver the maturity baseline.']) }),
    E({ kind: 'recap', occurred_on: '2026-04-20', phase: 'Discovery', title: 'Discovery — current-state audit', summary: 'Mapped the current stack and the highest-friction points.', body_html: recap('A working session mapping today’s tooling and where it costs you time.', ['Surfaced the top friction points across sales and ops.', 'Prioritised a unified platform + self-serve accounts.'], ['Draft the maturity report and 3-horizon roadmap.']) }),
    E({ kind: 'milestone', occurred_on: '2026-05-06', phase: 'Discovery', pinned: true, title: 'Discovery complete — baseline set', summary: 'Maturity scorecard delivered; first ascent agreed.' }),
    E({ kind: 'deliverable', occurred_on: '2026-05-18', phase: 'Build', title: 'Platform preview — staging', summary: 'The new platform on the interim stack. Open it to explore the live catalogue.', external_url: 'https://greatstone-catalogue.netlify.app/products.html', tags: ['platform'] }),
    E({ kind: 'recap', occurred_on: '2026-06-10', phase: 'Adoption', pinned: false, title: 'Adoption review', summary: 'Reviewed early adoption and agreed the launch checklist.', attendees: ['John Prempeh', 'Greatstone'], body_html: recap('A checkpoint on momentum and what is left before launch.', ['Team trained on the new admin.', 'Early self-serve activity flowing.'], ['Complete the go-live runbook; book launch.']) }),
    E({ kind: 'review', occurred_on: '2026-07-08', phase: 'Review', title: 'Quarterly business review (Q3)', summary: 'Outcomes vs the roadmap and next-horizon planning.', attendees: ['John Prempeh', 'Greatstone'] }),
  ];
  const ie = await a.from('engagements').insert(journey); if (ie.error) throw ie.error;
  console.log('engagements: ' + journey.length);

  // one order so the spend/analytics show
  await a.from('orders').delete().eq('customer_id', cid).like('reference', 'GS-JP-%');
  const { data: ord, error: oe } = await a.from('orders').insert({ org_id: ORG, customer_id: cid, customer_user_id: cuid, customer_email: EMAIL, reference: 'GS-JP-0001', status: 'fulfilled', currency: 'GBP', subtotal_minor: 1200000, total_minor: 1440000, placed_at: '2026-05-22T10:00:00Z' }).select('id').single();
  if (oe) throw oe;
  await a.from('order_items').insert({ org_id: ORG, order_id: ord.id, offering_name: 'Bedrock Platform', variant_name: 'Site licence', qty: 1, unit_price_minor: 1200000, line_total_minor: 1200000, currency: 'GBP' });
  console.log('orders: 1');

  console.log('\n✅ done. Sign in at #account as:');
  console.log('   ' + EMAIL + '  /  ' + PW + '   (admin of Prempeh Digital) — then change the password in Security.');
}
run().catch(e => { console.error('❌', e.message); process.exit(1); });
