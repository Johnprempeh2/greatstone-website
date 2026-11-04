// GRE-1861: the intelligence dashboard island. The public snapshot is read on the server and passed to
// the browser component, so only pages that place the island carry the data.
import snapshot from '../next-proof/data/intelligence-snapshot.json';
import IntelDashboard from './IntelDashboard.jsx';

export default function IntelDashboardIsland({ tab }) {
  return <IntelDashboard data={snapshot} tab={tab} />;
}
