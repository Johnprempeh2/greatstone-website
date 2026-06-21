import { createClient } from '@supabase/supabase-js';
const URL = process.env.VITE_SUPABASE_URL, ANON = process.env.VITE_SUPABASE_ANON_KEY;
const c = createClient(URL, ANON, { auth: { persistSession: false } });
const { error: se } = await c.auth.signInWithPassword({ email: 'demo-client@greatstone.dev', password: 'stone' });
if (se) { console.error('signin failed:', se.message); process.exit(1); }
console.log('signed in as demo-client@greatstone.dev (a buyer)\n');
const eng = await c.from('engagements').select('id,kind,status,title,occurred_on').order('occurred_on');
console.log('READ engagements ->', eng.error ? 'ERR '+eng.error.message : `${eng.data.length} rows (expect 10)`);
const drafts = (eng.data||[]).filter(e=>e.status!=='shared'); console.log('  non-shared visible (must be 0):', drafts.length);
const cu = await c.from('customer_users').select('id,email,role,is_primary');
console.log('READ customer_users ->', cu.error ? 'ERR '+cu.error.message : `${cu.data.length} (expect 2: company members)`);
const cust = await c.from('customers').select('id,name,domain,tier:customer_tiers(name)');
console.log('READ customers ->', cust.error ? 'ERR '+cust.error.message : `${cust.data.length} "${cust.data[0]?.name}" tier=${cust.data[0]?.tier?.name}`);
const ord = await c.from('orders').select('id,reference,total_minor,status').order('placed_at');
console.log('READ orders ->', ord.error ? 'ERR '+ord.error.message : `${ord.data.length} (expect 2)`);
// ADVERSARIAL: a buyer must NOT be able to write an engagement
const ins = await c.from('engagements').insert({ org_id:'11111111-1111-4111-8111-111111111111', customer_id: cust.data[0].id, kind:'note', title:'HACK', status:'shared' }).select();
console.log('\nADVERSARIAL buyer INSERT engagement -> ', ins.error ? 'BLOCKED ✅ ('+ins.error.message.slice(0,60)+')' : 'ALLOWED ❌ LEAK');
// ADVERSARIAL: a buyer must NOT self-promote role
const meId = cu.data?.find(u=>u.email==='demo-client@greatstone.dev')?.id;
const esc = await c.from('customer_users').update({ role:'admin', is_primary:true }).eq('id', cu.data?.find(u=>u.email==='demo-member@greatstone.dev')?.id || meId);
console.log('ADVERSARIAL buyer escalate another member -> ', esc.error ? 'BLOCKED ✅' : 'CHECK (no error; may be no-op under RLS)');
