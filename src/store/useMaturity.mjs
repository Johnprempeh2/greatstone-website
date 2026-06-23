import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.mjs';
import { isDemoCompany, DEMO_ASSESSMENT } from '../data/maturity-seed.mjs';

// Shared loader for a company's latest maturity assessment. Reads Supabase `maturity_assessments` (guarded
// so the dormant 0019 table resolves to nothing without a console error), then falls back to the seeded
// DEMO_ASSESSMENT for the demo company only, else an empty state. Used by BOTH the #org Maturity Radar and
// the rules-based "Your next move" card so they always agree on the same numbers.
// Returns { status: 'loading'|'ready'|'empty', data, source: 'live'|'sample'|null }.
export function useMaturity(company) {
  const [state, setState] = useState({ status: 'loading', data: null, source: null });
  useEffect(() => {
    let alive = true;
    (async () => {
      let row = null;
      try {
        const { data, error } = await supabase
          .from('maturity_assessments')
          .select('assessed_on, tier, scores, benchmark, target, baseline, notes')
          .eq('customer_id', company.id).is('deleted_at', null)
          .order('assessed_on', { ascending: false }).limit(1);
        if (!error && Array.isArray(data) && data.length) row = data[0];   // table present + a row → live
      } catch { /* table absent (0019 dormant) → fall through to seed / empty, no console noise */ }
      if (!alive) return;
      if (row && row.scores) setState({ status: 'ready', data: row, source: 'live' });
      else if (isDemoCompany(company)) setState({ status: 'ready', data: DEMO_ASSESSMENT, source: 'sample' });
      else setState({ status: 'empty', data: null, source: null });
    })();
    return () => { alive = false; };
  }, [company.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
