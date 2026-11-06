import { useState, useEffect } from 'react';
import { isDemoCompany, DEMO_ASSESSMENT } from '../data/maturity-seed.mjs';

// Shared loader for a company's latest maturity assessment. maturity_assessments (0019) is dormant and was not
// moved with the data (GRE-1992), so this shows the seeded DEMO_ASSESSMENT for the demo company only, else an
// empty state. Used by BOTH the #org Maturity Radar and the rules-based "Your next move" card so they agree.
// Returns { status: 'loading'|'ready'|'empty', data, source: 'live'|'sample'|null }.
export function useMaturity(company) {
  const [state, setState] = useState({ status: 'loading', data: null, source: null });
  useEffect(() => {
    if (isDemoCompany(company)) setState({ status: 'ready', data: DEMO_ASSESSMENT, source: 'sample' });
    else setState({ status: 'empty', data: null, source: null });
  }, [company.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
