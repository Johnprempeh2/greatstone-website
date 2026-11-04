// GRE-1861: the intelligence dashboard island. The public snapshot is read on the server and passed to
// the browser component, so only pages that place the island carry the data. The news pictures and their
// alt text are edited in next-proof/data/intelligence-images.json, one per topic.
import snapshot from '../next-proof/data/intelligence-snapshot.json';
import images from '../next-proof/data/intelligence-images.json';
import IntelDashboard from './IntelDashboard.jsx';

export default function IntelDashboardIsland({ tab }) {
  return <IntelDashboard data={snapshot} images={images} tab={tab} />;
}
